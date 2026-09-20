let ctx: AudioContext | null = null;
let playing = false;
let nodes: Array<AudioNode | OscillatorNode> = [];
let alarmAudio: HTMLAudioElement | null = null;
let keepAudio: HTMLAudioElement | null = null;
let alarmUrl: string | null = null;
let keepUrl: string | null = null;
let loopId: number | null = null;
let primed = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC({ latencyHint: "interactive" } as AudioContextOptions);
    } catch {
      ctx = new AC();
    }
  }
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

function makeAudio(url: string): HTMLAudioElement {
  const a = new Audio(url);
  a.loop = true;
  a.preload = "auto";
  a.crossOrigin = "anonymous";
  a.setAttribute("playsinline", "true");
  a.setAttribute("webkit-playsinline", "true");
  a.muted = false;
  return a;
}

function alarmWavUrl(): string {
  if (alarmUrl) return alarmUrl;
  const sampleRate = 22050;
  const seconds = 2.6;
  const n = Math.floor(sampleRate * seconds);
  const data = new Int16Array(n);
  const notes: Array<[number, number, number]> = [
    [523.25, 0.0, 0.48],
    [659.25, 0.34, 0.48],
    [783.99, 0.68, 0.56],
    [987.77, 1.12, 0.42],
    [1046.5, 1.48, 0.7],
    [783.99, 2.12, 0.42],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let s = 0;
    for (const [f, start, dur] of notes) {
      if (t < start || t > start + dur) continue;
      const u = (t - start) / dur;
      const env = Math.sin(Math.PI * Math.min(1, u * 1.08)) * Math.exp(-2.4 * u);
      const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * t);
      const w = 2 * Math.PI * f * vib * (t - start);
      s +=
        env *
        (Math.sin(w) * 0.72 +
          Math.sin(2 * w) * 0.22 +
          Math.sin(3 * w) * 0.08 +
          Math.sin(6 * w) * 0.04);
    }
    s += Math.sin(2 * Math.PI * 130.81 * t) * 0.04 * Math.sin((Math.PI * t) / seconds);
    data[i] = Math.max(-32767, Math.min(32767, s * 28000));
  }
  alarmUrl = URL.createObjectURL(pcmToWav(data, sampleRate));
  return alarmUrl;
}

/** Inaudible 18 Hz tone — keeps the MEDIA stream alive so silent-mode ringer mute does not apply. */
function keepAliveWavUrl(): string {
  if (keepUrl) return keepUrl;
  const sampleRate = 22050;
  const n = sampleRate * 2;
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const rumble =
      Math.sin(2 * Math.PI * 18 * t) * 180 + Math.sin(2 * Math.PI * 42 * t) * 90;
    data[i] = Math.max(-32767, Math.min(32767, rumble));
  }
  keepUrl = URL.createObjectURL(pcmToWav(data, sampleRate));
  return keepUrl;
}

function ensureAlarmAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!alarmAudio) {
    alarmAudio = makeAudio(alarmWavUrl());
    alarmAudio.volume = 1;
  }
  return alarmAudio;
}

function ensureKeepAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!keepAudio) {
    keepAudio = makeAudio(keepAliveWavUrl());
    keepAudio.volume = 0.02;
  }
  return keepAudio;
}

let watchdog: number | null = null;

function claimMedia(title = "Pilurica") {
  try {
    const ms = navigator.mediaSession;
    if (!ms) return;
    ms.metadata = new MediaMetadata({
      title,
      artist: "Podsjetnik za lijekove",
      artwork: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    ms.playbackState = "playing";
    const keep = () => {
      ms.playbackState = "playing";
      void playKeepAlive();
    };
    try {
      ms.setActionHandler("pause", keep);
      ms.setActionHandler("stop", keep);
      ms.setActionHandler("play", keep);
    } catch {
      /* handlers optional */
    }
  } catch {
    /* no media session */
  }
}

function stopNodes() {
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
}

async function playKeepAlive(): Promise<boolean> {
  const a = ensureKeepAudio();
  if (!a) return false;
  a.muted = false;
  a.loop = true;
  a.volume = 0.02;
  try {
    await a.play();
    primed = true;
    claimMedia();
    return true;
  } catch {
    primed = false;
    return false;
  }
}

export async function unlockAudio() {
  const c = ensureCtx();
  if (c && c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* still blocked */
    }
  }
  await playKeepAlive();
}

export function isAlarmPlaying() {
  return playing;
}

export function stopAlarmSound() {
  playing = false;
  stopNodes();
  if (alarmAudio) {
    try {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
  }
  void playKeepAlive();
}

function scheduleBeeps(c: AudioContext, rings: number) {
  const master = c.createGain();
  master.gain.value = 0.7;
  master.connect(c.destination);
  nodes.push(master);

  const chime = (freq: number, when: number, dur: number) => {
    const osc = c.createOscillator();
    const sparkle = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    sparkle.type = "sine";
    osc.frequency.value = freq;
    sparkle.frequency.value = freq * 2;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.9, when + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    sparkle.connect(g);
    g.connect(master);
    osc.start(when);
    sparkle.start(when);
    osc.stop(when + dur + 0.02);
    sparkle.stop(when + dur + 0.02);
    nodes.push(osc, sparkle, g);
  };

  const phrase = [
    [523.25, 0.0, 0.42],
    [659.25, 0.34, 0.42],
    [783.99, 0.68, 0.5],
    [987.77, 1.12, 0.38],
    [1046.5, 1.48, 0.62],
  ] as const;
  const t0 = c.currentTime + 0.02;
  for (let r = 0; r < rings; r++) {
    const t = t0 + r * 2.4;
    for (const [f, off, dur] of phrase) chime(f, t + off, dur);
  }
}

/** Media-stream alarm — silent/ringer mute does not apply to media volume. */
export async function startAlarmSound(rings = 2) {
  const total = Math.max(1, Math.min(8, Math.round(rings)));
  const c = ensureCtx();
  if (c && c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* keep media element */
    }
  }

  stopNodes();
  playing = true;
  claimMedia("Vrijeme za pilulicu");
  void playKeepAlive();

  const a = ensureAlarmAudio();
  if (a) {
    a.loop = true;
    a.muted = false;
    a.volume = 1;
    try {
      a.currentTime = 0;
    } catch {
      /* ignore */
    }
    try {
      await a.play();
      primed = true;
    } catch {
      try {
        await playKeepAlive();
        a.muted = false;
        a.volume = 1;
        await a.play();
      } catch {
        /* Web Audio below */
      }
    }
  }

  if (c && c.state === "running") {
    scheduleBeeps(c, total);
  }

  loopId = window.setTimeout(() => {
    if (!playing) return;
    stopAlarmSound();
  }, total * 2400);
}

export function vibrateAlarm() {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate([400, 120, 400, 120, 700, 180, 400, 120, 900]);
}

export function stopVibrate() {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(0);
}

export function isAudioPrimed() {
  return primed || (keepAudio != null && !keepAudio.paused);
}

/** Keep media playing while the screen is off so the alarm can still ring. */
export function startSleepGuard() {
  if (typeof window === "undefined" || watchdog != null) return;
  const kick = () => {
    if (keepAudio?.paused !== false) void playKeepAlive();
    else claimMedia(playing ? "Vrijeme za pilulicu" : "Pilurica");
  };
  watchdog = window.setInterval(kick, 8_000);
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("pagehide", kick);
  window.addEventListener("pageshow", kick);
  window.addEventListener("freeze", kick);
  window.addEventListener("resume", kick);
  void playKeepAlive();
}
