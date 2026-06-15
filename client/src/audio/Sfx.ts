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
  /** Whether the one-time iOS silent-buffer kick has fired. */
  private unlocked = false;

  // --- looping background music (also synthesized, no files) ---
  private musicGain?: GainNode;
  private musicTimer?: number;
  private musicOn = false;
  /** Absolute time (ctx clock) the next 8th-note is scheduled for. */
  private nextNote = 0;
  /** Position in the 16-step (2-bar) pattern. */
  private step = 0;

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

  /**
   * Unlock playback. Call this from inside a user-gesture handler.
   *
   * Desktop just needs resume(). iOS/iPadOS WebKit (which Chrome on iPad uses
   * too) is stricter: the context stays silent — even when its state reads
   * "running" — until a sound is actually STARTED during the gesture. So we also
   * fire a one-sample silent buffer the first time. Safe to call repeatedly.
   */
  resume(): void {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (!this.unlocked) {
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = this.ctx.createBuffer(1, 1, 22050);
        src.connect(this.ctx.destination);
        src.start(0);
        this.unlocked = true;
      } catch {
        /* ignore — best-effort kick */
      }
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    // Mute the music bed without tearing the scheduler down.
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(on ? 0.13 : 0, this.ctx.currentTime, 0.05);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Release the audio context (call when leaving the game). */
  close(): void {
    this.stopMusic();
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close();
    this.ctx = undefined;
    this.master = undefined;
  }

  // --- background music ------------------------------------------------------

  /** Begin the looping music bed (idempotent). */
  startMusic(): void {
    if (!this.ctx || !this.master || this.musicOn) return;
    this.musicOn = true;
    if (!this.musicGain) {
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.enabled ? 0.13 : 0;
      this.musicGain.connect(this.master);
    }
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
    // Lookahead scheduler (the "two clocks" pattern): a coarse timer schedules
    // notes a little ahead of the precise audio clock so timing stays steady.
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  /** Stop the music bed. */
  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer !== undefined) {
      clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.musicOn) return;
    const eighth = 60 / 112 / 2; // 112 BPM, eighth notes
    while (this.nextNote < this.ctx.currentTime + 0.12) {
      this.musicNote(this.step, this.nextNote, eighth);
      this.nextNote += eighth;
      this.step = (this.step + 1) % 16;
    }
  }

  /** One step of the loop: a soft arpeggio note, plus a bass note every beat. */
  private musicNote(step: number, t: number, eighth: number): void {
    // A-minor pentatonic — pleasant and never dissonant on a loop.
    const ARP = [220, 329.63, 261.63, 440, 392, 261.63, 329.63, 220, 220, 329.63, 293.66, 440, 392, 293.66, 261.63, 220];
    const BASS: Record<number, number> = { 0: 110, 4: 130.81, 8: 98, 12: 110 };
    this.musicVoice(ARP[step], t, eighth * 0.9, "triangle", 0.16);
    if (BASS[step]) this.musicVoice(BASS[step], t, eighth * 3.6, "sine", 0.32);
  }

  /** A single enveloped music note routed through the (mutable) music gain. */
  private musicVoice(freq: number, t: number, dur: number, type: OscillatorType, gain: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.03);
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
