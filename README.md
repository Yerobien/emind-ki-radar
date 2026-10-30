# eMind KI-Radar

Sammelt Aufgaben, die eine KI übernehmen oder beschleunigen könnte, lässt alle bewerten und macht daraus
live eine Nutzen/Aufwand-Matrix und eine Roadmap (Jetzt · Als Nächstes · Später · Im Einsatz).
Node.js + Express + Socket.io, Daten in einer JSON-Datei (keine Datenbank, keine nativen Pakete).

## Ansichten

| Ansicht | URL | Wofür |
|---|---|---|
| Mitmachen | `/` | Anmelden (Name, Bereich, 2 Kurzfragen zur KI-Nutzung), Ideen einreichen, bewerten, Roadmap ansehen |
| Beamer | `/board` | Kennzahlen, Matrix, Roadmap, „Wie oft nutzt ihr KI?“, „Was bremst?“, QR-Code |
| Admin | `/admin?key=DEIN_KEY` | Status, Verantwortliche, Roadmap-Spalte festlegen, Dubletten zusammenführen, löschen, Export/Import |

## Wie wird bewertet?

- Jede Person bewertet jede Idee mit **Nutzen** (1–5) und **Aufwand** (1–5), optional „betrifft mich auch“ und „ich würde pilotieren“.
- **Quadrant** aus den Durchschnitten (Grenze 3): Quick Win → *Jetzt*, Großprojekt → *Als Nächstes*, Nebenbei / Lohnt eher nicht → *Später*.
- **Zeitpotenzial (h/Monat)** = Minuten pro Mal × Häufigkeit × (1 + Anzahl „betrifft mich auch“).
- Im Admin lässt sich die Spalte pro Idee festlegen (statt „Auto“). Status *Im Einsatz* / *Verworfen* übersteuert die Spalte.

## Lokal starten

```bash
npm install
npm start          # Admin-Key Standard: radar
```

Windows (PowerShell): `$env:ADMIN_KEY="geheim"; npm start`

## Render

- Build Command `npm install`, Start Command `npm start`, Instance Type Free.
- Umgebungsvariable **`ADMIN_KEY`** setzen (Repo ist öffentlich, der Standard-Key steht im Code).
- **Achtung:** Render Free hat keine dauerhafte Festplatte. Bei jedem Deploy oder Neustart (auch nach dem Einschlafen)
  sind die Daten weg. Deshalb nach dem Event im Admin **Export JSON** klicken; mit **Import JSON** kommt alles wieder rein.
  Für Dauerbetrieb: eigene VM oder ein Render-Disk-Volume mit `DATA_FILE=/var/data/radar.json`.

## Einstellungen

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | 3000 | Port |
| `ADMIN_KEY` | radar | Admin-Schlüssel |
| `DATA_FILE` | `./data/radar.json` | Speicherort der Daten |
| `PUBLIC_URL` | – | feste URL für den QR-Code |
