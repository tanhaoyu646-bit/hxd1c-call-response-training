import {
  CALL_RESPONSE_ROLES,
  CALL_RESPONSE_TRAINING_CONFIG,
  driverResponseSequence,
  expectedCallResponseText,
  fullCallResponseSequence,
  getCallResponseEvent,
} from './callResponseConfig.js';

function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

function balancedRoles(count, random = Math.random) {
  const first = random() < 0.5 ? CALL_RESPONSE_ROLES.DRIVER : CALL_RESPONSE_ROLES.ASSISTANT;
  const second = first === CALL_RESPONSE_ROLES.DRIVER ? CALL_RESPONSE_ROLES.ASSISTANT : CALL_RESPONSE_ROLES.DRIVER;
  return shuffled(Array.from({ length: count }, (_, index) => (index % 2 === 0 ? first : second)), random);
}

function buildOptions(config, role, random = Math.random) {
  const correct = expectedCallResponseText(config, role);
  const bank = role === CALL_RESPONSE_ROLES.DRIVER
    ? CALL_RESPONSE_TRAINING_CONFIG.driverDistractors
    : CALL_RESPONSE_TRAINING_CONFIG.assistantDistractors;
  const distractors = shuffled([...new Set(bank.filter((item) => item !== correct))], random).slice(0, 3);
  return shuffled([correct, ...distractors], random);
}

export function createCallResponseAttempt(random = Math.random) {
  const roles = balancedRoles(CALL_RESPONSE_TRAINING_CONFIG.events.length, random);
  return {
    activeEventId: null,
    frozen: false,
    finished: false,
    resultShown: false,
    misclicks: 0,
    events: Object.fromEntries(CALL_RESPONSE_TRAINING_CONFIG.events.map((config, index) => {
      const role = roles[index];
      return [config.id, {
        id: config.id,
        status: 'pending',
        role,
        options: buildOptions(config, role, random),
        answer: '',
        correct: false,
        earned: 0,
        openedAtDistance: null,
        answeredAtDistance: null,
        deadlineElapsed: null,
        answerReady: role === CALL_RESPONSE_ROLES.ASSISTANT,
        misclicks: 0,
      }];
    })),
  };
}

export function scoreCallResponseAttempt(attempt) {
  if (!attempt) return { score: 0, correct: 0, wrong: 0, missed: 0, pending: CALL_RESPONSE_TRAINING_CONFIG.events.length };
  const summary = { score: 0, correct: 0, wrong: 0, missed: 0, pending: 0 };
  for (const config of CALL_RESPONSE_TRAINING_CONFIG.events) {
    const event = attempt.events[config.id];
    summary.score += Number(event?.earned || 0);
    if (event?.status === 'correct') summary.correct += 1;
    else if (event?.status === 'wrong') summary.wrong += 1;
    else if (event?.status === 'missed') summary.missed += 1;
    else summary.pending += 1;
  }
  return summary;
}

export class CallResponseAssessment {
  constructor(state, options = {}) {
    this.random = options.random || Math.random;
    if (!state.callResponse) state.callResponse = createCallResponseAttempt(this.random);
  }

  isFrozen(state) {
    return Boolean(state?.callResponse?.frozen);
  }

  current(state) {
    const id = state?.callResponse?.activeEventId;
    const config = getCallResponseEvent(id);
    const event = id ? state.callResponse.events[id] : null;
    return config && event ? { config, event } : null;
  }

  open(config, state) {
    const event = state.callResponse.events[config.id];
    event.status = 'active';
    event.openedAtDistance = state.distance;
    event.answerReady = event.role === CALL_RESPONSE_ROLES.ASSISTANT;
    event.deadlineElapsed = state.trainingMode === 'assessment' && event.answerReady
      ? state.elapsed + config.answerWindowSeconds
      : null;
    state.callResponse.activeEventId = config.id;
    state.callResponse.frozen = state.trainingMode === 'teaching';
    return { type: 'open', config, event };
  }

  startAnswerWindow(eventId, state) {
    const current = this.current(state);
    if (!current || current.config.id !== eventId) return false;
    current.event.answerReady = true;
    current.event.deadlineElapsed = state.trainingMode === 'assessment'
      ? state.elapsed + current.config.answerWindowSeconds
      : null;
    return true;
  }

  selectTarget(targetId, state) {
    if (!state?.callResponse || state.callResponse.finished) return null;
    if (state.trainingMode !== 'assessment') return { type: 'ignored' };
    if (state.callResponse.activeEventId) return { type: 'already-open' };
    const eligible = CALL_RESPONSE_TRAINING_CONFIG.events.find((config) => {
      const event = state.callResponse.events[config.id];
      return event.status === 'pending'
        && state.distance >= config.clickStartDistance
        && state.distance <= config.expireDistance;
    });
    if (!eligible) return { type: 'early-click', message: '当前尚未进入有效呼唤区间。' };
    if (eligible.targetId !== targetId) {
      state.callResponse.misclicks += 1;
      state.callResponse.events[eligible.id].misclicks += 1;
      return { type: 'wrong-target', message: `目标识别错误：当前应确认${eligible.label}。` };
    }
    return this.open(eligible, state);
  }

  selectSignal(signalId, state) {
    return this.selectTarget(signalId, state);
  }

  answer(selectedText, state) {
    const current = this.current(state);
    if (!current || !current.event.answerReady) return null;
    const { config, event } = current;
    const expected = expectedCallResponseText(config, event.role);
    event.answer = String(selectedText || '');
    event.correct = event.answer === expected;
    event.earned = event.correct ? config.weight : 0;
    event.status = event.correct ? 'correct' : 'wrong';
    event.answeredAtDistance = state.distance;
    state.callResponse.activeEventId = null;
    if (state.trainingMode !== 'teaching') state.callResponse.frozen = false;
    return {
      type: 'answer',
      config,
      event,
      correct: event.correct,
      expected,
      sequence: event.role === CALL_RESPONSE_ROLES.DRIVER
        ? driverResponseSequence(config)
        : fullCallResponseSequence(config),
    };
  }

  completeTeachingFeedback(state) {
    if (!state?.callResponse) return;
    state.callResponse.frozen = false;
  }

  markMissed(config, state) {
    const event = state.callResponse.events[config.id];
    if (!event || !['pending', 'active'].includes(event.status)) return null;
    event.status = 'missed';
    event.correct = false;
    event.earned = 0;
    if (state.callResponse.activeEventId === config.id) state.callResponse.activeEventId = null;
    state.callResponse.frozen = false;
    return { type: 'missed', config, event, message: `${config.label}未在规定区间完成呼唤，已记录失分。` };
  }

  update(state) {
    if (!state?.callResponse || state.callResponse.finished) return null;
    const current = this.current(state);
    if (current) {
      if (state.trainingMode === 'assessment'
        && current.event.deadlineElapsed != null
        && state.elapsed >= current.event.deadlineElapsed) {
        return this.markMissed(current.config, state);
      }
      return null;
    }

    let latest = null;
    for (const config of CALL_RESPONSE_TRAINING_CONFIG.events) {
      const event = state.callResponse.events[config.id];
      if (event.status !== 'pending') continue;
      if (state.distance > config.expireDistance) {
        latest = this.markMissed(config, state);
        continue;
      }
      if (state.trainingMode === 'teaching' && state.distance >= config.teachingTriggerDistance) {
        return this.open(config, state);
      }
      break;
    }

    const resolved = CALL_RESPONSE_TRAINING_CONFIG.events.every((config) => (
      ['correct', 'wrong', 'missed'].includes(state.callResponse.events[config.id].status)
    ));
    if (resolved && state.distance >= CALL_RESPONSE_TRAINING_CONFIG.finishDistance) {
      state.callResponse.finished = true;
      state.completed = true;
      return { type: 'finished', summary: scoreCallResponseAttempt(state.callResponse) };
    }
    return latest;
  }
}
