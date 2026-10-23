import assert from 'node:assert/strict';

const port = Number(process.env.CDP_PORT || 9227);
const url = process.env.TRAINING_URL || 'http://127.0.0.1:4177/call-response-training/?mode=teaching&debug=1';
const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const page = pages.find((entry) => entry.type === 'page' && /call-response-training/.test(entry.url))
  || pages.find((entry) => entry.type === 'page');
assert(page, '没有可用的浏览器页面');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
const errors = [];
const networkErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const handler = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  } else if (message.method === 'Network.loadingFailed'
    && !message.params.canceled
    && message.params.errorText !== 'net::ERR_ABORTED') {
    networkErrors.push(message.params.errorText);
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const response = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result.value;
}

await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Network.enable')]);
if (page.url !== url) await send('Page.navigate', { url });
await evaluate(`new Promise((resolve,reject)=>{
  const started=Date.now();
  const timer=setInterval(()=>{
    if(window.__routeScene?.ready&&window.__callResponseAssessment?.current(window.__trainingSim.state)){
      clearInterval(timer);resolve(true);
    }else if(Date.now()-started>45000){
      clearInterval(timer);reject(new Error('呼唤应答页面初始化超时'));
    }
  },100);
})`, true);

// 模拟教师在第一题出现后讲解10秒，再作答。第一题反馈期间第二题必须保持
// pending；反馈结束后第二题面板必须正常出现，不能成为隐藏的active事件。
await new Promise((resolve) => setTimeout(resolve, 10000));
const beforeAnswer = await evaluate(`(()=>{
  const state=window.__trainingSim.state;
  const current=window.__callResponseAssessment.current(state);
  return {id:current.config.id,frozen:state.callResponse.frozen,panelHidden:document.querySelector('#call-response-panel').hidden};
})()`);
assert.equal(beforeAnswer.frozen, true);
assert.equal(beforeAnswer.panelHidden, false);

await evaluate(`new Promise((resolve,reject)=>{
  const started=Date.now();
  const timer=setInterval(()=>{
    const state=window.__trainingSim.state;
    const current=window.__callResponseAssessment.current(state);
    const panel=document.querySelector('#call-response-panel');
    const expected=current.event.role==='操纵司机'?current.config.driverText:current.config.assistantText;
    const button=[...panel.querySelectorAll('[data-call-answer]')].find((item)=>item.textContent===expected);
    if(button&&!button.disabled){clearInterval(timer);button.click();resolve(true);}
    else if(button&&Date.now()-started>3000){
      // 无声卡的CI浏览器不会结束开场提示音；这里只绕过提示音等待，仍通过
      // 真实按钮进入作答/反馈状态机。
      window.__callResponseAssessment.startAnswerWindow(current.config.id,state);
      panel.querySelectorAll('[data-call-answer]').forEach((item)=>{item.disabled=false;});
      clearInterval(timer);button.click();resolve(true);
    }
    else if(Date.now()-started>15000){clearInterval(timer);reject(new Error('第一题答案按钮未就绪'));}
  },100);
})`, true);

await new Promise((resolve) => setTimeout(resolve, 500));
const duringFeedback = await evaluate(`(()=>{const state=window.__trainingSim.state;return {
  feedbackPending:state.callResponse.feedbackPending,
  activeEventId:state.callResponse.activeEventId,
  nextStatus:state.callResponse.events['departure-ready'].status,
  panelHidden:document.querySelector('#call-response-panel').hidden,
};})()`);
assert.equal(duringFeedback.feedbackPending, true);
assert.equal(duringFeedback.activeEventId, null);
assert.equal(duringFeedback.nextStatus, 'pending');
assert.equal(duringFeedback.panelHidden, false);

const resourceSummary = await evaluate(`(()=>{
  const resources=performance.getEntriesByType('resource');
  const json=resources.filter((item)=>/msts-neiyi.*\\.json|lookout-.*\\.json/.test(item.name));
  const audio=resources.filter((item)=>/assets\\/audio\\/call-response\\/.*\\.wav/.test(item.name));
  return {
    jsonRequests:json.length,
    jsonTransferBytes:Math.round(json.reduce((sum,item)=>sum+(item.transferSize||0),0)),
    jsonDecodedBytes:Math.round(json.reduce((sum,item)=>sum+(item.decodedBodySize||0),0)),
    audioRequests:audio.length,
    audioDurations:audio.map((item)=>Math.round(item.duration)),
  };
})()`);
assert(resourceSummary.jsonRequests >= 5, '三维场景核心JSON请求数量异常');
assert(resourceSummary.audioRequests >= 1, '呼唤应答语音没有发起加载');
assert.deepEqual(errors, []);
assert.deepEqual(networkErrors, []);
socket.close();

console.log(JSON.stringify({ beforeAnswer, duringFeedback, resourceSummary }, null, 2));
