let activeSequence = 0;
let activeAudio = null;

const AUDIO_FILES = Object.freeze({
  '非操纵司机|出站信号': 'assistant-departure-signal.wav',
  '非操纵司机|绿灯，出站好了': 'assistant-green-departure-ok.wav',
  '非操纵司机|发车信号': 'assistant-departure-ready.wav',
  '非操纵司机|联控发车好了': 'assistant-dispatch-ready-ok.wav',
  '非操纵司机|确认开车时刻': 'assistant-confirm-departure-time.wav',
  '非操纵司机|好了': 'assistant-ok.wav',
  '非操纵司机|后部注意': 'assistant-rear-attention.wav',
  '非操纵司机|后部好了': 'assistant-rear-ok.wav',
  '非操纵司机|注意对标': 'assistant-align-attention.wav',
  '非操纵司机|仪表注意': 'assistant-instruments-attention.wav',
  '非操纵司机|列尾查询': 'assistant-tail-query.wav',
  '非操纵司机|禁止双弓': 'assistant-no-double-panto.wav',
  '非操纵司机|断电': 'assistant-power-off.wav',
  '非操纵司机|闭合': 'assistant-power-on.wav',
  '非操纵司机|通过信号': 'assistant-through-signal.wav',
  '非操纵司机|绿灯': 'assistant-green.wav',
  '非操纵司机|绿黄灯': 'assistant-green-yellow.wav',
  '非操纵司机|黄灯，减速': 'assistant-yellow-slow.wav',
  '非操纵司机|确认车位': 'assistant-confirm-position.wav',
  '非操纵司机|车位正确': 'assistant-position-correct.wav',
  '非操纵司机|进站信号': 'assistant-entry-signal.wav',
  '非操纵司机|黄灯，正线': 'assistant-yellow-mainline.wav',
  '操纵司机|绿灯，出站好了': 'driver-green-departure-ok.wav',
  '操纵司机|联控发车好了': 'driver-dispatch-ready-ok.wav',
  '操纵司机|正点开车': 'driver-departure-on-time.wav',
  '操纵司机|后部好了': 'driver-rear-ok.wav',
  '操纵司机|对标好了': 'driver-aligned.wav',
  '操纵司机|各仪表显示正常': 'driver-instruments-normal.wav',
  '操纵司机|尾部风压600千帕': 'driver-tail-pressure-600.wav',
  '操纵司机|单弓好了': 'driver-single-panto-ok.wav',
  '操纵司机|断电好了': 'driver-power-off-ok.wav',
  '操纵司机|闭合好了': 'driver-power-on-ok.wav',
  '操纵司机|绿灯': 'driver-green.wav',
  '操纵司机|绿黄灯': 'driver-green-yellow.wav',
  '操纵司机|黄灯，减速': 'driver-yellow-slow.wav',
  '操纵司机|车位正确': 'driver-position-correct.wav',
  '操纵司机|黄灯，正线': 'driver-yellow-mainline.wav',
});

export function callResponseAudioFile(item) {
  return AUDIO_FILES[`${item.role}|${item.text}`] || '';
}

function preferredVoice(role) {
  const voices = speechSynthesis.getVoices().filter((voice) => /^zh/i.test(voice.lang));
  if (!voices.length) return null;
  const matcher = role === '操纵司机' ? /male|yunxi|kangkang|男|云希/i : /female|xiaoxiao|huihui|yaoyao|女|晓晓/i;
  return voices.find((voice) => matcher.test(voice.name)) || voices[role === '操纵司机' ? 0 : Math.min(1, voices.length - 1)];
}

function playRecordedLine(item, sequenceId) {
  return new Promise((resolve) => {
    const file = callResponseAudioFile(item);
    if (!file || sequenceId !== activeSequence) { resolve(false); return; }
    const audio = new Audio(new URL(`../assets/audio/call-response/${file}`, import.meta.url).href);
    activeAudio = audio;
    audio.preload = 'auto';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (activeAudio === audio) activeAudio = null;
      resolve(value);
    };
    const timeout = setTimeout(() => finish(false), 9000);
    audio.onended = () => finish(sequenceId === activeSequence);
    audio.onerror = () => finish(false);
    audio.play().catch(() => finish(false));
  });
}

function speakLine(item, sequenceId) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || sequenceId !== activeSequence) { resolve(false); return; }
    let settled = false;
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.92;
    utterance.pitch = item.role === '操纵司机' ? 0.88 : 1.04;
    utterance.voice = preferredVoice(item.role);
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => {
      if (sequenceId === activeSequence) speechSynthesis.cancel();
      finish(false);
    }, Math.max(2800, Math.min(4800, item.text.length * 360 + 1700)));
    utterance.onend = () => finish(sequenceId === activeSequence);
    utterance.onerror = () => finish(false);
    try { speechSynthesis.speak(utterance); } catch { finish(false); }
  });
}

export async function playCallResponseSequence(sequence) {
  activeSequence += 1;
  const sequenceId = activeSequence;
  if (activeAudio) { activeAudio.pause(); activeAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  for (const item of sequence) {
    if (sequenceId !== activeSequence) return false;
    const recorded = await playRecordedLine(item, sequenceId);
    if (!recorded && !await speakLine(item, sequenceId)) return false;
  }
  return sequenceId === activeSequence;
}

export function stopCallResponseAudio() {
  activeSequence += 1;
  if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0; activeAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
