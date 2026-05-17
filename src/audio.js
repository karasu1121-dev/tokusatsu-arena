// Programmatic sound effects via Web Audio API.
// All sounds are synthesised on demand — no external audio files needed.
//
// Web Audio contexts must be unlocked by a user gesture; call sfx.unlock()
// from the first click/keydown.

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._pendingVolume ?? 0.45;
    this.master.connect(this.ctx.destination);
  }

  setVolume(v) {
    this._pendingVolume = v;
    if (this.master) this.master.gain.value = v;
  }

  unlock() {
    this._ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) { this.muted = m; }

  _now() { return this.ctx.currentTime; }

  _osc({ type = 'sine', freq, freqEnd, dur, gain = 0.2, gainAttack = 0.005, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this._now() + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + gainAttack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ dur, filterFreq = 800, filterQ = 1, filter = 'lowpass', gain = 0.2, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this._now() + delay;
    const size = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filter;
    flt.frequency.value = filterFreq;
    flt.Q.value = filterQ;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ----- Public effects -----

  punch() {
    this._osc({ type: 'square',   freq: 130, freqEnd: 35, dur: 0.13, gain: 0.22 });
    this._noise({ dur: 0.10, filterFreq: 280, gain: 0.16 });
  }

  jump() {
    this._osc({ type: 'triangle', freq: 220, freqEnd: 540, dur: 0.22, gain: 0.12 });
  }

  land() {
    this._osc({ type: 'sawtooth', freq: 90, freqEnd: 28, dur: 0.28, gain: 0.18 });
    this._noise({ dur: 0.16, filterFreq: 180, gain: 0.22 });
  }

  beamCharge() {
    this._osc({ type: 'sine', freq: 380, freqEnd: 1400, dur: 0.6, gain: 0.16, gainAttack: 0.35 });
  }

  beamFire() {
    this._osc({ type: 'sawtooth', freq: 1500, freqEnd: 220, dur: 0.7, gain: 0.22 });
    this._noise({ dur: 0.7, filter: 'bandpass', filterFreq: 2500, filterQ: 4, gain: 0.18 });
  }

  hit() {
    this._osc({ type: 'square',   freq: 110, freqEnd: 40, dur: 0.2, gain: 0.22 });
    this._noise({ dur: 0.14, filterFreq: 500, gain: 0.18 });
  }

  buildingFall() {
    this._osc({ type: 'sawtooth', freq: 55, freqEnd: 22, dur: 0.8, gain: 0.18 });
    this._noise({ dur: 0.7, filterFreq: 220, gain: 0.26 });
    this._noise({ dur: 0.5, filterFreq: 120, gain: 0.22, delay: 0.15 });
  }

  roar() {
    if (!this.ctx || this.muted) return;
    const t0 = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(155, t0);
    osc.frequency.linearRampToValueAtTime(85, t0 + 0.5);
    osc.frequency.linearRampToValueAtTime(70, t0 + 0.7);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.28, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.85);
    // throaty noise on top
    osc.connect(g).connect(this.master);
    osc.start(t0); osc.stop(t0 + 0.9);
    this._noise({ dur: 0.7, filterFreq: 350, gain: 0.12 });
  }

  victory() {
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
    notes.forEach((f, i) =>
      this._osc({ type: 'triangle', freq: f, dur: 0.5, gain: 0.18, delay: i * 0.13 })
    );
  }

  defeat() {
    const notes = [349.23, 311.13, 261.63, 196.00];
    notes.forEach((f, i) =>
      this._osc({ type: 'sawtooth', freq: f, dur: 0.55, gain: 0.18, delay: i * 0.2 })
    );
  }
}
