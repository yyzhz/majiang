// 基于 WebAudio 的轻量音效，无需任何外部音频资源
let ctx = null;
let enabled = true;

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (err) {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, duration = 0.08, type = 'triangle', gain = 0.06, delay = 0) {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  const start = ac.currentTime + delay;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function setSoundEnabled(v) {
  enabled = !!v;
}

export function isSoundEnabled() {
  return enabled;
}

export const sounds = {
  draw() {
    tone(620, 0.06, 'square', 0.03);
    tone(880, 0.05, 'square', 0.022, 0.04);
  },
  discard() {
    tone(300, 0.09, 'triangle', 0.055);
    tone(180, 0.1, 'sine', 0.045, 0.03);
  },
  peng() {
    tone(420, 0.09, 'square', 0.05);
    tone(560, 0.12, 'square', 0.045, 0.08);
  },
  gang() {
    tone(340, 0.1, 'sawtooth', 0.045);
    tone(510, 0.1, 'sawtooth', 0.045, 0.09);
    tone(680, 0.16, 'triangle', 0.055, 0.18);
  },
  win() {
    const seq = [523, 659, 784, 1046, 1318];
    seq.forEach((f, i) => tone(f, 0.24, 'triangle', 0.06, i * 0.09));
    seq.forEach((f, i) => tone(f / 2, 0.3, 'sine', 0.03, i * 0.09));
  },
  drawRound() {
    tone(320, 0.2, 'sine', 0.045);
    tone(260, 0.3, 'sine', 0.04, 0.18);
  },
  click() {
    tone(760, 0.04, 'sine', 0.026);
  }
};
