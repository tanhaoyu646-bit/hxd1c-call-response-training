import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  CallResponseAssessment,
  createCallResponseAttempt,
  scoreCallResponseAttempt,
} from '../scripts/callResponseAssessment.js';
import {
  CALL_RESPONSE_ROLES,
  CALL_RESPONSE_TRAINING_CONFIG,
  expectedCallResponseText,
  fullCallResponseSequence,
} from '../scripts/callResponseConfig.js';
import { callResponseAudioFile } from '../scripts/callResponseAudio.js';

const makeState = (mode) => ({
  trainingMode: mode,
  distance: 0,
  elapsed: 0,
  completed: false,
  speed: 0,
  traction: 0,
});

function wavDurationSeconds(fileUrl) {
  const buffer = readFileSync(fileUrl);
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WAVE');
  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') byteRate = buffer.readUInt32LE(offset + 16);
    if (id === 'data') { dataBytes = size; break; }
    offset += 8 + size + (size % 2);
  }
  assert(byteRate > 0 && dataBytes > 0, `invalid WAV chunks: ${fileUrl}`);
  return dataBytes / byteRate;
}

{
  const attempt = createCallResponseAttempt(() => 0.25);
  const roles = Object.values(attempt.events).map((event) => event.role);
  assert.equal(roles.filter((role) => role === CALL_RESPONSE_ROLES.DRIVER).length, 10);
  assert.equal(roles.filter((role) => role === CALL_RESPONSE_ROLES.ASSISTANT).length, 9);
  assert.equal(CALL_RESPONSE_TRAINING_CONFIG.events.reduce((total, config) => total + config.weight, 0), 100);
  assert.deepEqual(
    CALL_RESPONSE_TRAINING_CONFIG.events.filter((config) => config.targetKind === 'route-sign').map((config) => config.id),
    ['phase-no-double-panto', 'phase-power-off', 'phase-power-on'],
  );
  assert.equal(CALL_RESPONSE_TRAINING_CONFIG.events.find((config) => config.id === '2274').aspect, 'greenYellow');
  assert.equal(CALL_RESPONSE_TRAINING_CONFIG.events.find((config) => config.id === 'station-position').distance, 6708);
  const throughConfigs = CALL_RESPONSE_TRAINING_CONFIG.events.filter((config) => config.targetKind === 'signal' && /^22|^23/.test(config.id));
  assert.equal(new Set(throughConfigs.map((config) => config.driverDistractors.join('|'))).size, 5);
  assert.equal(new Set(throughConfigs.map((config) => config.assistantDistractors.join('|'))).size, 5);
  for (const config of CALL_RESPONSE_TRAINING_CONFIG.events) {
    const event = attempt.events[config.id];
    assert.equal(event.options.length, 4);
    assert.equal(new Set(event.options).size, 4);
    assert.ok(event.options.includes(expectedCallResponseText(config, event.role)));
    for (const line of fullCallResponseSequence(config)) {
      const file = callResponseAudioFile(line);
      assert.ok(file, `missing audio mapping for ${line.role}: ${line.text}`);
      const fileUrl = new URL(`../assets/audio/call-response/${file}`, import.meta.url);
      assert.ok(existsSync(fileUrl), `missing audio file ${file}`);
      const duration = wavDurationSeconds(fileUrl);
      assert(duration >= 1 && duration <= 8, `invalid audio duration ${duration.toFixed(2)}s: ${file}`);
    }
  }
}

{
  const state = makeState('teaching');
  const assessment = new CallResponseAssessment(state, { random: () => 0.25 });
  const config = CALL_RESPONSE_TRAINING_CONFIG.events[0];
  state.distance = config.teachingTriggerDistance;
  const opened = assessment.update(state);
  assert.equal(opened.type, 'open');
  assert.equal(assessment.isFrozen(state), true);
  const event = state.callResponse.events[config.id];
  if (event.role === CALL_RESPONSE_ROLES.DRIVER) assessment.startAnswerWindow(config.id, state);
  const wrong = event.options.find((option) => option !== expectedCallResponseText(config, event.role));
  const answered = assessment.answer(wrong, state);
  assert.equal(answered.correct, false);
  assert.equal(event.earned, 0);
  assert.equal(assessment.isFrozen(state), true);
  assert.equal(state.callResponse.feedbackPending, true);

  // 模拟教师在第一题面板上讲解20秒后才作答；在结果和整段语音反馈尚未结束前，
  // 相同位置的下一题不得被后台提前打开。
  state.elapsed = 20;
  assert.equal(assessment.update(state), null);
  assert.equal(state.callResponse.events[CALL_RESPONSE_TRAINING_CONFIG.events[1].id].status, 'pending');
  assessment.completeTeachingFeedback(state);
  assert.equal(assessment.isFrozen(state), false);
  assert.equal(state.callResponse.feedbackPending, false);
  assert.equal(assessment.update(state).config.id, CALL_RESPONSE_TRAINING_CONFIG.events[1].id);
}

{
  const state = makeState('assessment');
  const assessment = new CallResponseAssessment(state, { random: () => 0.25 });
  state.speed = 1;
  state.distance = 2;
  const missed = assessment.update(state);
  assert.equal(state.callResponse.events.departure.status, 'missed');
  assert.equal(state.callResponse.events['departure-ready'].status, 'missed');
  assert.equal(missed.config.id, 'departure-ready');
  assert.equal(missed.type, 'missed');
}

{
  const state = makeState('assessment');
  const assessment = new CallResponseAssessment(state, { random: () => 0.25 });
  for (const id of ['departure', 'departure-ready']) state.callResponse.events[id].status = 'correct';
  state.distance = 80;
  state.speed = 4;
  state.traction = 1;
  assert.equal(assessment.selectTarget('rear-view', state).type, 'early-click');
  state.traction = 2;
  assert.equal(assessment.selectTarget('rear-view', state).type, 'open');
}

{
  const state = makeState('assessment');
  const assessment = new CallResponseAssessment(state, { random: () => 0.25 });
  const first = CALL_RESPONSE_TRAINING_CONFIG.events[0];
  state.distance = first.clickStartDistance;
  assert.equal(assessment.selectTarget('2328', state).type, 'wrong-target');
  assert.equal(state.callResponse.events[first.id].misclicks, 1);
  const opened = assessment.selectTarget(first.targetId, state);
  assert.equal(opened.type, 'open');
  if (opened.event.role === CALL_RESPONSE_ROLES.DRIVER) assessment.startAnswerWindow(first.id, state);
  state.elapsed = 9;
  const missed = assessment.update(state);
  assert.equal(missed.type, 'missed');
  assert.equal(state.callResponse.events[first.id].earned, 0);
}

{
  const state = makeState('assessment');
  const assessment = new CallResponseAssessment(state, { random: () => 0.25 });
  for (const config of CALL_RESPONSE_TRAINING_CONFIG.events) {
    state.distance = config.distance;
    state.speed = config.triggerKind === 'stationary' ? 0 : 20;
    state.traction = config.triggerKind === 'traction-moving' ? 2 : 3;
    let opened = assessment.selectTarget(config.targetId, state);
    if (opened.type === 'armed') {
      assert.equal(config.id, 'phase-power-on');
      state.distance = config.deferUntilDistance;
      opened = assessment.update(state);
    }
    assert.equal(opened.type, 'open');
    if (opened.event.role === CALL_RESPONSE_ROLES.DRIVER) assessment.startAnswerWindow(config.id, state);
    const expected = expectedCallResponseText(config, opened.event.role);
    assert.equal(assessment.answer(expected, state).correct, true);
  }
  state.distance = CALL_RESPONSE_TRAINING_CONFIG.finishDistance;
  const finished = assessment.update(state);
  assert.equal(finished.type, 'finished');
  assert.equal(state.completed, true);
  assert.deepEqual(scoreCallResponseAttempt(state.callResponse), {
    score: 100,
    correct: 19,
    wrong: 0,
    missed: 0,
    pending: 0,
  });
}

console.log('call-response assessment tests passed');
