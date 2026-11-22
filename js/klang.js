// Klavierklang im Browser (Web Audio): echte Flügel-Samples, bei Bedarf ein einfacher Ersatzklang.
// Alles läuft über einen gemeinsamen Ausgang, den auch die Video-Aufnahme mitschneidet.
window.KH = window.KH || {};

KH.Klang = class Klang {
  constructor() {
    this.ctx = null;
    this.samples = new Map();
    this.sampleTasten = [];
    this.aktiv = new Set();
    this.lautstaerke = 0.8;
    this.bereit = null;
    this.gehalten = new Map();
  }

  init() {
    if (this.bereit) return this.bereit;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.bereit = Promise.resolve(); return this.bereit; }
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.lautstaerke;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.aufnahme = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
    if (this.aufnahme) comp.connect(this.aufnahme);
    this.bereit = this.ladeSamples();
    return this.bereit;
  }

  async ladeSamples() {
    const quelle = KH.KLAVIER_SAMPLES || {};
    await Promise.all(Object.entries(quelle).map(async ([taste, b64]) => {
      try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const buf = await new Promise((ok, fehler) => this.ctx.decodeAudioData(bytes.buffer, ok, fehler));
        this.samples.set(Number(taste), buf);
      } catch (e) { /* Ersatzklang wird benutzt */ }
    }));
    this.sampleTasten = [...this.samples.keys()].sort((a, b) => a - b);
  }

  async resume() { if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume(); }
  get zeit() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }

  setLautstaerke(v) {
    this.lautstaerke = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  quelle(midi, wann, g) {
    const ctx = this.ctx;
    if (this.sampleTasten.length) {
      let best = this.sampleTasten[0];
      for (const k of this.sampleTasten) if (Math.abs(k - midi) < Math.abs(best - midi)) best = k;
      const src = ctx.createBufferSource();
      src.buffer = this.samples.get(best);
      src.playbackRate.value = Math.pow(2, (midi - best) / 12);
      src.connect(g);
      return src;
    }
    // Ersatzklang: Grundton plus Obertöne mit Abklingen
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const mix = ctx.createGain();
    mix.gain.setValueAtTime(1, wann);
    mix.gain.exponentialRampToValueAtTime(0.25, wann + 1.5);
    mix.connect(g);
    const oscs = [[1, 0.6, 'triangle'], [2, 0.18, 'sine'], [3, 0.06, 'sine']].map(([n, a, typ]) => {
      const o = ctx.createOscillator(); o.type = typ; o.frequency.value = f * n;
      const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(mix);
      return o;
    });
    return {
      start: (t) => oscs.forEach((o) => o.start(t)),
      stop: (t) => oscs.forEach((o) => o.stop(t)),
      set onended(fn) { oscs[0].onended = fn; },
    };
  }

  ton(midi, wann, dauer, staerke = 0.72) {
    const ctx = this.ctx;
    if (!ctx) return null;
    wann = Math.max(wann, ctx.currentTime);
    const g = ctx.createGain();
    const v = Math.max(0.05, Math.min(1, staerke));
    const amp = 0.15 + 0.75 * v * v;
    g.gain.setValueAtTime(0, wann);
    g.gain.linearRampToValueAtTime(amp, wann + 0.004);
    const src = this.quelle(midi, wann, g);
    g.connect(this.master);
    const ende = wann + Math.max(0.05, dauer);
    const ausklang = midi < 48 ? 0.32 : midi < 72 ? 0.22 : 0.14;
    g.gain.setTargetAtTime(0, ende, ausklang / 3);
    src.start(wann);
    src.stop(ende + ausklang * 2 + 0.05);
    const h = { src, g };
    this.aktiv.add(h);
    src.onended = () => { this.aktiv.delete(h); try { g.disconnect(); } catch (e) { /* schon getrennt */ } };
    return h;
  }

  // Für ein angeschlossenes MIDI-Keyboard: Ton so lange halten, bis die Taste losgelassen wird.
  halte(midi, staerke) {
    if (!this.ctx) return;
    this.lasse(midi);
    const h = this.ton(midi, this.ctx.currentTime, 8, staerke);
    if (h) this.gehalten.set(midi, h);
  }

  lasse(midi) {
    const h = this.gehalten.get(midi);
    if (!h) return;
    this.gehalten.delete(midi);
    const t = this.ctx.currentTime;
    try { h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0, t, 0.08); h.src.stop(t + 0.5); } catch (e) { /* schon beendet */ }
  }

  klick(wann, betont) {
    const ctx = this.ctx;
    if (!ctx) return;
    wann = Math.max(wann, ctx.currentTime);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = betont ? 1760 : 1175;
    g.gain.setValueAtTime(0, wann);
    g.gain.linearRampToValueAtTime(betont ? 0.22 : 0.13, wann + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0008, wann + 0.05);
    o.connect(g); g.connect(this.master);
    o.start(wann); o.stop(wann + 0.06);
  }

  allesAus(zeitkonstante = 0.03) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const h of this.aktiv) {
      if ([...this.gehalten.values()].includes(h)) continue;
      try { h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0, t, zeitkonstante); h.src.stop(t + 0.25); } catch (e) { /* schon beendet */ }
    }
  }
};
