// Liest Standard-MIDI-Dateien (Format 0 und 1) und macht daraus Töne mit Zeit in Sekunden.
window.KH = window.KH || {};

KH.Midi = {
  lesen(buffer) {
    const d = new DataView(buffer);
    let p = 0;
    const text = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); return s; };
    if (d.byteLength < 14 || text(4) !== 'MThd') throw new Error('Das ist keine gültige MIDI-Datei.');
    const kopfLaenge = d.getUint32(4);
    const anzahlSpuren = d.getUint16(10);
    const teilung = d.getUint16(12);
    if (teilung & 0x8000) throw new Error('MIDI-Dateien mit SMPTE-Zeitbasis werden nicht unterstützt.');
    p = 8 + kopfLaenge;
    const spuren = [], tempi = [], takte = [];
    let titel = '';
    for (let s = 0; s < anzahlSpuren && p + 8 <= d.byteLength; s++) {
      const id = text(4), laenge = d.getUint32(p + 4);
      p += 8;
      const ende = Math.min(d.byteLength, p + laenge);
      if (id !== 'MTrk') { p = ende; continue; }
      let tick = 0, laufStatus = 0, name = '';
      const offen = new Map(), noten = [];
      const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80 && p < ende); return v; };
      while (p < ende) {
        tick += vlq();
        if (p >= ende) break;
        let status = d.getUint8(p);
        if (status >= 0xf0) {
          p++;
          if (status === 0xff) {
            const typ = d.getUint8(p++), ml = vlq();
            if (typ === 0x51 && ml >= 3) tempi.push({ tick, uspq: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2) });
            else if (typ === 0x58 && ml >= 2) takte.push({ tick, zaehler: d.getUint8(p), nenner: 2 ** d.getUint8(p + 1) });
            else if (typ === 0x03 && !name) { let t = ''; for (let i = 0; i < ml; i++) t += String.fromCharCode(d.getUint8(p + i)); name = t.trim(); }
            p += ml;
            if (typ === 0x2f) break;
          } else {
            p += vlq();
          }
          continue;
        }
        if (status & 0x80) { laufStatus = status; p++; } else status = laufStatus;
        const art = status & 0xf0, kanal = status & 0x0f;
        if (art === 0x90 || art === 0x80) {
          const taste = d.getUint8(p++), staerke = d.getUint8(p++);
          const k = kanal * 128 + taste;
          if (art === 0x90 && staerke > 0) {
            if (!offen.has(k)) offen.set(k, []);
            offen.get(k).push({ tick, staerke });
          } else {
            const liste = offen.get(k);
            if (liste && liste.length) { const an = liste.shift(); noten.push({ midi: taste, kanal, startTick: an.tick, endeTick: tick, staerke: an.staerke }); }
          }
        } else if (art === 0xa0 || art === 0xb0 || art === 0xe0) p += 2;
        else if (art === 0xc0 || art === 0xd0) p += 1;
        else break;
      }
      for (const liste of offen.values()) for (const an of liste) noten.push({ midi: 0, kanal: 0, startTick: an.tick, endeTick: tick, staerke: an.staerke, kaputt: true });
      p = ende;
      if (!titel && name) titel = name;
      spuren.push({ name, noten: noten.filter((n) => !n.kaputt) });
    }
    return { ppq: teilung, spuren, tempi, takte, titel };
  },

  // Baut das gemeinsame Modell der Seite aus einer MIDI-Datei.
  modell(buffer, dateiname) {
    const m = KH.Midi.lesen(buffer);
    const tempi = m.tempi.slice().sort((a, b) => a.tick - b.tick);
    if (!tempi.length || tempi[0].tick > 0) tempi.unshift({ tick: 0, uspq: 500000 });
    const abschnitte = [];
    let sek = 0;
    for (let i = 0; i < tempi.length; i++) {
      if (i > 0) sek += ((tempi[i].tick - tempi[i - 1].tick) * tempi[i - 1].uspq) / 1e6 / m.ppq;
      abschnitte.push({ tick: tempi[i].tick, sek, uspq: tempi[i].uspq });
    }
    const zuSek = (tick) => {
      let a = abschnitte[0];
      for (const x of abschnitte) { if (x.tick <= tick) a = x; else break; }
      return a.sek + ((tick - a.tick) * a.uspq) / 1e6 / m.ppq;
    };
    const bpmBei = (tick) => {
      let a = abschnitte[0];
      for (const x of abschnitte) { if (x.tick <= tick) a = x; else break; }
      return 60e6 / a.uspq;
    };

    const mitNoten = m.spuren.map((s, i) => ({ ...s, i })).filter((s) => s.noten.some((n) => n.kanal !== 9));
    let handVon;
    if (mitNoten.length >= 2) {
      const schnitt = (s) => s.noten.reduce((a, n) => a + n.midi, 0) / s.noten.length;
      const [a, b] = mitNoten.slice(0, 2).sort((x, y) => schnitt(y) - schnitt(x));
      handVon = (spur, n) => (spur === a.i ? 'R' : spur === b.i ? 'L' : 'X');
    } else {
      handVon = (spur, n) => (n.midi >= 60 ? 'R' : 'L');
    }
    const noten = [];
    let letzterTick = 0;
    m.spuren.forEach((s, si) => {
      for (const n of s.noten) {
        if (n.kanal === 9) continue;
        const start = zuSek(n.startTick), ende = zuSek(Math.max(n.endeTick, n.startTick + 1));
        letzterTick = Math.max(letzterTick, n.endeTick);
        noten.push({ midi: n.midi, start, dur: Math.max(0.04, ende - start), hand: handVon(si, n), vel: Math.max(0.25, n.staerke / 127), finger: null, fest: null, osmd: null });
      }
    });
    noten.sort((a, b) => a.start - b.start || a.midi - b.midi);

    const takte = m.takte.slice().sort((a, b) => a.tick - b.tick);
    if (!takte.length || takte[0].tick > 0) takte.unshift({ tick: 0, zaehler: 4, nenner: 4 });
    const masse = [];
    let tick = 0, nr = 1, ti = 0;
    while (tick <= letzterTick && masse.length < 5000) {
      while (ti + 1 < takte.length && takte[ti + 1].tick <= tick) ti++;
      const t = takte[ti];
      const laenge = Math.round((m.ppq * 4 * t.zaehler) / t.nenner);
      masse.push({ nr, start: zuSek(tick), ende: zuSek(tick + laenge), zaehler: t.zaehler, nenner: t.nenner, bpm: bpmBei(tick) });
      tick += laenge; nr++;
    }
    const dauer = Math.max(noten.reduce((a, n) => Math.max(a, n.start + n.dur), 0), masse.length ? masse[masse.length - 1].ende : 0);
    return {
      typ: 'midi',
      titel: m.titel || (dateiname || 'MIDI-Datei').replace(/\.(mid|midi)$/i, ''),
      komponist: '',
      noten, schritte: [], takte: masse, dauer,
      bpm: Math.round(60e6 / tempi[0].uspq),
    };
  },
};
