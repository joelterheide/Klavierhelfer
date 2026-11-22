// Automatischer Fingersatz für Klavier.
// Für jede Hand wird über alle Töne die Fingerfolge mit den geringsten "Kosten" gesucht
// (dynamische Programmierung über je zwei aufeinanderfolgende Griffe). Die Kosten bewerten:
//  - Abstand zweier Töne im Verhältnis zu den beteiligten Fingern (bequem, gedehnt, unspielbar),
//  - Daumenuntersatz und Übersetzen, Daumen auf schwarzen Tasten,
//  - denselben Finger auf verschiedenen Tasten (nur nach Pausen in Ordnung),
//  - ob ein Finger zur aktuellen Handlage passt (Fünftonraum).
// Fingersätze aus der Notendatei oder von Hand geänderte bleiben fest.
window.KH = window.KH || {};

KH.Fingersatz = (function () {
  // Fingerpaar: [idealer Abstand, größter bequemer, größter spielbarer, (nur mit Daumen:) bequemster und weitester Untersatz]
  // Abstand = Tonhöhe des Fingers mit der höheren Nummer minus die des Fingers mit der niedrigeren (links gespiegelt).
  const PAAR = {
    '1-2': [2, 8, 10, -4, -6], '1-3': [3.5, 10, 12, -5, -7], '1-4': [5.5, 12, 14, -4, -6], '1-5': [7, 13, 15, 0, 0],
    '2-3': [2, 3, 5], '2-4': [3.5, 5, 7], '2-5': [5, 8, 10],
    '3-4': [1.5, 2.5, 4], '3-5': [3.5, 5, 7], '4-5': [2, 3, 5],
  };
  // Größter entspannter Abstand: so weit lässt sich ein Griff länger halten (für Akkorde)
  const ENTSPANNT = { '1-2': 5, '1-3': 7, '1-4': 9, '1-5': 10, '2-3': 2, '2-4': 4, '2-5': 6, '3-4': 2, '3-5': 4, '4-5': 2 };
  const HANDGROESSE = { klein: 0.85, mittel: 1, gross: 1.15 };
  const schwarz = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

  function abstand(f1, p1, f2, p2, hand) {
    const [pTief, pHoch] = f1 < f2 ? [p1, p2] : [p2, p1];
    return hand === 'R' ? pHoch - pTief : pTief - pHoch;
  }

  function dehnung(d, a, b, fak) {
    const t = PAAR[a + '-' + b];
    let k = 0.2 * Math.abs(d - t[0]);
    const bequem = t[1] * fak, spielbar = t[2] * fak;
    if (d > bequem) k += 2 * (d - bequem);
    if (d > spielbar) k += 10 + 3 * (d - spielbar);
    return k;
  }

  const kreuzt = (f1, p1, f2, p2, hand) => (f1 === 1 || f2 === 1) && f1 !== f2 && abstand(f1, p1, f2, p2, hand) < 0;

  // Kosten für zwei aufeinanderfolgende Töne derselben Hand.
  function paarKosten(f1, p1, f2, p2, hand, fak) {
    if (f1 === f2) return p1 === p2 ? 0 : 6 + 0.5 * Math.abs(p2 - p1);
    const a = Math.min(f1, f2), b = Math.max(f1, f2);
    const d = abstand(f1, p1, f2, p2, hand);
    let k;
    if (a === 1 && d < 0) {
      // Daumenuntersatz bzw. Übersetzen über den Daumen
      const t = PAAR[a + '-' + b];
      k = 2.5 + 0.3 * Math.abs(d + 1.5);
      if (d < t[3] * fak) k += 2 * (t[3] * fak - d);
      if (d < t[4] * fak) k += 10 + 3 * (t[4] * fak - d);
      const pDaumen = f1 === 1 ? p1 : p2, pAnders = f1 === 1 ? p2 : p1;
      if (schwarz(pDaumen) && !schwarz(pAnders)) k += 2;
      if (!schwarz(pDaumen) && schwarz(pAnders)) k -= 0.5; // Untersatz nach einer schwarzen Taste ist leicht
    } else if (a !== 1 && d < 1) {
      k = d === 0 ? 1.5 : 12 + 3 * (1 - d); // zwei Langfinger kreuzen: kaum spielbar
    } else {
      k = (d === 0 ? 1.5 : 0) + dehnung(d, a, b, fak);
    }
    if (f1 === 3 && f2 === 4) k += 0.15;
    if (f2 === 1 && schwarz(p2) && !schwarz(p1)) k += 1;
    if (f1 === 1 && schwarz(p1) && !schwarz(p2)) k += 0.5;
    if (f2 === 5 && schwarz(p2) && !schwarz(p1)) k += 0.5;
    return k;
  }

  function einzelKosten(f, p) {
    let k = 0;
    if (f === 4) k += 0.05;
    if (f === 1 && schwarz(p)) k += 1.5;
    return k;
  }

  // Alle sinnvollen Fingerzuordnungen für einen Griff (Töne aufsteigend sortiert).
  function kandidaten(ereignis, hand) {
    const n = ereignis.toene.length;
    if (n > 5) {
      const f = ereignis.toene.map((_, i) => 1 + Math.round((i * 4) / (n - 1)));
      return [hand === 'R' ? f : f.map((x) => 6 - x)];
    }
    const kombis = [];
    (function wahl(start, rest, akt) {
      if (rest === 0) { kombis.push(akt.slice()); return; }
      for (let f = start; f <= 5; f++) { akt.push(f); wahl(f + 1, rest - 1, akt); akt.pop(); }
    })(1, n, []);
    const alle = kombis.map((k) => (hand === 'R' ? k : k.slice().reverse()));
    const passend = alle.filter((f) => ereignis.toene.every((t, i) => !t.fest || t.fest === f[i]));
    return passend.length ? passend : alle;
  }

  function griffKosten(toene, finger, hand, fak) {
    let k = 0;
    for (let i = 0; i < toene.length; i++) k += einzelKosten(finger[i], toene[i].midi);
    for (let i = 1; i < toene.length; i++) {
      const fa = finger[i - 1], fb = finger[i];
      const d = abstand(fa, toene[i - 1].midi, fb, toene[i].midi, hand);
      const a = Math.min(fa, fb), b = Math.max(fa, fb);
      k += dehnung(d, a, b, fak) + 0.1 * Math.abs(d - PAAR[a + '-' + b][0]);
      const entspannt = ENTSPANNT[a + '-' + b] * fak;
      if (d > entspannt) k += d - entspannt;
    }
    const n = toene.length;
    if (n > 1) {
      const fa = finger[0], fb = finger[n - 1];
      const spanne = toene[n - 1].midi - toene[0].midi;
      if (n > 2) {
        const t = PAAR[Math.min(fa, fb) + '-' + Math.max(fa, fb)];
        if (spanne > t[1] * fak) k += 2 * (spanne - t[1] * fak);
        if (spanne > t[2] * fak) k += 10 + 3 * (spanne - t[2] * fak);
      }
      const aussen = hand === 'R' ? finger[n - 1] : finger[0];
      if (aussen === 4 && spanne >= 5) k += 0.4;
    }
    return k;
  }

  // Wo liegt der Daumen ungefähr, wenn diese Finger diese Töne greifen? (Fünftonraum C-D-E-F-G als Maß)
  const VERSATZ = [0, 2, 4, 5, 7];
  function anker(toene, finger, hand) {
    let s = 0;
    toene.forEach((t, i) => { s += hand === 'R' ? t.midi - VERSATZ[finger[i] - 1] : t.midi + VERSATZ[finger[i] - 1]; });
    return s / toene.length;
  }

  function uebergang(vorher, fv, jetzt, fj, hand, fak) {
    if (vorher.toene.length === 1 && jetzt.toene.length === 1) {
      return paarKosten(fv[0], vorher.toene[0].midi, fj[0], jetzt.toene[0].midi, hand, fak);
    }
    // Akkorde: Bewegung der ganzen Hand plus Finger, die auf eine andere Taste springen müssen
    let k = 0.25 * Math.abs(anker(jetzt.toene, fj, hand) - anker(vorher.toene, fv, hand));
    for (let i = 0; i < vorher.toene.length; i++) {
      for (let j = 0; j < jetzt.toene.length; j++) {
        if (fv[i] !== fj[j]) continue;
        const pa = vorher.toene[i].midi, pb = jetzt.toene[j].midi;
        if (pa === pb) continue;
        const gehalten = vorher.toene[i].start + vorher.toene[i].dur > jetzt.start - 0.02;
        k += gehalten ? 1 + 0.15 * Math.abs(pb - pa) : 0.05;
      }
    }
    return k;
  }

  // Nach Pausen oder bei langsamen Tönen kann die Hand frei umsetzen.
  function pausenFaktor(vorher, jetzt) {
    const ende = Math.max(...vorher.toene.map((t) => t.start + t.dur));
    const pause = jetzt.start - ende;
    let f = Math.max(0.15, 1 - Math.max(0, pause) * 1.7);
    if (jetzt.start - vorher.start > 1.0) f *= 0.6;
    return f;
  }

  // Passt der Finger zur Handlage, die die beiden vorigen Töne festlegen?
  function lageKosten(eA, fA, eB, fB, eC, fC, hand) {
    if (eA.toene.length !== 1 || eB.toene.length !== 1 || eC.toene.length !== 1) return 0;
    const a = fA[0], b = fB[0], c = fC[0];
    const pA = eA.toene[0].midi, pB = eB.toene[0].midi, pC = eC.toene[0].midi;
    if (a === b || pA === pB) return 0;
    if (kreuzt(a, pA, b, pB, hand) || kreuzt(b, pB, c, pC, hand)) return 0;
    const vorher = Math.max(0, Math.min(5, a + ((pC - pA) * (b - a)) / (pB - pA)));
    const erwartet = Math.max(1, Math.min(5, vorher));
    const innen = (pC - pA) * (pC - pB) <= 0;
    return (innen ? 1 : 0.4) * Math.max(0, Math.abs(c - erwartet) - 0.35);
  }

  function ereignisseBilden(toene) {
    const sortiert = toene.slice().sort((a, b) => a.start - b.start || a.midi - b.midi);
    const evs = [];
    for (const t of sortiert) {
      const letztes = evs[evs.length - 1];
      if (letztes && Math.abs(t.start - letztes.start) < 0.035 && !letztes.toene.some((x) => x.midi === t.midi)) letztes.toene.push(t);
      else evs.push({ start: t.start, toene: [t] });
    }
    for (const e of evs) e.toene.sort((a, b) => a.midi - b.midi);
    return evs;
  }

  function fuerHand(toene, hand, fak) {
    const evs = ereignisseBilden(toene);
    const n = evs.length;
    if (!n) return;
    const kand = evs.map((e) => kandidaten(e, hand));
    const eigen = evs.map((e, i) => kand[i].map((f) => griffKosten(e.toene, f, hand, fak)));
    if (n === 1) {
      const w = eigen[0].indexOf(Math.min(...eigen[0]));
      evs[0].toene.forEach((t, j) => { t.finger = kand[0][w][j]; });
      return;
    }
    // Zustand = (Griff davor, Griff jetzt); kosten[b][c]
    const ueb = [null];
    for (let i = 1; i < n; i++) {
      const pf = pausenFaktor(evs[i - 1], evs[i]);
      ueb.push(kand[i - 1].map((fb) => kand[i].map((fc) => pf * uebergang(evs[i - 1], fb, evs[i], fc, hand, fak))));
    }
    let kosten = kand[0].map((_, b) => kand[1].map((_, c) => eigen[0][b] + ueb[1][b][c] + eigen[1][c]));
    const zurueck = [null, null];
    for (let i = 2; i < n; i++) {
      const lageGewicht = pausenFaktor(evs[i - 2], evs[i - 1]) > 0.5 && pausenFaktor(evs[i - 1], evs[i]) > 0.5 ? 1 : 0;
      const neu = [], zeiger = [];
      for (let b = 0; b < kand[i - 1].length; b++) {
        neu.push([]); zeiger.push([]);
        for (let c = 0; c < kand[i].length; c++) {
          let best = Infinity, bestA = 0;
          for (let a = 0; a < kand[i - 2].length; a++) {
            let k = kosten[a][b];
            if (lageGewicht) k += lageKosten(evs[i - 2], kand[i - 2][a], evs[i - 1], kand[i - 1][b], evs[i], kand[i][c], hand);
            if (k < best) { best = k; bestA = a; }
          }
          neu[b].push(best + ueb[i][b][c] + eigen[i][c]);
          zeiger[b].push(bestA);
        }
      }
      kosten = neu;
      zurueck.push(zeiger);
    }
    let bestB = 0, bestC = 0, best = Infinity;
    kosten.forEach((zeile, b) => zeile.forEach((k, c) => { if (k < best) { best = k; bestB = b; bestC = c; } }));
    const wahl = new Array(n);
    wahl[n - 1] = bestC; wahl[n - 2] = bestB;
    for (let i = n - 1; i >= 2; i--) wahl[i - 2] = zurueck[i][wahl[i - 1]][wahl[i]];
    for (let i = 0; i < n; i++) evs[i].toene.forEach((t, j) => { t.finger = kand[i][wahl[i]][j]; });
  }

  return {
    HANDGROESSE,
    // toene: [{midi, start, dur, hand, fest}] – setzt t.finger
    berechne(toene, handgroesse = 'mittel') {
      const fak = HANDGROESSE[handgroesse] || 1;
      for (const hand of ['R', 'L']) fuerHand(toene.filter((t) => t.hand === hand), hand, fak);
      for (const t of toene) if (t.hand !== 'R' && t.hand !== 'L') t.finger = null;
    },
  };
})();
