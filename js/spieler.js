// Wiedergabe: Uhr, Tempo, Metronom, Einzähler, Takt-Schleife und Warte-Modus fürs MIDI-Keyboard.
// Zeiten im Modell sind "Stückzeit" in Sekunden bei 100 % Tempo.
window.KH = window.KH || {};

KH.Spieler = class Spieler {
  constructor(klang) {
    this.klang = klang;
    this.modell = null;
    this.spielt = false;
    this.pos = 0;
    this.tempo = 1;
    this.ankerZeit = 0;
    this.ankerPos = 0;
    this.timer = null;
    this.idx = 0;
    this.schlagIdx = 0;
    this.schlaege = [];
    this.hoeren = { R: true, L: true, X: true };
    this.metronom = false;
    this.einzaehler = false;
    this.schleife = null; // {start, ende}
    this.stopBei = null;
    this.halt = null;
    this.warteModus = null; // {haende:Set}
    this.ereignisse = [];
    this.wIdx = 0;
    this.treffer = new Set();
    this.beiEnde = null;
    this.beiWarten = null;
  }

  setModell(m) {
    this.stop();
    this.modell = m;
    this.schlaege = KH.Spieler.schlaegeAus(m.takte);
    this.pos = 0;
    this.baueEreignisse();
  }

  static schlaegeAus(takte) {
    const out = [];
    for (const t of takte) {
      const schlag = (4 / t.nenner) * 60 / t.bpm;
      const voll = t.zaehler * schlag;
      const laenge = t.ende - t.start;
      const versatz = laenge < voll - 1e-3 ? voll - laenge : 0; // Auftakt: von hinten zählen
      for (let k = 0; k < t.zaehler; k++) {
        const z = t.start - versatz + k * schlag;
        if (z >= t.start - 1e-6 && z < t.ende - 1e-6) out.push({ t: z, betont: k === 0 });
      }
    }
    return out;
  }

  taktBei(t) {
    const takte = this.modell ? this.modell.takte : [];
    let lo = 0, hi = takte.length - 1, best = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (takte[mid].start <= t + 1e-6) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    return best;
  }

  jetzt() {
    if (!this.spielt) return this.pos;
    if (this.halt !== null) return this.halt;
    return this.ankerPos + (this.klang.zeit - this.ankerZeit) * this.tempo;
  }

  ersteNote(t) {
    const n = this.modell.noten;
    let lo = 0, hi = n.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (n[mid].start < t - 1e-6) lo = mid + 1; else hi = mid; }
    return lo;
  }

  ersterSchlag(t) {
    const s = this.schlaege;
    let lo = 0, hi = s.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].t < t - 1e-6) lo = mid + 1; else hi = mid; }
    return lo;
  }

  async play() {
    if (!this.modell || this.spielt) return;
    await this.klang.init();
    await this.klang.resume();
    const ende = this.stopBei ?? (this.schleife ? this.schleife.ende : this.modell.dauer);
    if (this.pos >= ende - 0.05) this.pos = this.schleife ? this.schleife.start : 0;
    const start = this.pos;
    let vorlauf = 0;
    const vorZeit = this.klang.zeit + 0.08;
    if (this.einzaehler && this.modell.takte.length) {
      const t = this.modell.takte[this.taktBei(start)];
      const schlag = (4 / t.nenner) * 60 / t.bpm;
      vorlauf = t.zaehler * schlag;
      for (let k = 0; k < t.zaehler; k++) this.klang.klick(vorZeit + (k * schlag) / this.tempo, k === 0);
    }
    this.ankerZeit = vorZeit;
    this.ankerPos = start - vorlauf;
    this.idx = this.ersteNote(start);
    this.schlagIdx = this.ersterSchlag(start);
    this.halt = null;
    this.wIdx = this.ersteEreignis(start);
    this.treffer.clear();
    this.spielt = true;
    this.timer = setInterval(() => this.plane(), 25);
    this.plane();
  }

  pause() {
    if (!this.spielt) return;
    this.pos = Math.max(0, this.jetzt());
    this.spielt = false;
    this.halt = null;
    clearInterval(this.timer);
    this.timer = null;
    this.klang.allesAus();
  }

  stop() { this.pause(); this.pos = 0; }

  springe(t) {
    t = Math.max(0, Math.min(t, this.modell ? this.modell.dauer : 0));
    if (!this.spielt) { this.pos = t; return; }
    this.klang.allesAus(0.015);
    this.ankerZeit = this.klang.zeit + 0.03;
    this.ankerPos = t;
    this.idx = this.ersteNote(t);
    this.schlagIdx = this.ersterSchlag(t);
    this.halt = null;
    this.wIdx = this.ersteEreignis(t);
    this.treffer.clear();
  }

  setTempo(f) {
    if (this.spielt && this.halt === null) {
      const p = this.jetzt();
      this.ankerPos = p;
      this.ankerZeit = this.klang.zeit;
    }
    this.tempo = f;
  }

  zuAudioZeit(t) { return this.ankerZeit + (t - this.ankerPos) / this.tempo; }

  plane() {
    if (!this.spielt || !this.modell) return;
    const jetzt = this.jetzt();
    let bis = jetzt + 0.15 * this.tempo;
    const grenze = this.stopBei ?? (this.schleife ? this.schleife.ende : Infinity);
    bis = Math.min(bis, grenze);

    // Warte-Modus: nicht über den nächsten Ton hinaus, den man selbst spielen soll
    const wartet = this.warteModus && this.ereignisse.length;
    if (wartet) {
      const naechstes = this.ereignisse[this.wIdx];
      if (naechstes) {
        if (this.halt === null && jetzt >= naechstes.start - 1e-4) {
          if (this.erfuellt(naechstes)) this.weiter();
          else { this.halt = naechstes.start; if (this.beiWarten) this.beiWarten(naechstes); }
        }
        if (this.halt !== null) return;
        bis = Math.min(bis, naechstes.start - 1e-4);
      }
    }

    const noten = this.modell.noten;
    while (this.idx < noten.length && noten[this.idx].start < bis) {
      const n = noten[this.idx++];
      if (!this.hoeren[n.hand]) continue;
      if (wartet && this.warteModus.haende.has(n.hand)) continue;
      this.klang.ton(n.midi, this.zuAudioZeit(n.start), (n.dur * 0.96) / this.tempo, n.hand === 'X' ? n.vel * 0.7 : n.vel);
    }
    if (this.metronom) {
      while (this.schlagIdx < this.schlaege.length && this.schlaege[this.schlagIdx].t < bis) {
        const s = this.schlaege[this.schlagIdx++];
        this.klang.klick(this.zuAudioZeit(s.t), s.betont);
      }
    } else {
      this.schlagIdx = this.ersterSchlag(bis);
    }

    if (jetzt >= grenze - 0.002) {
      if (this.stopBei === null && this.schleife) { this.springe(this.schleife.start); return; }
      this.pause();
      this.pos = grenze === Infinity ? this.modell.dauer : grenze;
      if (this.beiEnde) this.beiEnde();
      return;
    }
    if (this.stopBei === null && !this.schleife && jetzt >= this.modell.dauer + 0.4) {
      this.pause();
      this.pos = this.modell.dauer;
      if (this.beiEnde) this.beiEnde();
    }
  }

  // ---- Warte-Modus ----
  setWarteModus(haende) {
    this.warteModus = haende && haende.size ? { haende } : null;
    this.baueEreignisse();
    this.halt = null;
    if (this.spielt) this.springe(this.jetzt());
  }

  baueEreignisse() {
    this.ereignisse = [];
    if (!this.modell || !this.warteModus) return;
    const noten = this.modell.noten.filter((n) => this.warteModus.haende.has(n.hand));
    for (const n of noten) {
      const letztes = this.ereignisse[this.ereignisse.length - 1];
      if (letztes && Math.abs(n.start - letztes.start) < 0.035) letztes.tasten.add(n.midi);
      else this.ereignisse.push({ start: n.start, tasten: new Set([n.midi]) });
    }
  }

  ersteEreignis(t) {
    const e = this.ereignisse;
    let lo = 0, hi = e.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (e[mid].start < t - 1e-4) lo = mid + 1; else hi = mid; }
    return lo;
  }

  erfuellt(ereignis) { for (const k of ereignis.tasten) if (!this.treffer.has(k)) return false; return true; }

  weiter() {
    const e = this.ereignisse[this.wIdx];
    if (this.halt !== null) {
      this.ankerPos = this.halt;
      this.ankerZeit = this.klang.zeit;
      this.halt = null;
    }
    this.treffer.clear();
    this.wIdx++;
    return e;
  }

  // vom MIDI-Keyboard
  tasteGedrueckt(midi) {
    if (!this.warteModus || !this.spielt) return;
    const e = this.ereignisse[this.wIdx];
    if (!e) return;
    if (e.tasten.has(midi)) this.treffer.add(midi);
    if (this.halt !== null && this.erfuellt(e)) this.weiter();
  }

  wartetAuf() { return this.halt !== null ? this.ereignisse[this.wIdx] : null; }
};
