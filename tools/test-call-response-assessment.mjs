import assert from 'node:assert/strict';
import {
  CallResponseAssessment,
  createCallResponseAttempt,
  scoreCallResponseAttempt,
} from '../scripts/callResponseAssessment.js';
import {
  CALL_RESPONSE_ROLES,
  CALL_RESPONSE_TRAINING_CONFIG,
  expectedCallResponseText,
} from '../scripts/callResponseConfig.js';

const makeState = (mode) => ({
  trainingMode: mode,
  distance: 0,
  elapsed: 0,
  completed: false,
});

{
  const attempt = createCallResponseAttempt(() => 0.25);
  const roles = Object.values(attempt.events).map((event) => event.role);
  assert.equal(roles.filter((role) => role === CALL_RESPONSE_ROLES.DRIVER).length, 9);
  assert.equal(roles.filter((role) => role === CALL_RESPONSE_ROLES.ASSISTANT).length, 9);
  assert.equal(CALL_RESPONSE_TRAINING_CONFIG.events.reduce((total, config) => total + config.weight, 0), 100);
  assert.deepEqual(
    CALL_RESPONSE_TRAINING_CONFIG.events.filter((config) => config.targetKind === 'route-sign').map((config) => config.id),
    ['phase-no-double-panto', 'phase-power-off', 'phase-power-on'],
  );
  for (const config of CALL_RESPONSE_TRAINING_CONFIG.events) {
    const event = attempt.events[config.id];
    assert.equal(event.options.length, 4);
    assert.equal(new Set(event.options).size, 4);
    assert.ok(event.options.includes(expectedCallResponseText(config, event.role)));
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
  assessment.completeTeachingFeedback(state);
  assert.equal(assessment.isFrozen(state), false);
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
    const opened = assessment.selectTarget(config.targetId, state);
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
    correct: 18,
    wrong: 0,
    missed: 0,
    pending: 0,
  });
}

console.log('call-response assessment tests passed');
