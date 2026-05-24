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
    this.buffers = {};
    this._loading = null;
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
    this._loadAssets();
  }

  setMuted(m) { this.muted = m; }

  _now() { return this.ctx.currentTime; }

  _loadAssets() {
    if (!this.ctx || this._loading) return this._loading;
    const manifest = {
      beamZap: './assets/sfx/beam_zap.mp3',
      beamEnergy: './assets/sfx/beam_energy.mp3',
      buildingCrash: './assets/sfx/building_crash.mp3',
      explosionLarge: './assets/sfx/explosion_large.mp3',
      explosionMedium: './assets/sfx/explosion_medium.mp3',
      metalHit: './assets/sfx/metal_hit.mp3',
    };
    this._loading = Promise.all(Object.entries(manifest).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const bytes = await res.arrayBuffer();
        this.buffers[name] = await this.ctx.decodeAudioData(bytes);
      } catch (err) {
        console.warn(`Sound asset failed: ${url}`, err.message);
      }
    }));
    return this._loading;
  }

  _playAsset(name, {
    gain = 0.45,
    rate = 1,
    offset = 0,
    dur = null,
    delay = 0,
    detune = 0,
  } = {}) {
    if (!this.ctx || this.muted) return false;
    const buffer = this.buffers[name];
    if (!buffer) {
      this._loadAssets();
      return false;
    }
    const t0 = this._now() + delay;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.detune.value = detune;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || Math.max(0.08, buffer.duration - offset)));
    src.connect(g).connect(this.master);
    const startOffset = Math.min(offset, Math.max(0, buffer.duration - 0.05));
    if (dur != null) src.start(t0, startOffset, dur);
    else src.start(t0, startOffset);
    return true;
  }

  _pick(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

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
    if (this._playAsset('metalHit', {
      offset: this._pick([0, 5.3, 9.6, 14.0, 18.4]),
      dur: 0.45,
      gain: 0.22,
      rate: 1.1 + Math.random() * 0.12,
    })) return;
    this._osc({ type: 'square',   freq: 130, freqEnd: 35, dur: 0.13, gain: 0.22 });
    this._noise({ dur: 0.10, filterFreq: 280, gain: 0.16 });
  }

  jump() {
    this._osc({ type: 'triangle', freq: 220, freqEnd: 540, dur: 0.22, gain: 0.12 });
  }

  land() {
    this._playAsset('buildingCrash', {
      offset: this._pick([0, 6.4, 12.0]),
      dur: 0.35,
      gain: 0.12,
      rate: 0.82,
    });
    this._osc({ type: 'sawtooth', freq: 90, freqEnd: 28, dur: 0.28, gain: 0.18 });
    this._noise({ dur: 0.16, filterFreq: 180, gain: 0.22 });
  }

  beamCharge() {
    this._osc({ type: 'sine', freq: 380, freqEnd: 1400, dur: 0.6, gain: 0.16, gainAttack: 0.35 });
  }

  beamFire() {
    if (this._playAsset('beamEnergy', { offset: 0, dur: 1.2, gain: 0.28, rate: 1.08 })) {
      this._playAsset('beamZap', {
        offset: this._pick([0, 2.4, 6.4]),
        dur: 0.55,
        gain: 0.22,
        rate: 1.1 + Math.random() * 0.2,
      });
      return;
    }
    this._osc({ type: 'sawtooth', freq: 1500, freqEnd: 220, dur: 0.7, gain: 0.22 });
    this._noise({ dur: 0.7, filter: 'bandpass', filterFreq: 2500, filterQ: 4, gain: 0.18 });
  }

  hit() {
    if (this._playAsset('metalHit', {
      offset: this._pick([0, 5.3, 9.6, 14.0, 18.4]),
      dur: 0.38,
      gain: 0.26,
      rate: 0.95 + Math.random() * 0.18,
    })) return;
    this._osc({ type: 'square',   freq: 110, freqEnd: 40, dur: 0.2, gain: 0.22 });
    this._noise({ dur: 0.14, filterFreq: 500, gain: 0.18 });
  }

  buildingFall() {
    if (this._playAsset('buildingCrash', {
      offset: this._pick([0, 6.4, 12.0, 18.4, 28.0, 39.0]),
      dur: 1.25,
      gain: 0.38,
      rate: 0.82 + Math.random() * 0.2,
    })) return;
    this._osc({ type: 'sawtooth', freq: 55, freqEnd: 22, dur: 0.8, gain: 0.18 });
    this._noise({ dur: 0.7, filterFreq: 220, gain: 0.26 });
    this._noise({ dur: 0.5, filterFreq: 120, gain: 0.22, delay: 0.15 });
  }

  explosion() {
    if (this._playAsset('explosionLarge', {
      offset: this._pick([0, 5.0, 10.3, 15.0, 20.0, 30.0, 38.0]),
      dur: 1.6,
      gain: 0.55,
      rate: 0.9 + Math.random() * 0.15,
    })) {
      this._playAsset('explosionMedium', {
        offset: this._pick([0, 3.4, 7.2, 11.2, 15.6]),
        dur: 0.85,
        gain: 0.25,
        rate: 0.9,
        delay: 0.04,
      });
      return;
    }
    this.buildingFall();
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
