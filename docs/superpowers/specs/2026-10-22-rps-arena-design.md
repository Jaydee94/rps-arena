# RPS Arena – Design

Datum: 2026-10-22 · Status: Entwurf zur Freigabe

## 1. Worum es geht

Ein browserbasiertes Schere-Stein-Papier-Spiel für zwei oder mehr Leute,
das sich nicht wie ein Standard-RPS anfühlt: Comic-Look, mehrere
ungewöhnliche Spielmodi und ein Bluff-Element. Es läuft im Browser, ohne
Account und ohne Installation. Man teilt einen Link und spielt.

Das Projekt ist außerdem eine Übung in sauberem Betrieb: Das Spiel wird auf
Kubernetes betrieben, per Helm deployt und bei jedem Merge nach `main`
automatisch released (semantic-release). Renovate hält die Abhängigkeiten
aktuell.

Das Design (Look, Animationen, Feinschliff) wird zuerst grob gebaut und
später mit Claude Design perfektioniert. Die Frontend-Struktur muss das
zulassen: Styles, Assets und Komponenten sauber getrennt, keine verstreuten
Inline-Styles.

## 2. Ziele

- Zwei Personen spielen in Echtzeit über einen Raum-Code oder Link.
- Spiel gegen einen Bot mit drei Schwierigkeitsstufen.
- Mehrere Spielmodi, die man pro Raum wählt (siehe 4).
- Klick-Steuerung zuerst. Optionale Kamera-Erkennung per Handgeste (siehe 6).
- Comic-/Cartoon-Optik, SFX und optionale Musik, Deutsch und Englisch.
- Komplett per Helm auf Kubernetes deploybar, Skalierung über Redis.
- Jeder releasewürdige Merge nach `main` erzeugt automatisch ein neues Release
  (Git-Tag, GitHub Release mit Changelog, Container-Image, Helm-Chart).

## 3. Nicht-Ziele

- Keine Accounts, kein Login, keine Rangliste, kein dauerhafter Spielverlauf.
- Keine zufällige Paarung mit Fremden (Matchmaking-Queue).
- Kein lokaler Hot-Seat-Modus am selben Gerät.
- Keine Power-ups oder Roguelike-Elemente.
- Kein Mobile-App-Build. Die Web-App soll aber auf dem Handy bedienbar sein.
- Keine Gateway-API-Unterstützung im Chart (nur Ingress).

## 4. Spielmodi (Auswahl pro Raum)

Alle Modi sind **serverseitig autoritativ**: Der Server hält die Wahl beider
Seiten geheim, bis alle gewählt haben, und deckt dann gleichzeitig auf. Der
Client wertet nie selbst aus.

Der Raum-Ersteller wählt Modus und Matchformat. Das Matchformat ist
**Best of 3, 5 oder 7**. Bei Gleichstand gibt es Sudden Death.

| Modus | Regel |
|---|---|
| Klassik | Stein, Schere, Papier. |
| Lizard-Spock | Die 5er-Variante (Rock, Paper, Scissors, Lizard, Spock) mit den Standardregeln. |
| Wheel 7 / 9 / 15 | Gesten auf einem Kreis. Jede Geste schlägt die nächsten (n−1)/2 Gesten im Uhrzeigersinn und verliert gegen die übrigen. Die 15er-Variante nutzt die bekannte Liste (Rock, Fire, Scissors, Snake, Human, Tree, Wolf, Sponge, Paper, Air, Water, Dragon, Devil, Lightning, Gun). Die Sets für 7 und 9 sind Teilmengen, die der Builder wählt. |
| Bluff | Vor der geheimen Wahl hat jede Seite ein kurzes Zeitfenster für eine **Ansage** (Chat oder Emote) darüber, was sie spielen wird. Danach wählen beide geheim. Die Ansage ist unverbindlich, man darf lügen. *Meine Entscheidung:* Die Ansage ist eine feste Auswahl an Emotes (die Gesten als Sprechblasen), kein Freitext. Das vermeidet Moderation, Längenlimits und Missbrauch. Die Gegenseite sieht die Ansage sofort. Man darf auch auf eine Ansage verzichten. |
| 2v2 Team | Zwei Teams mit je zwei Personen. Siehe Annahme unten. |

**2v2 (vom User bestätigt):** Jede Person wählt pro Runde geheim eine Geste.
Es gibt zwei gleichzeitige Duelle (Person 1 gegen Person 1, Person 2 gegen
Person 2). Das Team mit mehr gewonnenen Duellen gewinnt die Runde. Bei 1:1
ist die Runde unentschieden und wird wiederholt. Der Raum fasst genau vier
Spielende.

Meine Entscheidungen dazu (Builder-Check):
- **Teams:** In der Lobby gibt es zwei Teams mit je zwei Plätzen. Man wählt
  selbst einen freien Platz, der Raum-Ersteller kann Spielende umsetzen. Das
  Match startet, wenn alle vier Plätze besetzt sind. Welche Person gegen
  welche spielt, ergibt sich aus dem Platz (Platz 1 gegen Platz 1).
- **Gesten:** 2v2 nutzt zunächst das Klassik-Set. Das Datenmodell trennt Modus
  und Gestenset, damit sich später ein anderes Set kombinieren lässt.
- **Bot:** Kein Bot im 2v2-Modus.
- **Verbindungsabbruch:** Kommt jemand innerhalb der Karenzzeit nicht zurück,
  verliert das betroffene Duell, und die Runde wird normal ausgewertet.

## 5. Spielablauf und Multiplayer

- **Raum:** Ein*e Spieler*in erstellt einen Raum und bekommt einen kurzen
  Code und einen teilbaren Link. Weitere treten per Code oder Link bei.
- **Identität:** Beim Beitritt wählt man Nickname und einen Comic-Avatar.
  Nichts wird dauerhaft gespeichert. Raum und Spielstand leben nur im Raum.
- **Bot:** Solo-Modus mit drei Stufen. Leicht ist zufällig, Mittel erkennt
  einfache Muster, Schwer lernt aus den bisherigen Zügen und kontert. Der Bot
  sieht die aktuelle Wahl des Menschen nie. *Meine Entscheidung:* Der Bot
  unterstützt alle Duell-Modi (Klassik, Lizard-Spock, Wheel, Bluff), aber
  nicht 2v2. Im Bluff-Modus macht er zufällige Ansagen und wertet die Ansage
  des Menschen nicht aus.
- **Sudden Death:** Steht es nach der Best-of-N-Serie unentschieden, wird so
  lange eine Zusatzrunde gespielt, bis eine Seite gewinnt. Unentschiedene
  Runden zählen nicht und werden wiederholt.
- **Neustart und Ausfall (meine Entscheidung):** Der komplette Raumzustand
  liegt in Redis, Timer werden als ablaufende Schlüssel bzw. Zeitstempel
  abgebildet. Ein kurzer Aussetzer bei einem Pod-Neustart ist akzeptabel,
  wenn die Clients automatisch wieder verbinden und das Spiel aus dem
  Redis-Zustand fortsetzen. Ein nahtloses Umschalten ist nicht gefordert.
- **Echtzeit:** WebSockets. Der Server verwaltet Räume, Runden, Timer und
  Auswertung.
- **Verbindungsabbruch:** Wer kurz wegbricht, kann mit demselben Browser
  wieder in den Raum (Sitzungs-Token im `sessionStorage`). Die Karenzzeit
  ist ein Builder-Entscheid.
- **Räume räumen auf:** Inaktive Räume werden nach einer Frist gelöscht (TTL
  in Redis).

## 6. Eingabe: Klick und Kamera

- **Standard:** Klick/Tap auf die Gesten-Auswahl. Das muss von Anfang an
  fehlerfrei funktionieren und per Tastatur bedienbar sein.
- **Kamera (optionales Extra, zuschaltbar):** Handgesten-Erkennung per
  MediaPipe Gesture Recognizer **vollständig im Browser**. Es verlässt kein
  Videobild das Gerät. Es werden nur die erkannten Gesten als Auswahl
  gesendet.
- **Annahme (meine Idee):** Die Kamera deckt zunächst nur die Modi ab, deren
  Gesten sich mit den eingebauten Handposen abbilden lassen (Stein =
  geschlossene Faust, Papier = offene Hand, Schere = Victory). Für exotische
  Gesten bleibt Klick. *Meine Entscheidung zum Umfang:* Die Kamera ist im ersten Release enthalten,
  als schaltbare Funktion mit dem Hinweis „experimentell“, nur für das
  Klassik-Set. Sie gilt als gelungen, wenn Stein, Papier und Schere unter
  normalem Licht zuverlässig erkannt werden und die Funktion ohne Kamera
  oder bei verweigerter Berechtigung sauber ausweicht. Mehr Gesten werden erst
  danach bewertet. Die Auswahl wird erst nach einer kurzen Halte-Zeit
  bestätigt, um Fehlerkennungen abzufangen.
- Die Kamera-Funktion lädt ihre Bibliothek und das Modell **nur bei
  Aktivierung** (Lazy Loading), damit der normale Start schnell bleibt.

## 7. Look & Feel

- **Richtung:** Comic/Cartoon. Dicke Outlines, knallige Farben, Kampflaute
  wie „POW“ und „BAM“, leichte Überzeichnung bei Animationen.
- **Audio:** Comic-SFX und eine optionale Musik-Schleife, jeweils mit
  Stummschalter. Autoplay-Regeln der Browser beachten (Audio startet erst
  nach einer Nutzeraktion).
- **Sprachen:** Deutsch und Englisch, umschaltbar. Standard folgt dem
  Browser. Alle Texte laufen über i18n-Schlüssel.
- **Barrierefreiheit (meine Vorgabe):** `prefers-reduced-motion` respektieren,
  ausreichender Kontrast, Gesten nicht nur über Farbe unterscheidbar.
- **Mobil:** Layout muss auf Handybreite funktionieren.
- Der erste Wurf muss nicht perfekt sein, aber die Struktur muss ein späteres
  Redesign leicht machen (Design-Tokens als CSS-Variablen).

## 8. Technik (Entscheidungen des Users)

- **Stack:** TypeScript-Vollstack. Node.js-Server mit WebSockets, Frontend mit
  Vite. Typen für Nachrichten und Spiel-Logik werden zwischen Client und
  Server geteilt.
- **State:** Raumzustand und Pub/Sub in **Redis**, damit mehrere Replicas
  möglich sind. Der Redis-Anteil ist Teil des Charts.
- **Registry:** GitHub Container Registry (`ghcr.io`) für Image **und** Helm-Chart
  (als OCI-Artefakt).

### Vom Builder zu entscheiden (meine Vorschläge)

- Frontend-Framework (Vorschlag: Svelte, weil animationsfreundlich und klein;
  React ist ebenso in Ordnung).
- WebSocket-Bibliothek (Vorschlag: Socket.IO mit Redis-Adapter oder `ws` mit
  eigenem Pub/Sub). Bei Replicas braucht es Sticky Sessions oder eine
  Strategie, die ohne sie auskommt.
- Monorepo-Aufbau (Vorschlag: npm-Workspaces mit `packages/shared`,
  `apps/server`, `apps/web`).
- Redis im Chart: eigenes schlankes Template oder Subchart. Redis sollte per
  Wert abschaltbar sein, damit man einen externen Redis nutzen kann.
- Testwerkzeuge (Vorschlag: Vitest für die Spiel-Logik, Playwright für einen
  End-to-End-Test mit zwei Browsern).

## 9. Kubernetes und Helm

- Das Chart liegt im Repo (z. B. `charts/rps-arena`) und deployt Server mit
  eingebettetem Frontend, Service, Ingress und Redis.
- **Ingress:** Standard-Ingress mit WebSocket-Unterstützung, Host und
  `ingressClassName` über `values.yaml`, TLS über cert-manager-Annotation
  (optional schaltbar).
- Liveness- und Readiness-Probes, Ressourcen-Limits mit sinnvollen Standards,
  nicht-root-Container, read-only Root-Dateisystem wo möglich.
- Mehrere Replicas müssen funktionieren (siehe Redis).
- `helm lint` und `helm template` laufen in der CI.

## 10. Release und Automatisierung

- **Semantic Release** auf GitHub Actions bei jedem Push/Merge nach `main`.
- **Releasewürdig:** `feat` (Minor), `fix` und `perf` (Patch), Breaking Changes
  (Major). Dependency-Updates von Renovate erzeugen einen **Patch** (Commit-Präfix
  `fix(deps)`). `docs`, `ci`, `chore`, `test`, `refactor` erzeugen **kein**
  Release.
- Ein Release erzeugt: Git-Tag, GitHub Release mit Changelog, Container-Image
  (`ghcr.io/jaydee94/rps-arena:<version>`, multi-arch amd64/arm64) und das
  Helm-Chart mit passender `version` und `appVersion` als OCI-Artefakt in
  `ghcr.io`.
- **Versionierung (meine Entscheidung):** Das erste Release ist `1.0.0`
  (Standard von semantic-release). Die Chart-Version wird erst beim Verpacken
  in der Pipeline gesetzt. semantic-release committet **nichts** zurück nach
  `main`, es setzt nur den Tag und das GitHub Release. So braucht es keine
  Branch-Protection-Ausnahme und keinen Bot-Token. Das `Chart.yaml` im Repo
  trägt einen Platzhalter.
- **Merge-Regel:** Squash-Merge mit Conventional-Commit-Titel. Ein PR-Titel-Check
  in der CI stellt das sicher.
- **PR-CI:** Lint, Typprüfung, Tests, Docker-Build (ohne Push), Helm-Lint.
- **Renovate:** `renovate.json` mit Gruppierung kleiner Updates, Automerge für
  Patch-Updates bei grüner CI (meine Idee, abschaltbar), Updates für npm,
  Dockerfile, GitHub Actions und das Helm-Chart. Commit-Präfix so, dass der
  Releaseplan in Abschnitt 10 greift.
- Das Repo liegt unter `github.com/Jaydee94/rps-arena`.

## 11. Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Der Client kann die Wahl des Gegners vor der Aufdeckung auslesen oder
  manipulieren.
- Ein Pod-Neustart oder ein zweiter Replica bricht laufende Räume.
- Der Release-Prozess braucht manuelle Schritte oder erzeugt bei reinen
  Doku-Änderungen ein Release.
- Kamerabilder verlassen den Browser.
- Der erste Eindruck wirkt wie ein generisches „Template“-Spiel. Der
  Comic-Look muss Charakter haben.

## 12. Offene Punkte für den Builder (kleine Entscheidungen)

- Exakte Gestensets und Reihenfolge für Wheel 7 und 9.
- Dauer von Pick-Timer, Bluff-Zeitfenster, Reconnect-Karenz und Raum-TTL.
- Namen und Verhalten der Bot-Stufen im Detail.
- Konkrete Länge und Form der Raum-Codes.
- Quelle der Assets (Avatare, SFX, Musik): selbst erzeugt oder frei lizenziert.
  Lizenzen müssen dokumentiert werden.
