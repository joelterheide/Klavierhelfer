// Klavierhelfer: verbindet Notenbild, Fingersatz, Wasserfall, Klang und Video mit der Oberfläche.
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const klang = new KH.Klang();
  const spieler = new KH.Spieler(klang);
  const wf = new KH.Wasserfall();
  const video = new KH.Video({ spieler, klang, wasserfall: wf });

  const zustand = {
    modell: null, osmd: null, quelle: null, schritt: 0, schluessel: '', neuZeichnen: true,
    gedrueckt: new Set(), ladeNr: 0, notenBreite: 0, notenVeraltet: false, ziehen: false, letzteZeit: '',
  };
  const einst = {
    ansicht: 'beides', haende: 'beide', vorschau: 3, beschriftung: 'c', fsNoten: true, fsWasserfall: true,
    handgroesse: 'mittel', hoerR: true, hoerL: true, hoerX: true, metronom: false, einzaehler: false, lautstaerke: 0.8,
  };
  const SPEICHER = 'kh-einstellungen';
  try { Object.assign(einst, JSON.parse(localStorage.getItem(SPEICHER)) || {}); } catch (e) { /* ohne Speicher */ }
  const einstSpeichern = () => { try { localStorage.setItem(SPEICHER, JSON.stringify(einst)); } catch (e) { /* ohne Speicher */ } };

  // ---------- Hilfen ----------
  let toastTimer = null;
  function toast(text, dauer = 3200) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('sichtbar');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('sichtbar'), dauer);
  }
  const zeitText = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const handName = (h) => (h === 'R' ? 'Rechte Hand' : 'Linke Hand');
  const haendeSichtbar = () => ({ R: einst.haende !== 'L', L: einst.haende !== 'R', X: einst.haende === 'beide' });

  // ---------- Laden ----------
  function holeOsmd() {
    if (zustand.osmd) return zustand.osmd;
    zustand.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay($('#noten'), {
      autoResize: false, backend: 'svg',
      drawTitle: false, drawSubtitle: false, drawComposer: false, drawLyricist: false, drawCredits: false, drawPartNames: false,
      drawFingerings: einst.fsNoten, drawMeasureNumbersOnlyAtSystemStart: true, followCursor: false,
      cursorsOptions: [{ type: 0, color: '#2f6ee0', alpha: 0.28, follow: false }],
    });
    return zustand.osmd;
  }

  async function ladeStueck({ art, daten, name }) {
    const nr = ++zustand.ladeNr;
    spieler.stop();
    spielKnopf();
    $('#titel').textContent = 'Wird geladen …';
    $('#untertitel').textContent = '';
    try {
      let modell;
      if (art === 'midi') {
        modell = KH.Midi.modell(daten, name);
        modell.noten.forEach((n, i) => { n.i = i; });
        zustand.quelle = null;
        if (zustand.osmd) zustand.osmd.clear();
      } else {
        const osmd = holeOsmd();
        await osmd.load(daten);
        if (nr !== zustand.ladeNr) return;
        modell = KH.Partitur.modell(osmd, name);
        zustand.quelle = daten;
      }
      if (!modell.noten.length) throw new Error('In der Datei wurden keine Töne gefunden.');
      for (const n of modell.noten) n.dateiFinger = n.ausDatei ? n.fest : null;
      zustand.modell = modell;
      zustand.schritt = 0;
      zustand.schluessel = 'kh-fs:' + modell.typ + ':' + modell.titel + ':' + modell.noten.length + ':' + modell.noten.reduce((a, n) => a + n.midi, 0);
      eigeneLaden();
      fingersatzBerechnen(modell);
      wf.setModell(modell);
      spieler.setModell(modell);
      haendeAnwenden();
      $('#noten-hinweis').hidden = modell.typ === 'xml';
      $('#noten').hidden = modell.typ !== 'xml';
      document.body.classList.toggle('ist-midi', modell.typ !== 'xml');
      if (modell.typ === 'xml') { $('#noten').scrollTop = 0; notenZeichnen(); }
      const teile = [];
      if (modell.komponist) teile.push(modell.komponist);
      teile.push(modell.takte.length + ' Takte', 'Tempo ' + modell.bpm, zeitText(modell.dauer) + ' min');
      if (modell.typ === 'midi') teile.push('MIDI-Datei');
      $('#titel').textContent = modell.titel;
      $('#untertitel').textContent = teile.join(' · ');
      document.title = modell.titel + ' – Klavierhelfer';
      $('#hoer-x-zeile').hidden = !modell.noten.some((n) => n.hand === 'X');
      const maxTakt = Math.max(...modell.takte.map((t) => t.nr), 1);
      $('#von').max = maxTakt; $('#bis').max = maxTakt;
      if (+$('#bis').value > maxTakt) $('#bis').value = Math.min(4, maxTakt);
      if (+$('#von').value > maxTakt) $('#von').value = 1;
      schleifeAnwenden();
      layout();
      zustand.neuZeichnen = true;
    } catch (e) {
      console.error(e);
      $('#titel').textContent = 'Datei konnte nicht geöffnet werden';
      toast('Die Datei konnte nicht gelesen werden: ' + (e && e.message ? e.message : e), 6000);
    }
  }

  async function dateiOeffnen(datei) {
    if (!datei) return;
    const endung = (datei.name.split('.').pop() || '').toLowerCase();
    if (['mid', 'midi'].includes(endung)) return ladeStueck({ art: 'midi', daten: await datei.arrayBuffer(), name: datei.name });
    if (endung === 'mxl') return ladeStueck({ art: 'xml', daten: datei, name: datei.name });
    if (['musicxml', 'xml'].includes(endung)) return ladeStueck({ art: 'xml', daten: await datei.text(), name: datei.name });
    if (['pdf', 'png', 'jpg', 'jpeg', 'heic'].includes(endung)) {
      toast('PDFs und Fotos kann der Klavierhelfer nicht direkt lesen. In MuseScore über „Datei → PDF importieren“ umwandeln und als MusicXML speichern.', 8000);
      return;
    }
    if (endung === 'mscz') { toast('MuseScore-Dateien bitte in MuseScore über „Datei → Exportieren → MusicXML“ speichern.', 7000); return; }
    toast('Dieses Format wird nicht unterstützt. Bitte MusicXML (.musicxml, .xml, .mxl) oder MIDI (.mid) öffnen.', 6000);
  }

  // ---------- Fingersatz ----------
  function eigeneLaden() {
    let gespeichert = {};
    try { gespeichert = JSON.parse(localStorage.getItem(zustand.schluessel)) || {}; } catch (e) { /* nichts */ }
    for (const n of zustand.modell.noten) {
      const f = gespeichert[n.i];
      if (f >= 1 && f <= 5) { n.fest = f; n.eigen = true; }
    }
  }
  function eigeneSpeichern() {
    const daten = {};
    for (const n of zustand.modell.noten) if (n.eigen) daten[n.i] = n.fest;
    try {
      if (Object.keys(daten).length) localStorage.setItem(zustand.schluessel, JSON.stringify(daten));
      else localStorage.removeItem(zustand.schluessel);
    } catch (e) { /* nichts */ }
  }
  function fingersatzBerechnen(m) {
    KH.Fingersatz.berechne(m.noten, einst.handgroesse);
    for (const n of m.noten) if (n.erste && n.erste !== n) n.finger = n.erste.finger;
  }
  function fingersatzNeu() {
    fingersatzBerechnen(zustand.modell);
    zustand.neuZeichnen = true;
    if (zustand.modell.typ === 'xml') notenZeichnen();
  }

  // ---------- Notenbild ----------
  function notenZeichnen() {
    const osmd = zustand.osmd, m = zustand.modell;
    if (!osmd || !m || m.typ !== 'xml') return;
    const box = $('#noten');
    if (einst.ansicht === 'wasserfall' || box.clientWidth < 50) { zustand.notenVeraltet = true; return; }
    osmd.setOptions({ drawFingerings: einst.fsNoten });
    KH.Partitur.fingersatzEintragen(m.noten);
    const breite = box.clientWidth;
    osmd.Zoom = breite < 560 ? 0.6 : breite < 900 ? 0.8 : 1;
    const oben = box.scrollTop;
    osmd.render();
    box.scrollTop = oben;
    zustand.notenBreite = breite;
    zustand.notenVeraltet = false;
    osmd.cursor.show();
    cursorZu(schrittBei(spieler.jetzt()), true);
  }

  function schrittBei(t) {
    const s = zustand.modell ? zustand.modell.schritte : [];
    let lo = 0, hi = s.length - 1, best = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (s[mid].t <= t + 0.005) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    return best;
  }

  function cursorZu(ziel, sofort) {
    const osmd = zustand.osmd, m = zustand.modell;
    if (!osmd || !m || m.typ !== 'xml' || !m.schritte.length || zustand.notenVeraltet) return;
    const c = osmd.cursor;
    if (!c) return;
    if (!sofort && ziel === zustand.schritt) return;
    if (!sofort && ziel > zustand.schritt && ziel - zustand.schritt <= 12) {
      while (zustand.schritt < ziel) { c.next(); zustand.schritt++; }
    } else {
      c.hide(); c.reset();
      for (let i = 0; i < ziel; i++) c.next();
      c.show();
      zustand.schritt = ziel;
    }
    notenScrollen();
  }

  function notenScrollen() {
    const box = $('#noten');
    const cur = zustand.osmd && zustand.osmd.cursor && zustand.osmd.cursor.cursorElement;
    if (!cur || cur.style.display === 'none') return;
    const b = box.getBoundingClientRect(), r = cur.getBoundingClientRect();
    if (!r.height) return;
    if (r.top < b.top + 6 || r.bottom > b.bottom - 6) {
      const ziel = r.top - b.top + box.scrollTop - 14;
      box.scrollTo({ top: Math.max(0, ziel), behavior: spieler.spielt ? 'smooth' : 'auto' });
    }
  }

  // ---------- Wasserfall ----------
  function ansicht(merken) {
    const w = spieler.wartetAuf();
    return {
      vorschau: Number(einst.vorschau) || 3,
      haende: haendeSichtbar(),
      finger: einst.fsWasserfall,
      beschriftung: einst.beschriftung,
      gedrueckt: merken ? zustand.gedrueckt : null,
      warten: merken && w ? w.tasten : null,
      schleife: merken ? spieler.schleife : null,
      merken,
    };
  }

  function zeichneWasserfall(jetzt) {
    const cv = $('#wasserfall');
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wf.zeichne(ctx, 0, 0, w, h, { ...ansicht(true), jetzt, skala: w < 600 ? 0.85 : 1 });
  }

  function schleifeAnwenden() {
    const m = zustand.modell;
    const aktiv = $('#schleife-knopf').getAttribute('aria-pressed') === 'true';
    $('#schleife-felder').hidden = !aktiv;
    if (!m || !aktiv) { spieler.schleife = null; zustand.neuZeichnen = true; return; }
    let von = parseInt($('#von').value, 10) || 1, bis = parseInt($('#bis').value, 10) || von;
    if (bis < von) { bis = von; $('#bis').value = bis; }
    let a = m.takte.findIndex((t) => t.nr === von);
    if (a < 0) a = Math.max(0, Math.min(m.takte.length - 1, von - 1));
    let b = m.takte.findIndex((t, i) => i >= a && t.nr === bis);
    if (b < 0) b = Math.max(a, Math.min(m.takte.length - 1, a + (bis - von)));
    spieler.schleife = { start: m.takte[a].start, ende: m.takte[b].ende };
    const t = spieler.jetzt();
    if (t < spieler.schleife.start - 0.01 || t >= spieler.schleife.ende) springe(spieler.schleife.start);
    zustand.neuZeichnen = true;
  }

  function springe(t) {
    spieler.springe(t);
    zustand.neuZeichnen = true;
    cursorZu(schrittBei(Math.max(0, t)), false);
  }

  // Noten und Wasserfall sollen zusammen genau über die Wiedergabe-Leiste passen.
  function layout() {
    const transport = document.querySelector('.transport').offsetHeight;
    const karte = $('#noten-karte');
    const oben = (einst.ansicht === 'wasserfall' ? $('#wasserfall-karte') : karte).getBoundingClientRect().top + window.scrollY;
    const frei = Math.max(380, window.innerHeight - transport - oben - 12);
    document.documentElement.style.setProperty('--frei', frei + 'px');
    if (!$('#noten-hinweis').hidden) document.documentElement.style.setProperty('--hinweis-hoehe', $('#noten-karte').offsetHeight + 'px');
    zustand.neuZeichnen = true;
  }

  // ---------- Bildschirm-Schleife ----------
  function bild() {
    requestAnimationFrame(bild);
    const m = zustand.modell;
    if (!m) return;
    const jetzt = spieler.jetzt();
    const wartet = spieler.wartetAuf();
    if (spieler.spielt || zustand.neuZeichnen || wartet) {
      if (einst.ansicht !== 'noten') zeichneWasserfall(jetzt);
      zustand.neuZeichnen = false;
    }
    if (m.typ === 'xml' && einst.ansicht !== 'wasserfall') {
      const z = schrittBei(Math.max(0, jetzt));
      if (z !== zustand.schritt) cursorZu(z, false);
    }
    if (!zustand.ziehen) $('#position').value = String(Math.round((Math.max(0, jetzt) / Math.max(0.1, m.dauer)) * 1000));
    const text = zeitText(jetzt) + ' / ' + zeitText(m.dauer);
    if (text !== zustand.letzteZeit) { $('#zeit').textContent = text; zustand.letzteZeit = text; }
    const takt = m.takte.length ? m.takte[spieler.taktBei(Math.max(0, jetzt))].nr : 1;
    const taktText = 'Takt ' + takt + (spieler.schleife ? ' · Wiederholung' : '');
    if ($('#takt-anzeige').textContent !== taktText) $('#takt-anzeige').textContent = taktText;
    const hinweis = $('#warte-hinweis');
    if (wartet) {
      const namen = [...wartet.tasten].sort((a, b) => a - b).map((k) => KH.Wasserfall.tonName(k)).join(' + ');
      hinweis.textContent = 'Spiele: ' + namen;
      hinweis.hidden = false;
    } else if (!hinweis.hidden) hinweis.hidden = true;
  }

  function spielKnopf() {
    const k = $('#spielen');
    k.classList.toggle('spielt', spieler.spielt);
    k.setAttribute('aria-label', spieler.spielt ? 'Pause' : 'Abspielen');
  }

  async function umschalten() {
    if (!zustand.modell) return;
    if (spieler.spielt) spieler.pause();
    else await spieler.play();
    spielKnopf();
    zustand.neuZeichnen = true;
  }
  spieler.beiEnde = () => { spielKnopf(); zustand.neuZeichnen = true; };

  function haendeAnwenden() {
    spieler.hoeren = { R: einst.hoerR, L: einst.hoerL, X: einst.hoerX };
    spieler.metronom = einst.metronom;
    spieler.einzaehler = einst.einzaehler;
    klang.setLautstaerke(Number(einst.lautstaerke));
    if ($('#warte').checked) spieler.setWarteModus(new Set(einst.haende === 'beide' ? ['R', 'L'] : [einst.haende]));
    else spieler.setWarteModus(null);
    zustand.neuZeichnen = true;
  }

  function ansichtAnwenden() {
    document.body.classList.toggle('nur-wasserfall', einst.ansicht === 'wasserfall');
    document.body.classList.toggle('nur-noten', einst.ansicht === 'noten');
    layout();
    zustand.neuZeichnen = true;
    if (einst.ansicht !== 'wasserfall' && zustand.modell && zustand.modell.typ === 'xml') {
      requestAnimationFrame(() => {
        if (zustand.notenVeraltet || Math.abs($('#noten').clientWidth - zustand.notenBreite) > 20) notenZeichnen();
      });
    }
  }

  // ---------- Bedienelemente ----------
  function verbinden() {
    const sel = $('#beispiel');
    for (const b of KH.BEISPIELE) {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = b.titel + (b.komponist && b.komponist !== 'Übung' ? ' – ' + b.komponist : '');
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      const b = KH.BEISPIELE.find((x) => x.id === sel.value);
      if (b) ladeStueck({ art: 'xml', daten: b.xml, name: b.titel });
      sel.value = '';
    });
    $('#datei').addEventListener('change', (e) => { dateiOeffnen(e.target.files[0]); e.target.value = ''; });

    $('#spielen').addEventListener('click', umschalten);
    $('#anfang').addEventListener('click', () => springe(spieler.schleife ? spieler.schleife.start : 0));
    const pos = $('#position');
    pos.addEventListener('pointerdown', () => { zustand.ziehen = true; });
    window.addEventListener('pointerup', () => { zustand.ziehen = false; });
    pos.addEventListener('input', () => { if (zustand.modell) springe((pos.value / 1000) * zustand.modell.dauer); });
    pos.addEventListener('change', () => { zustand.ziehen = false; });

    const tempo = $('#tempo');
    const tempoSetzen = (v) => {
      v = Math.max(25, Math.min(150, v));
      tempo.value = v;
      $('#tempo-wert').textContent = v + ' %';
      spieler.setTempo(v / 100);
    };
    tempo.addEventListener('input', () => tempoSetzen(+tempo.value));

    $('#schleife-knopf').addEventListener('click', (e) => {
      const k = e.currentTarget;
      const an = k.getAttribute('aria-pressed') !== 'true';
      k.setAttribute('aria-pressed', String(an));
      if (an && zustand.modell) {
        const t = zustand.modell.takte[spieler.taktBei(Math.max(0, spieler.jetzt()))];
        if (t) { $('#von').value = t.nr; $('#bis').value = Math.min(t.nr + 3, Math.max(...zustand.modell.takte.map((x) => x.nr))); }
      }
      schleifeAnwenden();
    });
    $('#von').addEventListener('change', schleifeAnwenden);
    $('#bis').addEventListener('change', schleifeAnwenden);

    // Fingersatz durch Antippen ändern
    $('#wasserfall').addEventListener('click', (e) => {
      if (!zustand.modell) return;
      const r = e.currentTarget.getBoundingClientRect();
      const n = wf.treffer(e.clientX - r.left, e.clientY - r.top);
      if (!n) return;
      if (n.hand !== 'R' && n.hand !== 'L') return;
      if (spieler.spielt) { toast('Zum Ändern des Fingersatzes zuerst auf Pause drücken.'); return; }
      const neu = n.finger ? (n.finger % 5) + 1 : 1;
      for (const x of zustand.modell.noten) {
        if (x === n || (n.erste && x.erste === n.erste)) { x.fest = neu; x.eigen = true; }
      }
      eigeneSpeichern();
      fingersatzNeu();
      toast(`${handName(n.hand)}, ${KH.Wasserfall.tonName(n.midi)}: jetzt Finger ${neu}. Nochmals antippen für den nächsten Finger.`);
    });

    // Tastatur
    document.addEventListener('keydown', (e) => {
      if (!zustand.modell || e.ctrlKey || e.metaKey || e.altKey) return;
      const ziel = e.target;
      if (ziel.closest && ziel.closest('dialog[open]')) return;
      const feld = ziel.tagName === 'INPUT' && ziel.type !== 'range' && ziel.type !== 'checkbox';
      if (feld || ziel.tagName === 'SELECT' || ziel.tagName === 'TEXTAREA') return;
      const m = zustand.modell;
      if (e.code === 'Space') { e.preventDefault(); umschalten(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const jetzt = Math.max(0, spieler.jetzt());
        let i = spieler.taktBei(jetzt);
        if (e.key === 'ArrowLeft') { if (jetzt - m.takte[i].start < 0.4) i = Math.max(0, i - 1); }
        else i = Math.min(m.takte.length - 1, i + 1);
        springe(m.takte[i].start);
      } else if (e.key === 'Home') { e.preventDefault(); springe(spieler.schleife ? spieler.schleife.start : 0); }
      else if (e.key === '+' || e.key === '=') tempoSetzen(+tempo.value + 5);
      else if (e.key === '-') tempoSetzen(+tempo.value - 5);
    });

    // Einstellungen
    const dlg = $('#einstellungen');
    $('#einstellungen-knopf').addEventListener('click', () => dlg.showModal());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    const binden = (id, schluessel, art, danach) => {
      const feld = $('#' + id);
      if (art === 'haken') feld.checked = !!einst[schluessel]; else feld.value = String(einst[schluessel]);
      feld.addEventListener(art === 'regler' ? 'input' : 'change', () => {
        einst[schluessel] = art === 'haken' ? feld.checked : art === 'regler' ? Number(feld.value) : feld.value;
        einstSpeichern();
        if (danach) danach();
        zustand.neuZeichnen = true;
      });
    };
    binden('ansicht', 'ansicht', 'wahl', ansichtAnwenden);
    binden('haende', 'haende', 'wahl', haendeAnwenden);
    binden('vorschau', 'vorschau', 'wahl');
    binden('beschriftung', 'beschriftung', 'wahl');
    binden('hoer-r', 'hoerR', 'haken', haendeAnwenden);
    binden('hoer-l', 'hoerL', 'haken', haendeAnwenden);
    binden('hoer-x', 'hoerX', 'haken', haendeAnwenden);
    binden('metronom', 'metronom', 'haken', haendeAnwenden);
    binden('einzaehler', 'einzaehler', 'haken', haendeAnwenden);
    binden('lautstaerke', 'lautstaerke', 'regler', haendeAnwenden);
    binden('fs-noten', 'fsNoten', 'haken', notenZeichnen);
    binden('fs-wasserfall', 'fsWasserfall', 'haken');
    binden('handgroesse', 'handgroesse', 'wahl', () => { if (zustand.modell) fingersatzNeu(); });
    $('#fs-reset').addEventListener('click', () => {
      if (!zustand.modell) return;
      for (const n of zustand.modell.noten) { if (n.eigen) { n.eigen = false; n.fest = n.dateiFinger; } }
      eigeneSpeichern();
      fingersatzNeu();
      toast('Deine Fingersatz-Änderungen wurden gelöscht.');
    });

    // MIDI-Keyboard
    $('#midi-verbinden').addEventListener('click', midiVerbinden);
    $('#warte').addEventListener('change', haendeAnwenden);

    // Video
    videoVerbinden();

    // Datei ablegen
    let tiefe = 0;
    window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer.types || [])].includes('Files')) { tiefe++; $('#ablage').hidden = false; } });
    window.addEventListener('dragleave', () => { tiefe = Math.max(0, tiefe - 1); if (!tiefe) $('#ablage').hidden = true; });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault(); tiefe = 0; $('#ablage').hidden = true;
      if (e.dataTransfer.files && e.dataTransfer.files[0]) dateiOeffnen(e.dataTransfer.files[0]);
    });

    // Größe
    let groessenTimer = null;
    window.addEventListener('resize', layout);
    new ResizeObserver(() => {
      zustand.neuZeichnen = true;
      clearTimeout(groessenTimer);
      groessenTimer = setTimeout(() => {
        if (zustand.modell && zustand.modell.typ === 'xml' && Math.abs($('#noten').clientWidth - zustand.notenBreite) > 20) notenZeichnen();
      }, 250);
    }).observe(document.querySelector('main'));
  }

  // ---------- MIDI-Eingabe ----------
  async function midiVerbinden() {
    const status = $('#midi-status');
    if (!navigator.requestMIDIAccess) { status.textContent = 'Dieser Browser unterstützt keine MIDI-Keyboards (Chrome oder Edge benutzen).'; return; }
    try {
      const zugang = await navigator.requestMIDIAccess();
      const anbinden = () => {
        const namen = [];
        zugang.inputs.forEach((eingang) => { eingang.onmidimessage = midiNachricht; namen.push(eingang.name); });
        status.textContent = namen.length ? 'Verbunden: ' + namen.join(', ') : 'Kein Keyboard gefunden. Per USB anschließen und einschalten.';
        $('#warte').disabled = !namen.length;
      };
      zugang.onstatechange = anbinden;
      anbinden();
    } catch (e) {
      status.textContent = 'Zugriff auf MIDI nicht erlaubt.';
    }
  }
  function midiNachricht(ev) {
    const [st, taste, staerke] = ev.data;
    const art = st & 0xf0;
    if (art === 0x90 && staerke > 0) {
      zustand.gedrueckt.add(taste);
      spieler.tasteGedrueckt(taste);
      if ($('#midi-hoeren').checked) klang.init().then(() => { klang.resume(); klang.halte(taste, staerke / 127); });
    } else if (art === 0x80 || (art === 0x90 && staerke === 0)) {
      zustand.gedrueckt.delete(taste);
      klang.lasse(taste);
    }
    zustand.neuZeichnen = true;
  }

  // ---------- Video ----------
  function videoVerbinden() {
    const dlg = $('#video-dialog');
    const fmt = $('#v-format');
    for (const [id, f] of Object.entries(KH.Video.FORMATE)) {
      const o = document.createElement('option'); o.value = id; o.textContent = f.name; fmt.appendChild(o);
    }
    let laeuft = false, url = null;
    const info = () => {
      const m = zustand.modell;
      if (!m) return;
      const schleife = document.querySelector('input[name="v-bereich"]:checked').value === 'schleife' && spieler.schleife;
      const laenge = (schleife ? spieler.schleife.ende - spieler.schleife.start : m.dauer) / spieler.tempo;
      const typ = KH.Video.dateityp();
      $('#v-info').textContent = `Länge etwa ${zeitText(laenge + 2)} min bei ${Math.round(spieler.tempo * 100)} % Tempo` +
        (typ ? ` · Datei: ${typ.endung.toUpperCase()}` : '') + '. Die Aufnahme dauert so lange wie das Video.';
      $('#v-noten').disabled = m.typ !== 'xml';
      if (m.typ !== 'xml') $('#v-noten').checked = false;
    };
    $('#video-knopf').addEventListener('click', () => {
      if (!zustand.modell) return;
      if (spieler.spielt) { spieler.pause(); spielKnopf(); }
      const s = $('#v-bereich-schleife');
      s.disabled = !spieler.schleife;
      if (!spieler.schleife) document.querySelector('input[name="v-bereich"][value="ganz"]').checked = true;
      if (!KH.Video.dateityp()) $('#v-status').textContent = 'Dieser Browser kann keine Videos aufnehmen. Bitte Chrome, Edge oder Firefox am Computer benutzen.';
      info();
      dlg.showModal();
    });
    document.querySelectorAll('input[name="v-bereich"]').forEach((r) => r.addEventListener('change', info));
    dlg.addEventListener('close', () => { if (laeuft) video.abbrechen(); });
    $('#v-abbrechen').addEventListener('click', () => video.abbrechen());
    $('#v-start').addEventListener('click', async () => {
      const m = zustand.modell;
      if (!m || laeuft) return;
      laeuft = true;
      const status = $('#v-status'), fort = $('#v-fortschritt'), dl = $('#v-download');
      dl.hidden = true;
      if (url) { URL.revokeObjectURL(url); url = null; }
      $('#v-start').hidden = true; $('#v-abbrechen').hidden = false;
      fort.hidden = false; fort.value = 0;
      try {
        const mitNoten = $('#v-noten').checked && m.typ === 'xml';
        if (mitNoten) {
          status.textContent = 'Notenzeile wird vorbereitet …';
          await video.notenzeileVorbereiten(zustand.quelle, m, einst.fsNoten, $('#unsichtbar'));
        }
        const schleife = document.querySelector('input[name="v-bereich"]:checked').value === 'schleife' && spieler.schleife;
        status.textContent = 'Aufnahme läuft … Bitte diesen Tab geöffnet lassen.';
        const ergebnis = await video.aufnehmen({
          format: fmt.value, mitNoten, einzaehler: $('#v-einzaehler').checked,
          start: schleife ? spieler.schleife.start : 0, ende: schleife ? spieler.schleife.ende : m.dauer,
          buehne: $('#v-buehne'), modell: m, ansicht: () => ansicht(false),
          beiFortschritt: (a) => { fort.value = a; },
        });
        if (ergebnis) {
          url = URL.createObjectURL(ergebnis.blob);
          dl.href = url;
          const name = (m.titel || 'klavierhelfer').replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim().replace(/\s+/g, '-');
          dl.download = name + '-klavierhelfer.' + ergebnis.endung;
          dl.hidden = false;
          status.textContent = `Fertig: ${(ergebnis.blob.size / 1048576).toFixed(1).replace('.', ',')} MB (${ergebnis.endung.toUpperCase()}).`;
        } else status.textContent = 'Aufnahme abgebrochen.';
      } catch (e) {
        console.error(e);
        status.textContent = 'Das Video konnte nicht erstellt werden: ' + (e.message || e);
      } finally {
        laeuft = false;
        $('#v-start').hidden = false; $('#v-abbrechen').hidden = true;
        fort.hidden = true;
        spielKnopf();
        zustand.neuZeichnen = true;
      }
    });
  }

  // ---------- Start ----------
  $('#ansicht').value = einst.ansicht;
  verbinden();
  ansichtAnwenden();
  haendeAnwenden();
  requestAnimationFrame(bild);
  const start = KH.BEISPIELE.find((b) => b.id === 'ode-an-die-freude') || KH.BEISPIELE[0];
  ladeStueck({ art: 'xml', daten: start.xml, name: start.titel });
  window.KH.app = { zustand, spieler, klang, wf, video, ladeStueck, dateiOeffnen, einst };
})();
