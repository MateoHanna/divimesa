// Avisos sonoros y vibración. El navegador solo deja sonar después de un toque de la persona.
let ctx: AudioContext | null = null;

export function enableAudio(): void {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* sin audio disponible */
  }
}

function tones(notes: { freq: number; at: number; len: number; gain: number; type?: OscillatorType }[]) {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0.0001, t + n.at);
    gain.gain.exponentialRampToValueAtTime(n.gain, t + n.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.at + n.len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + n.at);
    osc.stop(t + n.at + n.len + 0.02);
  }
}

/** Pitido corto: entró un pago. */
export function beep(): void {
  try {
    tones([{ freq: 988, at: 0, len: 0.14, gain: 0.22 }]);
    navigator.vibrate?.(120);
  } catch {
    /* sin audio o vibración */
  }
}

/** Campanita de cuatro notas que suben: la mesa pagó completo. Se distingue a propósito del pitido. */
export function chime(): void {
  try {
    tones([
      { freq: 523, at: 0, len: 0.22, gain: 0.22, type: "triangle" },
      { freq: 659, at: 0.15, len: 0.22, gain: 0.22, type: "triangle" },
      { freq: 784, at: 0.3, len: 0.22, gain: 0.22, type: "triangle" },
      { freq: 1047, at: 0.45, len: 0.7, gain: 0.26, type: "triangle" },
    ]);
    navigator.vibrate?.([200, 80, 200, 80, 300]);
  } catch {
    /* sin audio o vibración */
  }
}
