# Klavierhelfer

Noten hochladen und sofort sehen, welcher Finger welche Taste spielt.

Der Klavierhelfer ist eine Website, die komplett im Browser läuft. Sie zeigt zu einem Klavierstück:

- **das Notenbild** mit mitlaufendem Cursor und eingetragenem Fingersatz,
- **fallende Noten** über einer Klaviatur (wie bei Synthesia), in jedem Balken steht der Finger,
- **Klavierklang** von einem echten Flügel (Salamander Grand Piano),
- **ein Video zum Herunterladen** mit fallenden Noten, Fingersatz, mitlaufender Notenzeile und Ton, wahlweise im Hochformat fürs Handy.

Alle Dateien bleiben auf dem eigenen Gerät, nichts wird hochgeladen.

## Benutzen

Online über GitHub Pages: **https://joelterheide.github.io/Klavierhelfer/**
(einmalig einschalten: *Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch `main`, Ordner `/ (root)` → Save*).

Offline: Ordner herunterladen und `index.html` doppelklicken. Es wird kein Server gebraucht.

### Welche Dateien gehen?

| Format | Notenbild | Fingersatz | Klang | Video |
|---|---|---|---|---|
| MusicXML (`.musicxml`, `.xml`, `.mxl`) | ja | ja | ja | ja, mit Notenzeile |
| MIDI (`.mid`, `.midi`) | nein | ja | ja | ja, ohne Notenzeile |
| PDF, Foto | – | – | – | – |

Ein PDF oder Foto zuerst in [MuseScore](https://musescore.org/de) umwandeln (*Datei → PDF importieren*), dann über *Datei → Exportieren → MusicXML* speichern und hier öffnen.

### Üben

- **Tempo** stufenlos von 25 bis 150 %.
- **Takte üben**: einen Abschnitt in Schleife wiederholen.
- **Einstellungen**: Hände einzeln anzeigen oder stumm schalten, Metronom, Einzählen, Fallgeschwindigkeit, Tastennamen, Handgröße für den Fingersatz.
- **Fingersatz ändern**: Pause drücken und eine Note im Wasserfall antippen. Jedes Antippen wählt den nächsten Finger, die folgenden Finger passen sich an. Eigene Änderungen werden im Browser gespeichert (gelber Ring) und lassen sich in den Einstellungen zurücksetzen.
- **MIDI-Keyboard** (Chrome/Edge): Ein Digitalpiano per USB anschließen. Gedrückte Tasten erscheinen lila. Im **Warte-Modus** hält das Stück an, bis die richtigen Tasten gespielt sind.
- **Tastatur**: Leertaste = Start/Pause, ← → = Takt zurück/vor, Pos1 = Anfang, + / − = Tempo.

### Video

*Video* öffnen, Format wählen (Querformat 720p/1080p oder Hochformat fürs Handy) und *Aufnahme starten*. Die Aufnahme läuft in Echtzeit mit dem eingestellten Tempo, dabei muss der Tab sichtbar bleiben. Je nach Browser entsteht eine MP4- oder WebM-Datei.

## Wie der Fingersatz entsteht

`js/fingersatz.js` sucht für jede Hand die Fingerfolge mit den geringsten Kosten (dynamische Programmierung über je zwei aufeinanderfolgende Griffe). Bewertet werden:

- der Abstand zweier Töne im Verhältnis zu den Fingern (bequem, gedehnt, unspielbar),
- Daumenuntersatz und Übersetzen (nach schwarzen Tasten leichter), Daumen auf schwarzen Tasten,
- derselbe Finger auf verschiedenen Tasten (nur nach Pausen in Ordnung),
- ob ein Finger zur aktuellen Handlage passt (Fünftonraum),
- bei Akkorden die natürliche Handform und wie weit die ganze Hand springen muss.

Fingersätze, die schon in der MusicXML-Datei stehen, bleiben unverändert. Tonleitern in C-, G-, D-, F- und B-Dur, Fünftonraum, Dreiklänge, Arpeggien, Alberti-Bässe und einfache Kinderlieder bekommen damit den üblichen Lehrbuch-Fingersatz. Bei schwierigen Stellen ist das Ergebnis ein spielbarer Vorschlag, kein Ersatz für eine Lehrkraft.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `index.html`, `css/style.css` | Seite und Gestaltung |
| `js/app.js` | Bedienung, verbindet alle Teile |
| `js/partitur.js` | liest Töne, Zeiten, Takte und Hände aus der MusicXML-Partitur, trägt den Fingersatz ins Notenbild ein |
| `js/midi.js` | liest MIDI-Dateien |
| `js/fingersatz.js` | automatischer Fingersatz |
| `js/spieler.js` | Wiedergabe, Tempo, Schleife, Metronom, Warte-Modus |
| `js/klang.js` | Klavierklang über Web Audio |
| `js/wasserfall.js` | Klaviatur und fallende Noten (Canvas) |
| `js/video.js` | Video-Aufnahme mit Notenzeile |
| `js/klavier-samples.js` | eingebettete Klavier-Samples |
| `js/beispiele.js`, `beispiele/` | Beispielstücke (erzeugt mit `werkzeuge/beispiele_erzeugen.py`) |
| `vendor/opensheetmusicdisplay.min.js` | Notensatz-Bibliothek |

Es gibt keinen Build-Schritt, alle Dateien werden direkt ausgeliefert.

## Lizenzen und Quellen

- Notensatz: [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org) 2.3.1, BSD-3-Clause-Lizenz (`vendor/opensheetmusicdisplay-LICENSE.txt`).
- Klavierklang: Salamander Grand Piano V3 von Alexander Holm, Lizenz [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/deed.de). Die Samples wurden auf 5,5 Sekunden gekürzt und in Mono umgewandelt.
- Beispielstücke: Ode an die Freude (Ludwig van Beethoven) und Menuett G-Dur BWV Anh. 114 (Christian Petzold) sind gemeinfrei, die einfachen Klaviersätze sind für dieses Projekt geschrieben.
