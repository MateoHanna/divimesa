// Aviso sonoro y vibración para pagos nuevos. El navegador solo deja sonar después de un toque del usuario.
let ctx: AudioContext | null = null;

export function enableAudio(): void {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* sin audio disponible */
  }
}

export function beep(): void {
  try {
    if (ctx && ctx.state === "running") {
      const t = ctx.currentTime;
      [880, 1175].forEach((freq, i) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
        osc.connect(gain).connect(ctx!.destination);
        osc.start(t + i * 0.18);
        osc.stop(t + i * 0.18 + 0.17);
      });
    }
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    /* sin audio o vibración */
  }
}
