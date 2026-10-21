export const CALL_RESPONSE_ROLES = Object.freeze({
  DRIVER: 'driver',
  ASSISTANT: 'assistant',
});

const DRIVER_DISTRACTORS = Object.freeze([
  '绿灯', '绿黄灯', '黄灯，减速', '红灯，停车', '绿灯，出站好了',
  '正点开车', '后部好了', '对标好了', '各仪表显示正常', '尾部风压600千帕',
  '单弓好了', '断电好了', '闭合好了', '车位正确', '黄灯，正线',
]);

const ASSISTANT_DISTRACTORS = Object.freeze([
  '出站信号', '通过信号', '进站信号', '确认开车时刻', '后部注意',
  '注意对标', '仪表注意', '列尾查询', '禁止双弓', '断电', '闭合', '确认车位',
]);

const callEvent = (definition) => {
  const routeTarget = definition.targetKind === 'signal' || definition.targetKind === 'route-sign';
  return Object.freeze({
    clickStartDistance: definition.distance - (routeTarget ? 150 : 130),
    teachingTriggerDistance: definition.distance - (routeTarget ? 75 : 35),
    expireDistance: definition.distance + (routeTarget ? 35 : 90),
    answerWindowSeconds: 8,
    targetId: definition.id,
    ...definition,
  });
};

export const CALL_RESPONSE_TRAINING_CONFIG = Object.freeze({
  title: 'HXD1C两站一区间确认呼唤（应答）训练',
  routeLabel: '始发站—前方站 · 两站一区间',
  finishDistance: 6750,
  teachingFeedbackSeconds: 3,
  events: Object.freeze([
    callEvent({
      id: 'departure', targetKind: 'signal', targetId: 'departure', signalId: '6119',
      label: '始发站6119出站信号机', distance: 454.14,
      teachingTriggerDistance: 315, clickStartDistance: 120,
      aspect: 'green', driverText: '绿灯，出站好了', assistantText: '出站信号', repeatText: '绿灯，出站好了', weight: 8,
    }),
    callEvent({
      id: 'departure-time', targetKind: 'cab', targetId: 'cab-clock', signalId: '时刻',
      label: '起动后确认开车时刻', distance: 620,
      driverText: '正点开车', assistantText: '确认开车时刻', repeatText: '好了', weight: 4,
    }),
    callEvent({
      id: 'rear-lookout', targetKind: 'view', targetId: 'rear-view', signalId: '后部',
      label: '起动列车后部瞭望', distance: 780,
      driverText: '后部好了', assistantText: '后部注意', repeatText: '后部好了', weight: 4,
    }),
    callEvent({
      id: 'departure-align', targetKind: 'cab', targetId: 'lkj', signalId: '对标',
      label: '出站开车对标', distance: 940,
      driverText: '对标好了', assistantText: '注意对标', repeatText: '好了', weight: 4,
    }),
    callEvent({
      id: 'instrument-check', targetKind: 'cab', targetId: 'cab-instruments', signalId: '仪表',
      label: '出站后仪表确认', distance: 1090,
      driverText: '各仪表显示正常', assistantText: '仪表注意', repeatText: '', weight: 5,
    }),
    callEvent({
      id: 'departure-tail-pressure', targetKind: 'cab', targetId: 'cir', signalId: '列尾',
      label: '出站后列尾查询', distance: 1260,
      driverText: '尾部风压600千帕', assistantText: '列尾查询', repeatText: '好了', weight: 5,
    }),
    callEvent({
      id: 'phase-no-double-panto', targetKind: 'route-sign', targetId: 'phase-no-double-panto', signalId: '禁止双弓',
      label: '禁止双弓标', distance: 1590.9,
      clickStartDistance: 1490, teachingTriggerDistance: 1535, expireDistance: 1625,
      driverText: '单弓好了', assistantText: '禁止双弓', repeatText: '好了', weight: 5,
    }),
    callEvent({
      id: 'phase-power-off', targetKind: 'route-sign', targetId: 'phase-power-off', signalId: '断电',
      label: '分相断电标', distance: 1646.8,
      clickStartDistance: 1570, teachingTriggerDistance: 1605, expireDistance: 1685,
      driverText: '断电好了', assistantText: '断电', repeatText: '好了', weight: 5,
    }),
    callEvent({
      id: 'phase-power-on', targetKind: 'route-sign', targetId: 'phase-power-on', signalId: '合电',
      label: '越过分相合电标', distance: 1729.1,
      clickStartDistance: 1640, teachingTriggerDistance: 1685, expireDistance: 1765,
      driverText: '闭合好了', assistantText: '闭合', repeatText: '好了', weight: 5,
    }),
    ...[
      ['2328', 1800], ['2316', 2800], ['2302', 3800], ['2288', 4800], ['2274', 5800],
    ].map(([id, distance]) => callEvent({
      id, targetKind: 'signal', targetId: id, signalId: id,
      label: `${id}通过信号机`, distance, aspect: 'green',
      driverText: '绿灯', assistantText: '通过信号', repeatText: '绿灯', weight: 5,
    })),
    callEvent({
      id: 'pre-entry-position', targetKind: 'cab', targetId: 'lkj', signalId: '车位',
      label: '进站信号前确认车位', distance: 6070,
      driverText: '车位正确', assistantText: '确认车位', repeatText: '车位正确', weight: 5,
    }),
    callEvent({
      id: 'arrival-entry', targetKind: 'signal', targetId: 'arrival-entry', signalId: 'X2',
      label: '前方站X2进站信号机', distance: 6380,
      teachingTriggerDistance: 6345, clickStartDistance: 6250, expireDistance: 6415,
      aspect: 'yellow', driverText: '黄灯，正线', assistantText: '进站信号', repeatText: '黄灯，正线', weight: 10,
    }),
    callEvent({
      id: 'entry-tail-pressure', targetKind: 'cab', targetId: 'cir', signalId: '列尾',
      label: '进站信号机前列尾查询', distance: 6470,
      driverText: '尾部风压600千帕', assistantText: '列尾查询', repeatText: '好了', weight: 5,
    }),
    callEvent({
      id: 'station-position', targetKind: 'cab', targetId: 'lkj', signalId: '车位',
      label: '越过进站信号机确认车位', distance: 6600,
      driverText: '车位正确', assistantText: '确认车位', repeatText: '好了', weight: 10,
    }),
  ]),
  driverDistractors: DRIVER_DISTRACTORS,
  assistantDistractors: ASSISTANT_DISTRACTORS,
});

export function getCallResponseEvent(id) {
  return CALL_RESPONSE_TRAINING_CONFIG.events.find((item) => item.id === id) || null;
}

export function expectedCallResponseText(config, role) {
  return role === CALL_RESPONSE_ROLES.DRIVER ? config.driverText : config.assistantText;
}

export function rolePrompt(role) {
  return role === CALL_RESPONSE_ROLES.DRIVER
    ? '请听非操纵司机呼唤，然后选择操纵司机的标准应答'
    : '请选择非操纵司机的标准呼唤内容';
}

export function fullCallResponseSequence(config) {
  return Object.freeze([
    Object.freeze({ role: '非操纵司机', text: config.assistantText }),
    Object.freeze({ role: '操纵司机', text: config.driverText }),
    config.repeatText ? Object.freeze({ role: '非操纵司机', text: config.repeatText }) : null,
  ].filter(Boolean));
}

export function driverResponseSequence(config) {
  return Object.freeze([
    Object.freeze({ role: '操纵司机', text: config.driverText }),
    config.repeatText ? Object.freeze({ role: '非操纵司机', text: config.repeatText }) : null,
  ].filter(Boolean));
}
