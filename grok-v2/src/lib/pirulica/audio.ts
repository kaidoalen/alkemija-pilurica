let ctx: AudioContext | null = null;
let playing = false;
let nodes: Array<AudioNode | OscillatorNode> = [];
let htmlAudio: HTMLAudioElement | null = null;
let wavUrl: string | null = null;
let loopId: number | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

function pcmToWav(samples: Int16Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    view.setInt16(o, samples[i], true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function alarmWavUrl(): string {
  if (wavUrl) return wavUrl;
  const sampleRate = 22050;
  const seconds = 1.6;
  const n = Math.floor(sampleRate * seconds);
  const data = new Int16Array(n);
  const bursts: Array<[number, number, number]> = [
    [0, 0.22, 880],
    [0.28, 0.5, 698],
    [0.56, 0.78, 880],
    [0.92, 1.3, 523],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const burst = bursts.find(([a, b]) => t >= a && t < b);
    if (!burst) continue;
    const f = burst[2];
    const square = Math.sin(2 * Math.PI * f * t) >= 0 ? 1 : -1;
    const low = Math.sin(2 * Math.PI * (f / 2) * t);
    data[i] = Math.max(-32767, Math.min(32767, (square * 0.72 + low * 0.35) * 30000));
  }
  wavUrl = URL.createObjectURL(pcmToWav(data, sampleRate));
  return wavUrl;
}

function ensureHtmlAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!htmlAudio) {
    htmlAudio = new Audio(alarmWavUrl());
    htmlAudio.loop = true;
    htmlAudio.preload = "auto";
    htmlAudio.setAttribute("playsinline", "true");
    htmlAudio.volume = 1;
  }
  return htmlAudio;
}

export async function unlockAudio() {
  const c = ensureCtx();
  if (c && c.state === "suspended") await c.resume();
  const a = ensureHtmlAudio();
  if (a) {
    try {
      a.muted = true;
      a.currentTime = 0;
      await a.play();
      a.pause();
      a.muted = false;
    } catch {
      /* gesture may still unlock Web Audio */
    }
  }
}

export function isAlarmPlaying() {
  return playing;
}

function stopSpeech() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* no speech */
  }
}

export function stopAlarmSound() {
  playing = false;
  if (loopId != null) {
    window.clearTimeout(loopId);
    loopId = null;
  }
  for (const n of nodes) {
    try {
      if ("stop" in n && typeof n.stop === "function") n.stop();
      n.disconnect();
    } catch {
      /* already stopped */
    }
  }
  nodes = [];
  if (htmlAudio) {
    try {
      htmlAudio.pause();
      htmlAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
  stopSpeech();
}

function speakNow() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Vrijeme za piluricu. Proba alarma.");
    u.lang = "hr-HR";
    u.rate = 0.95;
    u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

/** Two-tone medical beep + WAV + govor. Loops until stopAlarmSound(). */
export async function startAlarmSound() {
  const c = ensureCtx();
  if (c && c.state === "suspended") await c.resume();
  stopAlarmSound();
  playing = true;

  const a = ensureHtmlAudio();
  if (a) {
    try {
      a.muted = false;
      a.volume = 1;
      a.currentTime = 0;
      void a.play();
    } catch {
      /* Web Audio still runs */
    }
  }

  speakNow();

  if (!c) return;

  const master = c.createGain();
  master.gain.value = 0.62;
  master.connect(c.destination);
  nodes.push(master);

  const beep = (freq: number, when: number, dur: number) => {
    if (!playing) return;
    const osc = c.createOscillator();
    const sub = c.createOscillator();
    const g = c.createGain();
    osc.type = "square";
    sub.type = "sawtooth";
    osc.frequency.value = freq;
    sub.frequency.value = freq / 2;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(1, when + 0.018);
    g.gain.setValueAtTime(1, when + dur - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    sub.connect(g);
    g.connect(master);
    osc.start(when);
    sub.start(when);
    osc.stop(when + dur + 0.02);
    sub.stop(when + dur + 0.02);
    nodes.push(osc, sub, g);
  };

  const loop = () => {
    if (!playing || !ctx) return;
    const t = ctx.currentTime + 0.02;
    beep(880, t, 0.22);
    beep(698.46, t + 0.28, 0.22);
    beep(880, t + 0.56, 0.22);
    beep(523.25, t + 0.92, 0.38);
    loopId = window.setTimeout(loop, 1600);
  };
  loop();
}

export function vibrateAlarm() {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate([400, 120, 400, 120, 700, 180, 400, 120, 900]);
}

export function stopVibrate() {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(0);
}
