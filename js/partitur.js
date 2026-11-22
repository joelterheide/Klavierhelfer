// Verbindung zur Notensatz-Bibliothek OpenSheetMusicDisplay:
// liest aus der geladenen Partitur alle Töne mit Zeiten, Händen und Takten
// und schreibt berechnete Fingersätze zurück ins Notenbild.
window.KH = window.KH || {};

KH.Partitur = {
  // Läuft genau wie der Cursor durch die Partitur (auch durch Wiederholungen).
  laufe(osmd, beiSchritt) {
    const it = osmd.Sheet.MusicPartManager.getIterator();
    it.SkipInvisibleNotes = true;
    let n = 0;
    while (!it.EndReached && n < 200000) {
      beiSchritt(it, n);
      it.moveToNextVisibleVoiceEntry(false);
      n++;
    }
    return n;
  },

  // Welche Hand spielt welches Notensystem?
  haende(sheet) {
    const systeme = [];
    sheet.Instruments.forEach((ins, ii) => ins.Staves.forEach((st, si) => systeme.push({ id: st.idInMusicSheet, ii, si })));
    const klavier = sheet.Instruments.findIndex((ins) => ins.Staves.length >= 2);
    const hand = new Map();
    if (klavier >= 0) systeme.forEach((s) => hand.set(s.id, s.ii === klavier ? (s.si === 0 ? 'R' : s.si === 1 ? 'L' : 'X') : 'X'));
    else if (systeme.length === 1) hand.set(systeme[0].id, 'R');
    else systeme.forEach((s, k) => hand.set(s.id, k === 0 ? 'R' : k === 1 ? 'L' : 'X'));
    return hand;
  },

  // Sammelt die klingenden Töne einer Position in fester Reihenfolge.
  toeneAnPosition(it) {
    const out = [];
    for (const ve of it.CurrentVoiceEntries) {
      for (const note of ve.Notes) {
        if (note.isRest() || !note.Pitch) continue;
        if (note.NoteTie && note.NoteTie.StartNote && note.NoteTie.StartNote !== note) continue;
        out.push({ note, ve });
      }
    }
    return out;
  },

  modell(osmd, dateiname) {
    const sheet = osmd.Sheet;
    const handVon = KH.Partitur.haende(sheet);
    const noten = [], schritte = [], takte = [];
    let bpm = sheet.DefaultStartTempoInBpm > 0 ? sheet.DefaultStartTempoInBpm : 100;
    const startBpm = bpm;
    let sek = 0, vorherW = null, vorherTakt = -1, vorherRel = -1;
    KH.Partitur.laufe(osmd, (it) => {
      const w = it.CurrentEnrolledTimestamp.RealValue;
      if (vorherW !== null) sek += Math.max(0, w - vorherW) * 240 / bpm;
      vorherW = w;
      if (it.CurrentBpm > 0) bpm = it.CurrentBpm;
      const taktIndex = it.CurrentMeasureIndex;
      const rel = it.CurrentRelativeInMeasureTimestamp ? it.CurrentRelativeInMeasureTimestamp.RealValue : 0;
      if (taktIndex !== vorherTakt || rel < vorherRel - 1e-9) {
        const sm = it.CurrentMeasure;
        const ts = sm && sm.ActiveTimeSignature;
        if (takte.length) takte[takte.length - 1].ende = sek - rel * 240 / bpm;
        takte.push({
          nr: sm ? sm.MeasureNumber : takte.length + 1,
          start: sek - rel * 240 / bpm,
          ende: null,
          laengeW: sm ? sm.Duration.RealValue : 1,
          zaehler: ts ? ts.Numerator : 4,
          nenner: ts ? ts.Denominator : 4,
          bpm,
        });
      }
      vorherTakt = taktIndex;
      vorherRel = rel;
      const schritt = schritte.length;
      schritte.push({ t: sek, takt: takte.length - 1 });
      for (const { note, ve } of KH.Partitur.toeneAnPosition(it)) {
        const laengeW = note.NoteTie ? note.NoteTie.Duration.RealValue : note.Length.RealValue;
        let start = sek, dur = laengeW * 240 / bpm;
        if (ve.IsGrace) { start = Math.max(0, sek - 0.07); dur = 0.07; }
        const fest = note.Fingering ? parseInt(note.Fingering.value, 10) : NaN;
        noten.push({
          midi: note.halfTone + 12,
          start, dur: Math.max(0.04, dur),
          hand: handVon.get(note.ParentStaff.idInMusicSheet) || 'X',
          vel: 0.72,
          finger: null,
          fest: fest >= 1 && fest <= 5 ? fest : null,
          ausDatei: fest >= 1 && fest <= 5,
          osmd: note,
          schritt,
        });
      }
    });
    const letzter = takte[takte.length - 1];
    if (letzter) letzter.ende = letzter.start + letzter.laengeW * 240 / letzter.bpm;
    noten.forEach((n, i) => { n.i = i; });
    // Bei Wiederholungen kommt dieselbe Note mehrmals vor: alle Durchgänge zeigen auf den ersten.
    const erste = new Map();
    for (const n of noten) { if (!erste.has(n.osmd)) erste.set(n.osmd, n); n.erste = erste.get(n.osmd); }
    const dauer = Math.max(noten.reduce((a, n) => Math.max(a, n.start + n.dur), 0), letzter ? letzter.ende : 0);
    const reihenfolge = noten.slice().sort((a, b) => a.start - b.start || a.midi - b.midi);
    return {
      typ: 'xml',
      titel: sheet.TitleString || (dateiname || 'Stück').replace(/\.(musicxml|xml|mxl)$/i, ''),
      komponist: sheet.ComposerString || '',
      noten: reihenfolge, schritte, takte, dauer,
      bpm: Math.round(startBpm),
    };
  },

  // Schreibt Fingersätze als Fingersatz-Ziffern in die Partitur (vor dem Zeichnen aufrufen).
  // notenListe: Liste {osmd, finger, ausDatei} in der Reihenfolge von laufe().
  fingersatzEintragen(notenListe) {
    const ns = window.opensheetmusicdisplay;
    for (const n of notenListe) {
      const note = n.osmd;
      if (!note || (n.erste && n.erste !== n)) continue;
      const ve = note.ParentVoiceEntry;
      if (n._ti) {
        const i = ve.TechnicalInstructions.indexOf(n._ti);
        if (i >= 0) ve.TechnicalInstructions.splice(i, 1);
        if (note.Fingering === n._ti) note.Fingering = undefined;
        n._ti = null;
      }
      if (!n.finger || (n.hand !== 'R' && n.hand !== 'L')) continue;
      if (n.ausDatei && note.Fingering) { note.Fingering.value = String(n.finger); continue; }
      const ti = new ns.TechnicalInstruction();
      ti.type = ns.TechnicalInstructionType.Fingering;
      ti.value = String(n.finger);
      ti.placement = 4; // noch nicht festgelegt: Standardplatz (über/unter dem System)
      ti.sourceNote = note;
      ve.TechnicalInstructions.push(ti);
      note.Fingering = ti;
      n._ti = ti;
    }
  },

  // Für ein zweites Notenbild derselben Datei (Notenzeile im Video): Töne in gleicher Reihenfolge.
  notenInReihenfolge(osmd) {
    const out = [];
    KH.Partitur.laufe(osmd, (it) => { for (const { note } of KH.Partitur.toeneAnPosition(it)) out.push(note); });
    return out;
  },
};
