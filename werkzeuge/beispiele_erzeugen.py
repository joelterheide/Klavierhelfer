#!/usr/bin/env python3
# Erzeugt die Beispielstücke als MusicXML (gemeinfreie Melodien, eigene einfache Sätze)
# und js/beispiele.js, damit die Seite sie auch ohne Server laden kann.
# Aufruf im Hauptordner: python3 werkzeuge/beispiele_erzeugen.py
import json, os, sys
from xml.sax.saxutils import escape
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DIV = 4
TYPES = {1: ("16th", 0), 2: ("eighth", 0), 3: ("eighth", 1), 4: ("quarter", 0), 6: ("quarter", 1),
         8: ("half", 0), 12: ("half", 1), 16: ("whole", 0)}

def pitch_xml(p):
    step = p[0]; rest = p[1:]; alter = 0
    if rest[0] == '#': alter = 1; rest = rest[1:]
    elif rest[0] == 'b': alter = -1; rest = rest[1:]
    s = f"<pitch><step>{step}</step>"
    if alter: s += f"<alter>{alter}</alter>"
    return s + f"<octave>{rest}</octave></pitch>"

def voice_xml(tokens, voice, staff):
    out = []; total = 0
    for tok in tokens.split():
        ps, d = tok.split(':'); d = int(d); typ, dots = TYPES[d]; total += d
        tail = f"<duration>{d}</duration><voice>{voice}</voice><type>{typ}</type>" + "<dot/>" * dots + f"<staff>{staff}</staff>"
        if ps == 'r':
            out.append(f"<note><rest/>{tail}</note>")
        else:
            for i, p in enumerate(ps.split('+')):
                out.append("<note>" + ("<chord/>" if i else "") + pitch_xml(p) + tail + "</note>")
    return "\n      ".join(out), total

def piece(title, composer, fifths, beats, beat_type, tempo, rh, lh):
    mlen = DIV * 4 * beats // beat_type
    ms = []
    for i, (r, l) in enumerate(zip(rh, lh), 1):
        rx, rt = voice_xml(r, 1, 1); lx, lt = voice_xml(l, 2, 2)
        assert rt == mlen and lt == mlen, (title, i, rt, lt, mlen)
        head = ""
        if i == 1:
            head = (f"<attributes><divisions>{DIV}</divisions><key><fifths>{fifths}</fifths></key>"
                    f"<time><beats>{beats}</beats><beat-type>{beat_type}</beat-type></time><staves>2</staves>"
                    "<clef number=\"1\"><sign>G</sign><line>2</line></clef><clef number=\"2\"><sign>F</sign><line>4</line></clef></attributes>\n      "
                    f"<direction placement=\"above\"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>{tempo}</per-minute></metronome></direction-type><staff>1</staff><sound tempo=\"{tempo}\"/></direction>\n      ")
        bar = "\n      <barline location=\"right\"><bar-style>light-heavy</bar-style></barline>" if i == len(rh) else ""
        ms.append(f"    <measure number=\"{i}\">\n      {head}{rx}\n      <backup><duration>{mlen}</duration></backup>\n      {lx}{bar}\n    </measure>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n'
            '<score-partwise version="3.1">\n'
            f"  <work><work-title>{escape(title)}</work-title></work>\n"
            f"  <identification><creator type=\"composer\">{escape(composer)}</creator></identification>\n"
            '  <part-list><score-part id="P1"><part-name>Klavier</part-name></score-part></part-list>\n'
            '  <part id="P1">\n' + "\n".join(ms) + "\n  </part>\n</score-partwise>\n")

C = "C3:4 G3:4 E3:4 G3:4"; G = "B2:4 G3:4 D3:4 G3:4"
PIECES = [
 ("tonleiter-c-dur", "C-Dur-Tonleiter, zwei Oktaven", "Übung", 0, 4, 4, 92,
  ["C4:2 D4:2 E4:2 F4:2 G4:2 A4:2 B4:2 C5:2", "D5:2 E5:2 F5:2 G5:2 A5:2 B5:2 C6:2 B5:2",
   "A5:2 G5:2 F5:2 E5:2 D5:2 C5:2 B4:2 A4:2", "G4:2 F4:2 E4:2 D4:2 C4:8"],
  ["C3:2 D3:2 E3:2 F3:2 G3:2 A3:2 B3:2 C4:2", "D4:2 E4:2 F4:2 G4:2 A4:2 B4:2 C5:2 B4:2",
   "A4:2 G4:2 F4:2 E4:2 D4:2 C4:2 B3:2 A3:2", "G3:2 F3:2 E3:2 D3:2 C3:8"]),
 ("ode-an-die-freude", "Ode an die Freude", "Ludwig van Beethoven", 0, 4, 4, 108,
  ["E4:4 E4:4 F4:4 G4:4", "G4:4 F4:4 E4:4 D4:4", "C4:4 C4:4 D4:4 E4:4", "E4:6 D4:2 D4:8",
   "E4:4 E4:4 F4:4 G4:4", "G4:4 F4:4 E4:4 D4:4", "C4:4 C4:4 D4:4 E4:4", "D4:6 C4:2 C4:8",
   "D4:4 D4:4 E4:4 C4:4", "D4:4 E4:2 F4:2 E4:4 C4:4", "D4:4 E4:2 F4:2 E4:4 D4:4", "C4:4 D4:4 G3:8",
   "E4:4 E4:4 F4:4 G4:4", "G4:4 F4:4 E4:4 D4:4", "C4:4 C4:4 D4:4 E4:4", "D4:6 C4:2 C4:8"],
  [C, G, C, G, C, G, C, "B2:4 G3:4 C3+E3+G3:8",
   G, "B2:4 G3:4 C3:4 G3:4", G, "C3:4 G3:4 G2:8",
   C, G, C, "B2:4 G3:4 C3+E3+G3:8"]),
 ("menuett-g-dur", "Menuett G-Dur (BWV Anh. 114)", "Christian Petzold", 1, 3, 4, 112,
  ["D5:4 G4:2 A4:2 B4:2 C5:2", "D5:4 G4:4 G4:4", "E5:4 C5:2 D5:2 E5:2 F#5:2", "G5:4 G4:4 G4:4",
   "C5:4 D5:2 C5:2 B4:2 A4:2", "B4:4 C5:2 B4:2 A4:2 G4:2", "F#4:4 G4:2 A4:2 B4:2 G4:2", "A4:12",
   "D5:4 G4:2 A4:2 B4:2 C5:2", "D5:4 G4:4 G4:4", "E5:4 C5:2 D5:2 E5:2 F#5:2", "G5:4 G4:4 G4:4",
   "C5:4 D5:2 C5:2 B4:2 A4:2", "B4:4 C5:2 B4:2 A4:2 G4:2", "A4:4 B4:2 A4:2 G4:2 F#4:2", "G4:12"],
  ["G3+B3+D4:8 A3:4", "B3:12", "C4:12", "B3:12", "A3:12", "G3:12", "D4:4 B3:4 G3:4", "D4:4 D3:2 C4:2 B3:2 A3:2",
   "B3:8 A3:4", "G3:4 B3:4 G3:4", "C4:12", "B3:4 C4:2 B3:2 A3:2 G3:2", "A3:8 F#3:4", "G3:8 B3:4", "C4:4 D4:4 D3:4", "G3:8 G2:4"]),
]
os.makedirs(os.path.join(OUT, "beispiele"), exist_ok=True)
items = []
for pid, title, comp, fifths, b, bt, tempo, rh, lh in PIECES:
    xml = piece(title, comp, fifths, b, bt, tempo, rh, lh)
    open(os.path.join(OUT, "beispiele", pid + ".musicxml"), "w", encoding="utf8").write(xml)
    items.append({"id": pid, "titel": title, "komponist": comp, "xml": xml})
js = ("// Automatisch erzeugt: die Beispielstücke aus dem Ordner beispiele/, damit die Seite auch ohne Server läuft.\n"
      "window.KH = window.KH || {};\nKH.BEISPIELE = " + json.dumps(items, ensure_ascii=False, indent=1) + ";\n")
open(os.path.join(OUT, "js", "beispiele.js"), "w", encoding="utf8").write(js)
print("ok", [len(i["xml"]) for i in items])
