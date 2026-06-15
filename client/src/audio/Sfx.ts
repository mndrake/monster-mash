/**
 * A tiny zero-asset sound layer.
 *
 * Brawl Stars' feel is half audio, and the game shipped silent. Rather than
 * source/host sound files, this synthesizes short blips with the Web Audio API —
 * cheap, no network, and good enough to make shots, hits, and the super-ready
 * "ding" *land*. The same `Sfx` API can later be backed by real samples without
 * touching the call sites.
 *
 * Mobile browsers start an AudioContext SUSPENDED until a user gesture, so the
 * scene calls `resume()` on the first tap/keypress. Everything no-ops safely if
 * Web Audio is unavailable.
 */
export class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private enabled = true;

  constructor() {
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch {
      // No audio available — every method below becomes a no-op.
    }
  }

  /** Unlock playback after a user gesture (required on mobile). */
  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Release the audio context (call when leaving the game). */
  close(): void {
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close();
    this.ctx = undefined;
    this.master = undefined;
  }

  // --- low-level voices -----------------------------------------------------

  /** A single enveloped oscillator note, optionally pitch-sliding. */
  private blip(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; slideTo?: number; delay?: number } = {},
  ): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const { type = "square", gain = 0.25, slideTo, delay = 0 } = opts;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /** A short filtered noise burst (impacts / explosions). */
  private noise(dur: number, gain: number, cutoff: number, delay = 0): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // --- game sounds ----------------------------------------------------------

  shoot(kind: string): void {
    if (kind === "super") {
      this.blip(300, 0.2, { type: "sawtooth", gain: 0.3, slideTo: 130 });
      this.noise(0.18, 0.12, 1600);
    } else {
      this.blip(430, 0.08, { type: "square", gain: 0.16, slideTo: 230 });
    }
  }

  hit(toSelf: boolean): void {
    if (toSelf) this.blip(190, 0.13, { type: "triangle", gain: 0.28, slideTo: 90 });
    else this.noise(0.06, 0.22, 2600);
  }

  superReady(): void {
    this.blip(660, 0.1, { type: "sine", gain: 0.26 });
    this.blip(990, 0.2, { type: "sine", gain: 0.26, delay: 0.09 });
  }

  cube(): void {
    this.blip(880, 0.07, { type: "triangle", gain: 0.2 });
    this.blip(1320, 0.1, { type: "triangle", gain: 0.2, delay: 0.06 });
  }

  defeat(toSelf: boolean): void {
    this.noise(0.32, 0.28, 1200);
    this.blip(toSelf ? 220 : 260, 0.34, { type: "sawtooth", gain: 0.24, slideTo: 55 });
  }

  /** Countdown tick; `go` is the final "BRAWL!" accent. */
  countdown(go: boolean): void {
    if (go) this.blip(880, 0.22, { type: "square", gain: 0.3 });
    else this.blip(440, 0.1, { type: "square", gain: 0.2 });
  }

  /** End-of-round sting: a rising arpeggio for a win, a falling one for a loss. */
  sting(win: boolean): void {
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262];
    notes.forEach((f, i) =>
      this.blip(f, 0.22, { type: win ? "triangle" : "sawtooth", gain: 0.26, delay: i * 0.12 }),
    );
  }
}
