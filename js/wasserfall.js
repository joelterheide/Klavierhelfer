// Zeichnet Klaviatur und fallende Noten mit Fingersatz auf eine Canvas-Fläche.
// Dieselbe Zeichenfunktion wird für die Seite und für das Video benutzt.
window.KH = window.KH || {};

KH.Wasserfall = (function () {
  const SCHWARZ = [1, 3, 6, 8, 10];
  const istSchwarz = (m) => SCHWARZ.includes(((m % 12) + 12) % 12);
  const VERSATZ = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 };
  const NAMEN = ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'];
  const FARBEN = {
    R: { weiss: '#4f8ef7', schwarz: '#2f6ee0', hell: '#9cc0ff', text: '#1f4fb0' },
    L: { weiss: '#f39c38', schwarz: '#d97a12', hell: '#ffc98c', text: '#9a4f00' },
    X: { weiss: '#8b93a7', schwarz: '#6c7489', hell: '#c3c8d4', text: '#454c5e' },
  };
  const SCHRIFT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  function rundesRechteck(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  class Wasserfall {
    constructor() { this.modell = null; this.lo = 48; this.hi = 84; this.cache = null; }

    static get FARBEN() { return FARBEN; }
    static tonName(m) { return NAMEN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

    setModell(m) {
      this.modell = m;
      const midis = m.noten.map((n) => n.midi);
      let lo = midis.length ? Math.min(...midis) : 60, hi = midis.length ? Math.max(...midis) : 72;
      lo -= 2; hi += 2;
      while (hi - lo < 24) { lo--; hi++; }
      lo = Math.max(21, lo); hi = Math.min(108, hi);
      while (istSchwarz(lo) && lo > 21) lo--;
      while (istSchwarz(hi) && hi < 108) hi++;
      this.lo = lo; this.hi = hi;
      this.cache = null;
    }

    geometrie(w, h) {
      const key = w + 'x' + h + ':' + this.lo + '-' + this.hi;
      if (this.cache && this.cache.key === key) return this.cache;
      const weisse = [];
      for (let m = this.lo; m <= this.hi; m++) if (!istSchwarz(m)) weisse.push(m);
      const ww = w / weisse.length;
      const tasten = new Map();
      weisse.forEach((m, i) => tasten.set(m, { x: i * ww, w: ww, schwarz: false }));
      const bw = ww * 0.6;
      for (let m = this.lo; m <= this.hi; m++) {
        if (!istSchwarz(m)) continue;
        const links = tasten.get(m - 1);
        if (!links) continue;
        const mitte = links.x + ww + VERSATZ[m % 12] * ww;
        tasten.set(m, { x: mitte - bw / 2, w: bw, schwarz: true });
      }
      const kh = Math.max(h * 0.13, Math.min(ww * 4.6, h * 0.26));
      this.cache = { key, weisse, ww, tasten, kh, oben: h - kh, sh: kh * 0.62 };
      return this.cache;
    }

    // opt: {jetzt, vorschau (Sekunden Stückzeit), haende:{R,L,X}, finger, beschriftung, gedrueckt:Set, warten:Set, skala}
    zeichne(ctx, x0, y0, w, h, opt) {
      const g = this.geometrie(w, h);
      const s = opt.skala || 1;
      const jetzt = opt.jetzt;
      const pps = g.oben / opt.vorschau;
      ctx.save();
      ctx.translate(x0, y0);
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();

      // Hintergrund mit Bahnen
      ctx.fillStyle = '#0f1420';
      ctx.fillRect(0, 0, w, g.oben);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (const [m, t] of g.tasten) if (t.schwarz) ctx.fillRect(t.x, 0, t.w, g.oben);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (const [m, t] of g.tasten) if (!t.schwarz && (m % 12 === 0 || m % 12 === 5)) ctx.fillRect(Math.round(t.x), 0, 1, g.oben);

      // Takt- und Schlaglinien
      const m = this.modell;
      if (m) {
        ctx.font = `${Math.round(11 * s)}px ${SCHRIFT}`;
        ctx.textBaseline = 'bottom';
        for (const t of m.takte) {
          const y = g.oben - (t.start - jetzt) * pps;
          if (y < -20 || y > g.oben + 1) continue;
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.fillRect(0, Math.round(y), w, Math.max(1, s));
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillText(String(t.nr), 6 * s, y - 3 * s);
          const schlag = (4 / t.nenner) * 60 / t.bpm;
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          for (let z = t.start + schlag; z < t.ende - 1e-3; z += schlag) {
            const yb = g.oben - (z - jetzt) * pps;
            if (yb > 0 && yb < g.oben) ctx.fillRect(0, Math.round(yb), w, 1);
          }
        }
      }
      if (opt.schleife) {
        ctx.fillStyle = 'rgba(255,216,77,0.12)';
        const ya = g.oben - (opt.schleife.start - jetzt) * pps, yb = g.oben - (opt.schleife.ende - jetzt) * pps;
        ctx.fillRect(0, Math.max(0, yb), w, Math.min(g.oben, ya) - Math.max(0, yb));
      }

      // Fallende Noten
      const aktiv = new Map();
      if (m) {
        const sichtbar = [];
        for (const n of m.noten) {
          if (!opt.haende[n.hand]) continue;
          if (n.start > jetzt + opt.vorschau + 0.1) break;
          if (n.start + n.dur < jetzt - 0.05) continue;
          const t = g.tasten.get(n.midi);
          if (!t) continue;
          if (n.start <= jetzt + 0.005 && n.start + n.dur > jetzt) aktiv.set(n.midi, n);
          sichtbar.push(n);
        }
        sichtbar.sort((a, b) => (istSchwarz(a.midi) ? 1 : 0) - (istSchwarz(b.midi) ? 1 : 0));
        const rechtecke = [];
        if (opt.merken) this.letzteRechtecke = rechtecke;
        for (const n of sichtbar) {
          const t = g.tasten.get(n.midi);
          const unten = g.oben - (n.start - jetzt) * pps;
          const oben = unten - n.dur * pps;
          const yu = Math.min(unten, g.oben), yo = Math.max(oben, -10);
          if (yu <= yo) continue;
          const rand = t.schwarz ? 1 : Math.max(1.5, t.w * 0.08);
          const nx = t.x + rand, nw = t.w - 2 * rand;
          const farbe = FARBEN[n.hand] || FARBEN.X;
          const spielt = aktiv.get(n.midi) === n;
          ctx.fillStyle = spielt ? farbe.hell : (t.schwarz ? farbe.schwarz : farbe.weiss);
          rundesRechteck(ctx, nx, yo, nw, yu - yo, Math.min(6 * s, nw / 3));
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
          rechtecke.push({ n, x: nx, y: yo, w: nw, h: yu - yo });
          if (opt.finger && n.finger && unten > 0) {
            const r = Math.max(6 * s, Math.min(nw * 0.42, 13 * s));
            const cx = nx + nw / 2;
            let cy = yu - r - 3 * s;
            if (yu - yo < 2 * r + 6 * s) cy = (yu + yo) / 2;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
            if (n.eigen) { ctx.lineWidth = 2.5 * s; ctx.strokeStyle = '#ffd84d'; ctx.stroke(); }
            ctx.fillStyle = farbe.text;
            ctx.font = `700 ${Math.round(r * 1.25)}px ${SCHRIFT}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(n.finger), cx, cy + r * 0.06);
            ctx.textAlign = 'left';
          }
        }
      }

      // Klaviatur
      const kOben = g.oben;
      ctx.fillStyle = '#7a1b26';
      ctx.fillRect(0, kOben - 3 * s, w, 3 * s);
      for (const mm of g.weisse) {
        const t = g.tasten.get(mm);
        const n = aktiv.get(mm);
        const gr = ctx.createLinearGradient(0, kOben, 0, h);
        if (n) { const f = FARBEN[n.hand] || FARBEN.X; gr.addColorStop(0, f.hell); gr.addColorStop(1, f.weiss); }
        else if (opt.gedrueckt && opt.gedrueckt.has(mm)) { gr.addColorStop(0, '#d9ccff'); gr.addColorStop(1, '#a78bfa'); }
        else { gr.addColorStop(0, '#fbfbf9'); gr.addColorStop(0.85, '#eeeeea'); gr.addColorStop(1, '#d9d9d3'); }
        ctx.fillStyle = gr;
        ctx.fillRect(t.x, kOben, t.w, g.kh);
        ctx.fillStyle = '#9aa0ab';
        ctx.fillRect(Math.round(t.x), kOben, 1, g.kh);
      }
      for (const [mm, t] of g.tasten) {
        if (!t.schwarz) continue;
        const n = aktiv.get(mm);
        const gr = ctx.createLinearGradient(0, kOben, 0, kOben + g.sh);
        if (n) { const f = FARBEN[n.hand] || FARBEN.X; gr.addColorStop(0, f.schwarz); gr.addColorStop(1, f.weiss); }
        else if (opt.gedrueckt && opt.gedrueckt.has(mm)) { gr.addColorStop(0, '#6d4fd6'); gr.addColorStop(1, '#a78bfa'); }
        else { gr.addColorStop(0, '#14171d'); gr.addColorStop(1, '#3a3f4a'); }
        ctx.fillStyle = gr;
        rundesRechteck(ctx, t.x, kOben - 1, t.w, g.sh, 2 * s);
        ctx.fill();
      }
      // Warte-Modus: diese Tasten sind jetzt dran
      if (opt.warten) {
        const puls = 0.55 + 0.45 * Math.sin(performance.now() / 160);
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = `rgba(52,211,153,${puls})`;
        for (const mm of opt.warten) {
          const t = g.tasten.get(mm);
          if (!t) continue;
          ctx.strokeRect(t.x + 2, kOben + 2, t.w - 4, (t.schwarz ? g.sh : g.kh) - 4);
        }
      }
      // Beschriftung
      if (opt.beschriftung && opt.beschriftung !== 'keine') {
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const fs = Math.max(8, Math.min(g.ww * 0.36, 13 * s));
        ctx.font = `600 ${Math.round(fs)}px ${SCHRIFT}`;
        for (const mm of g.weisse) {
          if (opt.beschriftung === 'c' && mm % 12 !== 0) continue;
          const t = g.tasten.get(mm);
          ctx.fillStyle = mm === 60 ? '#c0392b' : '#6b7280';
          const name = mm % 12 === 0 ? Wasserfall.tonName(mm) : NAMEN[mm % 12];
          ctx.fillText(name, t.x + t.w / 2, h - 4 * s);
        }
        ctx.textAlign = 'left';
      }
      // Finger auf den gedrückten Tasten
      if (opt.finger) {
        for (const [mm, n] of aktiv) {
          if (!n.finger) continue;
          const t = g.tasten.get(mm);
          const f = FARBEN[n.hand] || FARBEN.X;
          const r = Math.max(7 * s, Math.min(t.w * 0.42, 15 * s));
          const cx = t.x + t.w / 2;
          const cy = t.schwarz ? kOben + g.sh - r - 4 * s : kOben + g.kh * 0.62;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = f.text; ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${Math.round(r * 1.3)}px ${SCHRIFT}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(n.finger), cx, cy + r * 0.06);
          ctx.textAlign = 'left';
        }
      }
      ctx.restore();
    }

    // Welche Note liegt unter dem Punkt (in Zeichenkoordinaten)?
    treffer(px, py) {
      const r = this.letzteRechtecke || [];
      for (let i = r.length - 1; i >= 0; i--) {
        const q = r[i];
        if (px >= q.x - 3 && px <= q.x + q.w + 3 && py >= q.y - 3 && py <= q.y + q.h + 3) return q.n;
      }
      return null;
    }
  }
  return Wasserfall;
})();
