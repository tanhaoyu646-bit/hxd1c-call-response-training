let activeSequence = 0;

function preferredVoice(role) {
  const voices = speechSynthesis.getVoices().filter((voice) => /^zh/i.test(voice.lang));
  if (!voices.length) return null;
  const femaleHint = /female|xiaoxiao|huihui|yaoyao|女|晓晓/i;
  const maleHint = /male|yunxi|kangkang|男|云希/i;
  const matcher = role === '操纵司机' ? maleHint : femaleHint;
  return voices.find((voice) => matcher.test(voice.name)) || voices[role === '操纵司机' ? 0 : Math.min(1, voices.length - 1)];
}

function speakLine(item, sequenceId) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || sequenceId !== activeSequence) {
      resolve(false);
      return;
    }
    let settled = false;
    // 用不同声线区分岗位，不朗读“操纵司机／非操纵司机”等提示词，
    // 使播放内容保持真实呼唤应答口吻。
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
    try {
      speechSynthesis.speak(utterance);
    } catch {
      finish(false);
    }
  });
}

export async function playCallResponseSequence(sequence) {
  if (!('speechSynthesis' in window)) return false;
  activeSequence += 1;
  const sequenceId = activeSequence;
  speechSynthesis.cancel();
  for (const item of sequence) {
    if (sequenceId !== activeSequence) return false;
    await speakLine(item, sequenceId);
  }
  return sequenceId === activeSequence;
}

export function stopCallResponseAudio() {
  activeSequence += 1;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
