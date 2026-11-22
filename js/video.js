// Video-Export: nimmt Wasserfall, Fingersatz, eine mitlaufende Notenzeile und den Klang
// in Echtzeit auf (MediaRecorder) und liefert eine MP4- oder WebM-Datei.
window.KH = window.KH || {};

KH.Video = class Video {
  constructor({ spieler, klang, wasserfall }) {
    this.spieler = spieler;
    this.klang = klang;
    this.wf = wasserfall;
    this.zeile = null;
    this.abgebrochen = false;
  }

  static get FORMATE() {
    return {
      quer720: { w: 1280, h: 720, name: 'Querformat 1280 × 720' },
      quer1080: { w: 1920, h: 1080, name: 'Querformat 1920 × 1080 (Full HD)' },
      hoch720: { w: 720, h: 1280, name: 'Hochformat 720 × 1280 (Handy)' },
      hoch1080: { w: 1080, h: 1920, name: 'Hochformat 1080 × 1920 (Handy, Full HD)' },
    };
  }

  static dateityp() {
    const kandidaten = [
      ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1,mp4a', 'mp4'],
      ['video/mp4;codecs=avc1', 'mp4'],
      ['video/webm;codecs=vp9,opus', 'webm'],
      ['video/webm;codecs=vp8,opus', 'webm'],
      ['video/webm', 'webm'],
      ['video/mp4', 'mp4'],
    ];
    if (!window.MediaRecorder) return null;
    for (const [typ, endung] of kandidaten) if (MediaRecorder.isTypeSupported(typ)) return { typ, endung };
    return { typ: '', endung: 'webm' };
  }

  // Notenzeile: dieselbe Partitur einzeilig gesetzt, als Bild in Streifen zerlegt.
  async notenzeileVorbereiten(quelle, modell, fingerZeigen, buehne) {
    this.zeile = null;
    if (!quelle || modell.typ !== 'xml') return;
    buehne.innerHTML = '';
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-200000px;top:0;width:1200px;background:#fff';
    buehne.appendChild(box);
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(box, {
      autoResize: false, backend: 'svg', renderSingleHorizontalStaffline: true,
      drawTitle: false, drawSubtitle: false, drawComposer: false, drawLyricist: false, drawCredits: false,
      drawPartNames: false, drawFingerings: fingerZeigen, drawMeasureNumbers: true,
      cursorsOptions: [{ type: 0, color: '#3d7bf2', alpha: 0.0, follow: false }],
    });
    await osmd.load(quelle);
    const reihe = KH.Partitur.notenInReihenfolge(osmd);
    KH.Partitur.fingersatzEintragen(modell.noten.filter((n) => n.osmd && (!n.erste || n.erste === n)).map((n) => ({ osmd: reihe[n.i], finger: n.finger, hand: n.hand, ausDatei: n.ausDatei })));
    osmd.render();
    const c = osmd.cursor;
    c.show(); c.reset();
    const xs = [];
    for (let k = 0; k < modell.schritte.length; k++) {
      const el = c.cursorElement;
      xs.push(parseFloat(el.style.left) + (el.width || 0) / 2);
      c.next();
    }
    c.hide();
    const svg = box.querySelector('svg');
    if (!svg) return;
    const bw = parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width;
    const gesamtH = parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height;
    // Nur den Bereich mit Noten behalten (oben und unten ist viel Leerraum)
    let y0 = 0, bh = gesamtH;
    try {
      const box2 = svg.getBBox();
      if (box2.height > 10) { y0 = Math.max(0, box2.y - 8); bh = Math.min(gesamtH - y0, box2.height + 16); }
    } catch (e) { /* ganzes Bild */ }
    const kopie = svg.cloneNode(true);
    kopie.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    kopie.setAttribute('width', bw);
    kopie.setAttribute('height', bh);
    kopie.setAttribute('viewBox', `0 ${y0} ${bw} ${bh}`);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(kopie)], { type: 'image/svg+xml;charset=utf-8' }));
    const bild = new Image();
    bild.src = url;
    await bild.decode();
    this.zeile = { bild, url, bw, bh, xs, segmente: null, segmentFuer: 0 };
    buehne.innerHTML = '';
  }

  // Streifen in der gewünschten Höhe vorzeichnen (einmal je Videoformat).
  segmenteFuer(hoehe) {
    const z = this.zeile;
    if (!z) return null;
    if (z.segmente && z.segmentFuer === hoehe) return z;
    const skala = hoehe / z.bh;
    const gesamt = z.bw * skala;
    const max = 4000;
    z.segmente = [];
    for (let x = 0; x < gesamt; x += max) {
      const bw = Math.min(max, Math.ceil(gesamt - x));
      const cv = document.createElement('canvas');
      cv.width = bw; cv.height = Math.ceil(hoehe);
      const cx = cv.getContext('2d');
      cx.drawImage(z.bild, x / skala, 0, bw / skala, z.bh, 0, 0, bw, hoehe);
      z.segmente.push({ x, cv });
    }
    z.skala = skala;
    z.segmentFuer = hoehe;
    return z;
  }

  xBei(t, schritte) {
    const xs = this.zeile.xs;
    if (!xs.length) return 0;
    let lo = 0, hi = schritte.length - 1, i = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (schritte[mid].t <= t) { i = mid; lo = mid + 1; } else hi = mid - 1; }
    if (t <= schritte[0].t) return xs[0] - (schritte[0].t - t) * 60;
    if (i >= xs.length - 1) return xs[xs.length - 1] + (t - schritte[xs.length - 1].t) * 60;
    const a = schritte[i].t, b = schritte[i + 1].t;
    if (xs[i + 1] < xs[i] || b <= a) return xs[i];
    return xs[i] + (xs[i + 1] - xs[i]) * ((t - a) / (b - a));
  }

  zeichneBild(ctx, W, H, opt) {
    const m = opt.modell;
    const quer = W >= H;
    const s = W / (quer ? 1280 : 720);
    const schrift = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillStyle = '#0f1420';
    ctx.fillRect(0, 0, W, H);
    const rand = Math.round(16 * s);
    const kopfH = Math.round((quer ? 66 : 150) * s);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(26 * s)}px ${schrift}`;
    const titelY = quer ? Math.round(40 * s) : Math.round(52 * s);
    let titel = m.titel || 'Klavierhelfer';
    while (ctx.measureText(titel).width > W * (quer ? 0.58 : 0.92) && titel.length > 4) titel = titel.slice(0, -2) + '…';
    ctx.fillText(titel, rand, titelY);
    ctx.font = `${Math.round(15 * s)}px ${schrift}`;
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    if (m.komponist) ctx.fillText(m.komponist, rand, titelY + Math.round(22 * s));
    const takt = m.takte.length ? m.takte[this.spieler.taktBei(Math.max(0, opt.jetzt))].nr : 1;
    const info = `Takt ${takt}  ·  Tempo ${Math.round(this.spieler.tempo * 100)} %`;
    const legendeY = quer ? titelY : titelY + Math.round(56 * s);
    ctx.textAlign = quer ? 'right' : 'left';
    const lx = quer ? W - rand : rand;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `600 ${Math.round(15 * s)}px ${schrift}`;
    ctx.fillText(info, lx, legendeY - (quer ? Math.round(14 * s) : 0));
    ctx.font = `${Math.round(13 * s)}px ${schrift}`;
    const legende = [['R', 'rechte Hand'], ['L', 'linke Hand']].filter(([h]) => opt.haende[h]);
    let x = quer ? W - rand : rand;
    const ly = legendeY + Math.round((quer ? 8 : 24) * s);
    const eintraege = quer ? legende.slice().reverse() : legende;
    for (const [h, name] of eintraege) {
      const tw = ctx.measureText(name).width;
      const breite = tw + Math.round(18 * s);
      const sx = quer ? x - breite : x;
      ctx.fillStyle = KH.Wasserfall.FARBEN[h].weiss;
      ctx.beginPath(); ctx.arc(sx + Math.round(6 * s), ly - Math.round(4 * s), Math.round(5 * s), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.textAlign = 'left';
      ctx.fillText(name, sx + Math.round(16 * s), ly);
      x = quer ? sx - Math.round(14 * s) : sx + breite + Math.round(14 * s);
    }
    ctx.textAlign = 'left';

    let y = kopfH;
    if (opt.mitNoten && this.zeile) {
      const ph = Math.round(H * (quer ? 0.27 : 0.15));
      const innen = ph - Math.round(16 * s);
      const z = this.segmenteFuer(innen);
      const px = rand, pw = W - 2 * rand;
      ctx.save();
      ctx.fillStyle = '#fbfaf6';
      ctx.beginPath(); ctx.roundRect(px, y, pw, ph, Math.round(10 * s)); ctx.fill();
      ctx.clip();
      const kopfX = px + pw * 0.28;
      const basis = kopfX - this.xBei(opt.jetzt, m.schritte) * z.skala;
      const oy = y + Math.round(8 * s);
      for (const seg of z.segmente) {
        const sx = basis + seg.x;
        if (sx + seg.cv.width < px || sx > px + pw) continue;
        ctx.drawImage(seg.cv, sx, oy);
      }
      ctx.fillStyle = 'rgba(214,48,49,0.85)';
      ctx.fillRect(Math.round(kopfX - 1.5 * s), y + 4 * s, Math.max(2, Math.round(3 * s)), ph - 8 * s);
      ctx.restore();
      y += ph + Math.round(12 * s);
    }
    this.wf.zeichne(ctx, 0, y, W, H - y, { ...opt, skala: s });
  }

  async aufnehmen(o) {
    const fmt = KH.Video.FORMATE[o.format] || KH.Video.FORMATE.quer720;
    const typ = KH.Video.dateityp();
    if (!typ || !HTMLCanvasElement.prototype.captureStream) throw new Error('Dieser Browser kann keine Videos aufnehmen. Bitte Chrome, Edge oder Firefox am Computer benutzen.');
    this.abgebrochen = false;
    const sp = this.spieler;
    await this.klang.init();
    await this.klang.resume();

    const canvas = document.createElement('canvas');
    canvas.width = fmt.w; canvas.height = fmt.h;
    o.buehne.innerHTML = '';
    o.buehne.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    if (this.klang.aufnahme) this.klang.aufnahme.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const rec = new MediaRecorder(stream, { mimeType: typ.typ || undefined, videoBitsPerSecond: fmt.h >= 1080 || fmt.w >= 1080 ? 9e6 : 5e6, audioBitsPerSecond: 160000 });
    const teile = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) teile.push(e.data); };
    const fertig = new Promise((ok) => { rec.onstop = ok; });

    const alt = { schleife: sp.schleife, stopBei: sp.stopBei, einzaehler: sp.einzaehler, pos: sp.jetzt(), beiEnde: sp.beiEnde };
    sp.pause();
    sp.schleife = null;
    sp.stopBei = o.ende;
    sp.einzaehler = o.einzaehler;
    sp.beiEnde = null;
    sp.springe(o.start);

    const bild = () => this.zeichneBild(ctx, fmt.w, fmt.h, { ...o.ansicht(), jetzt: sp.jetzt(), modell: o.modell, mitNoten: o.mitNoten });
    bild();
    rec.start(500);
    let gestartet = false, endeSeit = null;
    await new Promise((ok) => {
      const timer = setInterval(() => {
        bild();
        if (this.abgebrochen) { clearInterval(timer); ok(); return; }
        const anteil = Math.max(0, Math.min(1, (sp.jetzt() - o.start) / Math.max(0.1, o.ende - o.start)));
        if (o.beiFortschritt) o.beiFortschritt(gestartet ? anteil : 0);
        if (gestartet && !sp.spielt) {
          if (endeSeit === null) endeSeit = performance.now();
          if (performance.now() - endeSeit > 1500) { clearInterval(timer); ok(); }
        }
      }, 1000 / 30);
      setTimeout(() => { if (!this.abgebrochen) { sp.play().then(() => { gestartet = true; }); } }, 400);
    });
    sp.pause();
    rec.stop();
    await fertig;
    stream.getTracks().forEach((t) => { if (t.kind === 'video') t.stop(); });
    sp.schleife = alt.schleife;
    sp.stopBei = alt.stopBei;
    sp.einzaehler = alt.einzaehler;
    sp.beiEnde = alt.beiEnde;
    sp.springe(alt.pos);
    if (this.abgebrochen) return null;
    return { blob: new Blob(teile, { type: (typ.typ || 'video/webm').split(';')[0] }), endung: typ.endung };
  }

  abbrechen() { this.abgebrochen = true; }
};
