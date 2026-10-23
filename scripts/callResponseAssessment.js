import {
  CALL_RESPONSE_ROLES,
  CALL_RESPONSE_TRAINING_CONFIG,
  driverResponseSequence,
  expectedCallResponseText,
  fullCallResponseSequence,
  getCallResponseEvent,
} from './callResponseConfig.js?rev=call-response-v4';

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
    ? config.driverDistractors || CALL_RESPONSE_TRAINING_CONFIG.driverDistractors
    : config.assistantDistractors || CALL_RESPONSE_TRAINING_CONFIG.assistantDistractors;
  const distractors = shuffled([...new Set(bank.filter((item) => item !== correct))], random).slice(0, 3);
  return shuffled([correct, ...distractors], random);
}

export function createCallResponseAttempt(random = Math.random) {
  const roles = balancedRoles(CALL_RESPONSE_TRAINING_CONFIG.events.length, random);
  return {
    activeEventId: null,
    frozen: false,
    feedbackPending: false,
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
        armedAtDistance: null,
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
    state.callResponse.feedbackPending = false;
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

  eventIsEligible(config, state, purpose = 'click') {
    if (config.triggerKind === 'stationary') {
      return Math.abs(Number(state.speed || 0)) <= 0.3
        && Number(state.distance || 0) <= config.expireDistance;
    }
    if (config.triggerKind === 'traction-moving') {
      return Number(state.speed || 0) >= 0.5
        && Number(state.traction || 0) >= 1.95
        && Number(state.distance || 0) <= config.expireDistance;
    }
    const start = purpose === 'teaching' ? config.teachingTriggerDistance : config.clickStartDistance;
    return state.distance >= start && state.distance <= config.expireDistance;
  }

  eventHasExpired(config, state) {
    if (config.triggerKind === 'stationary') {
      return Math.abs(Number(state.speed || 0)) > 0.3 || Number(state.distance || 0) > config.expireDistance;
    }
    return Number(state.distance || 0) > config.expireDistance;
  }

  selectTarget(targetId, state) {
    if (!state?.callResponse || state.callResponse.finished) return null;
    if (state.trainingMode !== 'assessment') return { type: 'ignored' };
    if (state.callResponse.activeEventId) return { type: 'already-open' };
    const next = CALL_RESPONSE_TRAINING_CONFIG.events.find((config) => (
      ['pending', 'armed'].includes(state.callResponse.events[config.id].status)
    ));
    if (!next || !this.eventIsEligible(next, state, 'click')) {
      return { type: 'early-click', message: '当前尚未进入有效呼唤区间。' };
    }
    const event = state.callResponse.events[next.id];
    if (event.status === 'armed') return { type: 'already-armed', message: `${next.label}已确认，等待越过标志后呼唤。` };
    if (next.targetId !== targetId) {
      state.callResponse.misclicks += 1;
      event.misclicks += 1;
      return { type: 'wrong-target', message: `目标识别错误：当前应确认${next.label}。` };
    }
    if (Number.isFinite(next.deferUntilDistance) && state.distance < next.deferUntilDistance) {
      event.status = 'armed';
      event.armedAtDistance = state.distance;
      return { type: 'armed', config: next, event, message: `已确认${next.label}，越过标志后再进行“闭合”呼唤。` };
    }
    return this.open(next, state);
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
    state.callResponse.feedbackPending = state.trainingMode === 'teaching';
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
    state.callResponse.feedbackPending = false;
    state.callResponse.frozen = false;
  }

  markMissed(config, state) {
    const event = state.callResponse.events[config.id];
    if (!event || !['pending', 'active', 'armed'].includes(event.status)) return null;
    event.status = 'missed';
    event.correct = false;
    event.earned = 0;
    if (state.callResponse.activeEventId === config.id) state.callResponse.activeEventId = null;
    state.callResponse.feedbackPending = false;
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

    // 教学模式作答后还要播放完整反馈语音并展示结果。该阶段不允许后台提前
    // 激活下一题，否则旧题关闭面板时会把新题一起隐藏，留下“已激活但不可见”
    // 的事件并永久阻塞后续呼唤。
    if (state.callResponse.feedbackPending) return null;

    const armedConfig = CALL_RESPONSE_TRAINING_CONFIG.events.find((config) => (
      state.callResponse.events[config.id].status === 'armed'
    ));
    if (armedConfig) {
      if (state.distance >= armedConfig.deferUntilDistance) return this.open(armedConfig, state);
      if (this.eventHasExpired(armedConfig, state)) return this.markMissed(armedConfig, state);
      return null;
    }

    let latest = null;
    for (const config of CALL_RESPONSE_TRAINING_CONFIG.events) {
      const event = state.callResponse.events[config.id];
      if (event.status !== 'pending') continue;
      if (this.eventHasExpired(config, state)) {
        latest = this.markMissed(config, state);
        continue;
      }
      if (state.trainingMode === 'teaching' && this.eventIsEligible(config, state, 'teaching')) {
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
