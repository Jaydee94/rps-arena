# RPS Arena

Schere-Stein-Papier im Comic-Look für den Browser: ohne Account, ohne Installation, mit einem Raum-Code oder
Link. Der Server wertet alle Runden aus und hält die Wahl jeder Seite geheim, bis alle gewählt haben. Das
Projekt läuft auf Kubernetes (Helm, Redis) und wird bei jedem releasewürdigen Merge nach `main` automatisch
released (semantic-release, Image und Chart auf GHCR).

## Inhalt

1. [Kurzbeschreibung und Features](#kurzbeschreibung-und-features)
2. [Spielmodi im Detail](#spielmodi-im-detail)
3. [Architektur](#architektur)
4. [Lokal entwickeln](#lokal-entwickeln)
5. [Lokal testen mit Docker Compose](#lokal-testen-mit-docker-compose)
6. [Deployment mit Helm](#deployment-mit-helm)
7. [Betrieb und Datenschutz](#betrieb-und-datenschutz)
8. [Release und CI](#release-und-ci)
9. [Einmalige manuelle Schritte nach dem ersten Push](#einmalige-manuelle-schritte-nach-dem-ersten-push)
10. [Lizenzen und Assets](#lizenzen-und-assets)
11. [Entscheidungen](#entscheidungen)

## Kurzbeschreibung und Features

- **Modi:** Klassik, Lizard-Spock, Wheel 7 / 9 / 15, Bluff und 2v2 Team.
- **Räume:** Wer einen Raum erstellt, bekommt einen 5-stelligen Code und einen teilbaren Link. Die anderen
  treten per Code oder Link bei. Nickname und Comic-Avatar (8 zur Auswahl) wählt man beim Beitritt, gespeichert
  wird nichts dauerhaft.
- **Bot:** Solo-Spiel gegen einen Bot in drei Stufen (leicht, mittel, schwer), in allen Duell-Modi (nicht 2v2).
- **Matchformat:** Best of 3, 5 oder 7, vom Raum-Ersteller gewählt.
- **Sprachen:** Deutsch und Englisch, umschaltbar. Die Vorgabe folgt dem Browser.
- **Audio:** Comic-SFX und eine optionale Musik-Schleife, beides einzeln stummschaltbar. Der Ton startet erst
  nach einer Nutzeraktion.
- **Kamera-Steuerung (experimentell):** Stein, Papier und Schere per Handgeste, Erkennung vollständig im Browser
  (MediaPipe). Siehe [Betrieb und Datenschutz](#betrieb-und-datenschutz).
- **Wiederverbinden:** Wer kurz wegbricht (Reload, Netzwechsel), kommt mit demselben Browser-Tab in seinen Platz
  zurück (Sitzungs-Token im `sessionStorage`).
- Bedienbar per Maus, Touch und Tastatur, auch in Handybreite. `prefers-reduced-motion` wird respektiert.

## Spielmodi im Detail

Alle Modi sind serverseitig autoritativ: Der Client schickt nur seine Wahl, der Server deckt erst auf, wenn alle
gewählt haben (oder die Zeit abgelaufen ist), und wertet aus.

| Modus (`ModeId`) | Gestenset | Regel |
| --- | --- | --- |
| Klassik (`classic`) | `classic` (3) | Stein schlägt Schere, Schere schlägt Papier, Papier schlägt Stein. |
| Lizard-Spock (`lizard-spock`) | `lizard-spock` (5) | Die 5er-Variante mit den Standardregeln. |
| Wheel 7 (`wheel7`) | `wheel7` (7) | Gesten auf einem Kreis, siehe unten. |
| Wheel 9 (`wheel9`) | `wheel9` (9) | Wie Wheel 7, mit 9 Gesten. |
| Wheel 15 (`wheel15`) | `wheel15` (15) | Wie Wheel 7, mit 15 Gesten. |
| Bluff (`bluff`) | `lizard-spock` (5) | Klassisches Duell mit vorgeschalteter, unverbindlicher Ansage. |
| 2v2 Team (`team2v2`) | `classic` (3) | Vier Personen, zwei gleichzeitige Duelle pro Runde. |

### Gestensets

Die Gesten stehen in `packages/shared/src/gestures.ts` in Kreisreihenfolge. Jede Geste schlägt die nächsten
(n-1)/2 Gesten im Uhrzeigersinn und verliert gegen die übrigen.

| Set | Gesten (Kreisreihenfolge) |
| --- | --- |
| `classic` | rock, scissors, paper |
| `lizard-spock` | rock, scissors, lizard, paper, spock |
| `wheel7` | rock, scissors, human, wolf, air, dragon, lightning |
| `wheel9` | rock, scissors, snake, tree, sponge, paper, water, devil, lightning |
| `wheel15` | rock, fire, scissors, snake, human, tree, wolf, sponge, paper, air, water, dragon, devil, lightning, gun |

`wheel7` und `wheel9` sind gleichmäßig verteilte Teilmengen von `wheel15` (in derselben Reihenfolge), damit
Icons und Übersetzungen wiederverwendet werden.

### Bluff

Jede Runde hat zwei Phasen. Zuerst gibt es eine **Ansage-Phase** (8 Sekunden): Jede Seite kann ein Emote
(eine Geste des Lizard-Spock-Sets als Sprechblase) ansagen oder darauf verzichten. Die Ansage steht für die
Gegenseite sofort sichtbar im Raum und ist **unverbindlich**, man darf lügen. Es gibt keinen Freitext. Danach
wählen beide wie gewohnt geheim aus dem Lizard-Spock-Set. Der Bot sagt zufällig an (in etwa einem Viertel der
Runden gar nichts) und wertet die Ansage des Menschen nicht aus.

### 2v2 Team

Vier Plätze: `a0`, `a1` (Team A) und `b0`, `b1` (Team B). Man wählt in der Lobby selbst einen freien Platz, der
Raum-Ersteller kann Spielende umsetzen. Der Raum-Ersteller startet das Match, sobald alle vier Plätze besetzt
sind. Jede Person wählt pro Runde geheim eine Geste aus dem Klassik-Set. Es gibt zwei Duelle, `a0` gegen `b0`
und `a1` gegen `b1`. Das Team mit mehr gewonnenen Duellen gewinnt die Runde, bei 1:1 ist die Runde
unentschieden. Einen Bot gibt es in diesem Modus nicht.

### Unentschieden, Sudden Death und Zeiten

- Unentschiedene Runden zählen nicht und werden wiederholt. Ein Match endet, sobald eine Seite
  `ceil(bestOf / 2)` Runden gewonnen hat. Weil nur Siege zählen und `bestOf` ungerade ist, kann es keinen
  Gleichstand nach der Serie geben: Die Wiederholungsregel ersetzt ein separates "Sudden Death".
- Die Zeiten stehen in `packages/shared/src/constants.ts`:

| Konstante | Wert | Bedeutung |
| --- | --- | --- |
| `PICK_TIMEOUT_MS` | 20 s | Zeit für die Wahl einer Geste. Wer nicht wählt, verliert sein Duell. Wählt niemand, ist die Runde unentschieden. |
| `ANNOUNCE_TIMEOUT_MS` | 8 s | Zeit für die Ansage im Bluff-Modus. Wer schweigt, sagt nichts an. |
| `REVEAL_MS` | 4 s | So lange bleibt das Rundenergebnis stehen. Sind alle verbundenen Spielenden "weiter", geht es früher los. |
| `RECONNECT_GRACE_MS` | 30 s | So lange kann eine getrennte Person zurückkehren. Danach verliert sie ihr Duell in dieser und allen weiteren Runden (Aufgabe). |
| `IDLE_ROUNDS_LIMIT` | 3 | Siehe unten. |
| `ROOM_TTL_S` | 1800 s | Inaktive Räume verschwinden nach 30 Minuten aus Redis. |

### Abgebrochene Matches

Eine Runde, die ohne jede menschliche Wahl oder Ansage abläuft, zählt als "leer". Nach drei leeren Runden in
Folge (`IDLE_ROUNDS_LIMIT`) endet das Match ohne Gewinner, damit verlassene Räume nicht endlos weiterlaufen. Die
Ergebnisansicht zeigt dann statt Sieg oder Niederlage "Spiel vorzeitig beendet" ("Match ended early") mit dem
Hinweis, dass das Spiel nicht weitergeführt werden konnte. Sind alle Menschen nach Ablauf der Karenzzeit
weg, löscht der Server den Raum.

**Vorzeitiges Ende durch Aufgabe:** Wer das Match endgültig verlässt (oder nach der Karenzzeit nicht
zurückkehrt), gibt auf und verliert ab dann jedes seiner Duelle. Das Match endet sofort, sobald kein Duell mehr
zwei aktive Teilnehmende hat (Regel `drawGuard` in `apps/server/src/settle.ts`):

- **1v1 (auch gegen den Bot):** Gibt eine Seite auf, gewinnt die andere. Geben beide auf, gibt es keinen Gewinner
  (bzw. gewinnt bei Punktunterschied die führende Seite).
- **2v2:** Solange noch ein Duell mit zwei aktiven Personen übrig ist (z. B. `a1` gegen `b1`, wenn `a0` geht),
  läuft das Match weiter, das verlassene Duell geht jede Runde an die Gegenseite. Sonst (beide Plätze eines Teams
  weg, oder `a0` und `b1` bzw. `a1` und `b0` weg) gewinnt das Team mit mehr aktiven Plätzen, bei Gleichstand das
  mit mehr Punkten, sonst gibt es keinen Gewinner.

Nach dem Ende eines Matches kann jede Person im Raum eine Revanche starten. Wer das Match aufgegeben hat, gibt
dabei seinen Platz frei.

## Architektur

```text
 Browser (Svelte SPA)                       Kubernetes
 ┌──────────────────┐   WebSocket    ┌──────────────────────────┐
 │ UI, i18n, Audio  │ ─────────────► │ Pod 1: Node-Server       │──┐
 │ Kamera (lokal)   │ ◄───────────── │ HTTP + Socket.IO         │  │
 └──────────────────┘  nur "Views"   ├──────────────────────────┤  ├──► Redis
        ▲                            │ Pod 2 ... N (gleich)     │──┘   Räume, Timer,
        └── statische Dateien (/) ───┴──────────────────────────┘      Pub/Sub
```

Monorepo mit npm-Workspaces:

| Pfad | Inhalt |
| --- | --- |
| `packages/shared` | Spiellogik (`match.ts`, `gestures.ts`, `constants.ts`), Protokoll mit zod-Schemas, Raum-Codes. Von Client und Server genutzt. |
| `apps/server` | Node 24, Socket.IO mit Redis-Adapter, Räume, Ticker, Bot, HTTP (statische Dateien, `/healthz`, `/readyz`). |
| `apps/web` | Svelte-5-SPA mit Vite. Styles in `src/styles` (Design-Tokens als CSS-Variablen), SVG-Assets in `src/assets`. |
| `charts/rps-arena` | Helm-Chart (Deployment, Service, optional Ingress, optionaler Redis). |
| `e2e` | Playwright-End-to-End-Tests. |
| `scripts` | Release-Skript, Compose- und Helm-Checks, Modell-Download. |

Wichtige Eigenschaften:

- **Geheime Wahl:** Der Client bekommt nie den Rohzustand. `apps/server/src/view.ts` baut pro Platz eine
  eigene Sicht aus einer Allow-List. Von anderen Plätzen ist nur sichtbar, *ob* sie gewählt haben
  (`lockedSeats`), nie *was*. Erst nach dem Aufdecken steht die Wahl in `lastRound`. Session-Token anderer
  Spielender sind nie Teil einer Sicht.
- **Redis ist der einzige Zustand:** Räume, Spielstand und Fristen liegen in Redis. Die Server-Pods halten
  nichts, was ein Neustart verlieren würde. Updates eines Raums sind atomare Read-Modify-Write-Vorgänge, die
  Pods verteilen Ereignisse über den Socket.IO-Redis-Adapter. Es sind mehrere Replicas ohne Sticky Sessions
  möglich, weil der Transport nur WebSocket ist (kein HTTP-Long-Polling, das an einen Pod gebunden wäre).
- **Fristen im Raum:** Jeder Raum trägt seine nächste Frist (`deadline`). Jeder Pod prüft alle 500 ms, welche
  Räume fällig sind, und führt die Frist atomar aus. Der Pod, der das Rennen verliert, ändert nichts. Bei einem
  Pod-Neustart verbinden die Clients automatisch neu und setzen aus dem Redis-Zustand fort. Ohne Redis
  (oder bei Redis-Ausfall) antwortet `/readyz` mit 503.
- **Zustand kurzlebig:** Redis-Schlüssel laufen nach 30 Minuten Inaktivität ab. Der mitgelieferte Redis hat
  standardmäßig keine Persistenz (siehe [Deployment mit Helm](#deployment-mit-helm)).

Das ausführliche Design steht in
[`docs/superpowers/specs/2026-10-22-rps-arena-design.md`](docs/superpowers/specs/2026-10-22-rps-arena-design.md).

## Lokal entwickeln

Voraussetzungen: Node 24 (siehe [`.nvmrc`](.nvmrc), z. B. `nvm use`) und Docker (nur für Compose, für
Image-Builds und optional für einen lokalen Redis).

```bash
npm install
```

### Dev-Server

Zwei Prozesse, je ein Terminal:

```bash
# Terminal 1: Spielserver auf :8080 (tsx watch)
RPS_DEV_MEMORY_STORE=1 npm run dev -w @rps/server

# Terminal 2: Vite-Dev-Server der Web-App (Standardport 5173)
npm run dev -w @rps/web
```

Die Web-App läuft auf `http://localhost:5173`. Vite leitet `/socket.io` (inklusive WebSocket) an
`http://localhost:8080` weiter (`apps/web/vite.config.ts`). Der `predev`-Hook der Web-App ruft
`scripts/fetch-model.mjs` auf (lädt das Kamera-Modell und kopiert die WASM-Dateien, braucht beim ersten Mal
Netzwerk, siehe [Betrieb und Datenschutz](#betrieb-und-datenschutz)).

`RPS_DEV_MEMORY_STORE=1` hält die Räume im Arbeitsspeicher des Prozesses. Das ist **nur für Entwicklung und
Tests** gedacht: ein einziger Prozess, alle Räume gehen beim Neustart verloren, keine Replicas. Ohne
`REDIS_URL` und ohne dieses Flag verweigert der Server den Start mit einer Konfigurationsfehlermeldung. Ist
`REDIS_URL` gesetzt, wird Redis genutzt und das Flag ignoriert. Mit einem echten Redis (z. B. aus
[Docker Compose](#lokal-testen-mit-docker-compose)) startet man den Server mit `REDIS_URL=redis://127.0.0.1:6380`.

Den gebauten Stand (Server liefert die SPA selbst aus) prüft man so:

```bash
npm run build
RPS_DEV_MEMORY_STORE=1 npm start -w @rps/server   # http://localhost:8080
```

### Demo-Ansichten (nur Dev)

Im Vite-Dev-Server rendert `?demo=<screen>` einen Bildschirm aus Mock-Daten, ohne Server. Das dient zum Prüfen
des Looks. Der Code steht in `apps/web/src/lib/demo.ts` und wird nur bei `import.meta.env.DEV` geladen, ein
Produktions-Build enthält ihn nicht.

```text
http://localhost:5173/?demo=home|lobby|board|reveal|result|gallery
```

Weitere Parameter: `mode=<Modus-ID>`, `outcome=win|lose|draw`, `picked=1`, `phase=announce`, `left=<Sekunden>`,
`bot=1`, z. B. `?demo=board&mode=wheel15`.

### Prüfen und bauen

| Befehl | Zweck |
| --- | --- |
| `npm run lint` | ESLint über das Repo und alle Workspaces |
| `npm run typecheck` | `tsc` bzw. `svelte-check` in allen Workspaces und `tsc -p e2e` |
| `npm test` | Vitest für alle Workspaces und `scripts/` |
| `npm run build` | Server-Bundle (esbuild) und Web-App (Vite) bauen, lädt zuerst das Kamera-Modell |
| `npm run e2e` | `npm run build`, dann Playwright (Chromium) |

Die Redis-Tests (`apps/server/src/redis-store.test.ts`) laufen nur, wenn `REDIS_URL` gesetzt ist, und werden
sonst übersprungen. `npm run compose:test` führt sie mit einem echten Redis aus.

Für `npm run e2e` einmalig den Browser installieren: `npx playwright install chromium`. Der Test startet den
gebauten Server selbst (mit `RPS_DEV_MEMORY_STORE=1`) auf Port 47831, anpassbar mit `E2E_PORT`. Die Szenarien
decken u. a. ein Klassik-Match zu zweit, die Geheimhaltung der Wahl, ein Bot-Match, Wheel 15, Fehlerfälle,
Wiederverbinden, Sprachwechsel und Handybreite ab.

## Lokal testen mit Docker Compose

Voraussetzung: Docker mit Compose v2. Für `compose:smoke` und `compose:check` läuft ein Skript auf dem Host und
braucht die Abhängigkeiten: einmalig `npm ci` im Repo ausführen. Alle Ports sind nur an `127.0.0.1` gebunden.

```bash
npm run compose:up      # baut das Image, startet Redis + App auf http://127.0.0.1:8080
npm run compose:test    # gesamte Testsuite in einem Container, mit Redis (Redis-Tests laufen)
npm run compose:smoke   # Redis + App + zweite Instanz (:8081), dann Smoke-Test über beide
npm run compose:check   # kompletter Ablauf inklusive Aufräumen
npm run compose:down    # alles stoppen, Volumes und verwaiste Container entfernen
```

Die Services in [`compose.yaml`](compose.yaml):

| Service | Profil | Zweck |
| --- | --- | --- |
| `redis` | (immer) | Redis 7, Host-Port `REDIS_PORT` (Standard 6380, bewusst nicht 6379) |
| `app` | (immer) | Das Runtime-Image des Dockerfiles, read-only Root-Dateisystem, `/tmp` als tmpfs, Port `APP_PORT` (8080) |
| `app2` | `replicas` | Zweite Instanz auf demselben Redis, Port `APP2_PORT` (8081) |
| `tests` | `test` | Testsuite aus der `test`-Stage des Dockerfiles |

- **Ports und Namen:** Belegte Ports lassen sich mit `APP_PORT`, `APP2_PORT` und `REDIS_PORT` ändern, z. B.
  `APP_PORT=18080 npm run compose:up`. Kein Service hat einen festen Containernamen, mehrere Checkouts laufen
  mit unterschiedlichem `COMPOSE_PROJECT_NAME` und eigenen Ports nebeneinander.
- **Eigene Ports bei `compose:smoke`:** Das Smoke-Skript läuft auf dem Host und spricht standardmäßig
  `127.0.0.1:8080` und `127.0.0.1:8081` an. Mit geänderten Ports müssen deshalb zusätzlich `APP_URL` und
  `APP2_URL` gesetzt werden. Nur `compose:check` reicht `APP_PORT`, `APP2_PORT` und `REDIS_PORT` selbst an das
  Skript weiter.

  ```bash
  export APP_PORT=18080 APP2_PORT=18081
  APP_URL=http://127.0.0.1:18080 APP2_URL=http://127.0.0.1:18081 npm run compose:smoke
  ```

- **`tests`-Service:** Wird aus der `test`-Stage des [`Dockerfile`](Dockerfile) gebaut. Quellcode und
  Abhängigkeiten stecken im Image, es gibt **keinen Bind-Mount**, und nichts wird in den Arbeitsordner
  geschrieben. `compose:test` baut mit `--build` bei jedem Aufruf neu (Docker-Cache greift). Mit
  `COMPOSE_TEST_CMD` lässt sich ein anderer Befehl setzen:
  `COMPOSE_TEST_CMD="npm test -w @rps/server" npm run compose:test`.
- **`compose:smoke`** startet `redis`, `app` und `app2` und führt
  [`scripts/compose-smoke.mjs`](scripts/compose-smoke.mjs) aus. Der Stack läuft danach weiter, aufräumen mit
  `npm run compose:down`.
- **`compose:check`** ([`scripts/compose-check.sh`](scripts/compose-check.sh)) prüft die Compose-Konfiguration
  (alle Profile), baut und startet die App, prüft `/healthz` und `/readyz`, führt die Tests gegen Redis aus
  (und stellt sicher, dass die Redis-Tests wirklich laufen, nicht übersprungen werden), startet die zweite
  Instanz und führt den Smoke-Test aus. Danach räumt es immer auf. Es hängt an `COMPOSE_TEST_CMD` automatisch
  `-- --reporter=verbose` an. Wird der Befehl überschrieben, müssen darin die `@rps/server`-Tests enthalten sein,
  weil die Prüfung "Redis-Tests liefen" sie im Log sucht. Es nutzt standardmäßig das Projekt
  `rps-arena-check`, damit ein laufender Dev-Stack nicht abgebaut wird (`COMPOSE_PROJECT_NAME` überschreibt das).
  Es braucht auf dem Host `docker`, `curl`, `node` und die per `npm ci` installierten Abhängigkeiten.

**Was der Smoke-Test beweist:** Zwei Clients verbinden sich mit *verschiedenen* Instanzen derselben Redis-Datenbank
und spielen einen Raum. Geprüft wird, dass (1) Erstellen und Beitreten über Instanzen hinweg funktioniert,
(2) die geheime Wahl von A bei B nicht ankommt, bevor B gewählt hat, (3) das Aufdecken per Redis-Adapter an
beide Instanzen verteilt wird und (4) ein Wiederverbinden über die andere Instanz mit dem Sitzungs-Token den Platz
wiederherstellt.

## Deployment mit Helm

Das Chart liegt in [`charts/rps-arena`](charts/rps-arena) und wird bei jedem Release als OCI-Artefakt nach
`ghcr.io/jaydee94/charts/rps-arena` veröffentlicht (Chart-Name `rps-arena`, `version` und `appVersion` sind die
Release-Version). Das Chart im Repository trägt den Platzhalter `0.0.0`. Es deployt die App (Server mit
eingebetteter Web-App), einen Service, optional einen Ingress und standardmäßig einen einfachen Redis.

```bash
helm install rps oci://ghcr.io/jaydee94/charts/rps-arena --version 1.0.0 \
  --namespace rps --create-namespace -f values.yaml
```

Die Version (`--version`) ist ein veröffentlichtes Release. Ist das Chart-Paket privat, vorher mit
`helm registry login ghcr.io` anmelden. Mit dem Release-Namen `rps` heißen die Ressourcen `rps-rps-arena`
(und `rps-rps-arena-redis`).

Beispiel `values.yaml`:

```yaml
replicaCount: 2

image:
  tag: ""            # leer = appVersion des Charts

resources:
  requests: { cpu: 100m, memory: 128Mi }
  limits: { cpu: 500m, memory: 256Mi }

ingress:
  enabled: true
  className: nginx
  host: rps.example.com
  tls:
    enabled: true
    clusterIssuer: letsencrypt-prod   # setzt die Annotation cert-manager.io/cluster-issuer

# Eigener Redis statt des mitgelieferten:
redis:
  enabled: false
  externalUrl: redis://redis.example.internal:6379
```

Alle Werte mit Standards stehen in [`charts/rps-arena/values.yaml`](charts/rps-arena/values.yaml). Weitere
Umgebungsvariablen für den Container gehen über die Map `env`. Ohne Ingress erreicht man das Spiel per
`kubectl --namespace rps port-forward svc/rps-rps-arena 8080:80` (die Hinweise nach `helm install` zeigen den
passenden Befehl).

**Redis:** Mit `redis.enabled: true` (Standard) startet das Chart einen einzelnen Redis (`redis:7-alpine`) ohne
Authentifizierung und ohne Persistenz. Fällt er aus, gehen laufende Räume verloren. Mit
`redis.persistence.enabled=true` entsteht ein PVC (`redis.persistence.size`, `storageClass`). Mit
`redis.enabled: false` ist `redis.externalUrl` Pflicht, sonst bricht `helm template` mit einer klaren Meldung
ab. Die URL steht im Klartext in der Deployment-Umgebung, ein Passwort in der URL liegt also im Manifest, das
Chart kann derzeit keine Secret-Referenz einbinden.

**Anforderungen an den Ingress:**

- **WebSocket-Timeouts:** Die Annotationen `nginx.ingress.kubernetes.io/proxy-read-timeout` und
  `proxy-send-timeout` stehen standardmäßig auf 3600 s (ingress-nginx). Bei anderen Controllern über
  `ingress.annotations` anpassen.
- **`Host`-Header muss erhalten bleiben:** Der Server akzeptiert eine WebSocket-Verbindung nur, wenn der
  `Origin` des Browsers zum `Host` der Anfrage passt (kein CORS, `apps/server/src/io.ts`). Ein Proxy, der den
  `Host` umschreibt, führt zu abgewiesenen Verbindungen.
- **Keine Sticky Sessions nötig.** Der Zustand liegt in Redis, mehrere Replicas sind der Normalfall.
- Nur Ingress, keine Gateway API.

**Probes und Sicherheit:** Liveness `GET /healthz`, Readiness `GET /readyz` (200 nur, wenn Redis antwortet). Der
Container läuft als Nicht-Root (UID/GID 1000), mit `readOnlyRootFilesystem`, ohne Privilege Escalation, ohne
Linux-Capabilities und mit dem Seccomp-Profil `RuntimeDefault`. `/tmp` ist ein `emptyDir`. Standard-Ressourcen:
50m CPU / 96Mi Request, 500m CPU / 256Mi Limit.

**Chart prüfen:**

```bash
helm lint charts/rps-arena
bash scripts/helm-check.sh   # braucht helm und yq, dazu kubeconform oder Docker
```

[`scripts/helm-check.sh`](scripts/helm-check.sh) lintet das Chart in mehreren Varianten, rendert es mit
`helm template`, prüft per `yq` die wichtigsten Eigenschaften (Security-Kontext, Probes, Redis-Varianten,
Ingress, keine Sticky-Annotationen) und validiert die Manifeste mit kubeconform.

## Betrieb und Datenschutz

### Umgebungsvariablen

Gelesen in [`apps/server/src/config.ts`](apps/server/src/config.ts):

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PORT` | `8080` | HTTP- und WebSocket-Port (ganze Zahl 1 bis 65535) |
| `REDIS_URL` | (keiner) | Pflicht in Produktion. Muss mit `redis://` oder `rediss://` beginnen. Die URL wird nie geloggt. |
| `RPS_DEV_MEMORY_STORE` | (aus) | `1` = Räume im Arbeitsspeicher, nur Entwicklung und Tests (siehe oben) |
| `STATIC_DIR` | `apps/web/dist` relativ zum Server | Verzeichnis der gebauten Web-App. Das Image legt sie passend ab, die Variable ist dort nicht nötig. |

Das Image setzt `NODE_ENV=production` und `PORT=8080`. Der Server fährt bei `SIGTERM` geordnet herunter
(Clients verbinden sich mit einem anderen Pod neu).

### Redis

Redis ist Pflicht (außer im Dev-Modus) und der einzige Zustand. Jeder Raum ist ein Schlüssel mit einer
Inaktivitäts-TTL von 30 Minuten (`ROOM_TTL_S`). Es werden keine Spielverläufe, Accounts oder Ranglisten
gespeichert.

### Sicherheits-Header

Der Server setzt eine strenge Content-Security-Policy (`default-src 'self'`, `script-src 'self'
'wasm-unsafe-eval'`, `worker-src 'self' blob:` für MediaPipe), `X-Content-Type-Options`, `Referrer-Policy:
no-referrer`, `X-Frame-Options: DENY` und `Permissions-Policy: camera=(self), microphone=(), geolocation=()`.
Hashed Assets unter `/assets/` werden langfristig gecacht, alles andere muss revalidiert werden. Nachrichten sind
auf 10 kB begrenzt, pro Verbindung gibt es ein Ratenlimit.

### Kamera-Steuerung

- **Alles im Browser:** Die Handgesten-Erkennung läuft mit MediaPipe (`@mediapipe/tasks-vision`) vollständig
  im Browser. Es verlässt **kein Videobild** das Gerät, gesendet wird nur die bestätigte Wahl (Stein, Papier
  oder Schere). Library, WASM-Dateien und Modell kommen vom eigenen Server, es gibt keine Anfrage an ein CDN
  oder an Google.
- **Nur auf Wunsch:** Die Library und das Modell werden erst geladen, wenn man die Kamera einschaltet. Die
  Kamera wird erst geöffnet, nachdem das Modell geladen ist. Ohne Kamera oder bei verweigerter Berechtigung
  zeigt die App eine Meldung, die Klick-Steuerung bleibt unberührt.
- **Umfang:** Experimentell und nur für Spiele mit dem Klassik-Set (Klassik und 2v2). Erkannt werden
  `Closed_Fist` (Stein), `Open_Palm` (Papier) und `Victory` (Schere). Eine Geste zählt erst, wenn sie
  900 ms ununterbrochen gehalten wird.
- **Pinned auf 0.10.x:** `@mediapipe/tasks-vision` steht in `apps/web/package.json` exakt auf `0.10.35`.
  Versionen ab 1.0 liefern eine eingebaute Telemetrie mit (ein POST an einen Google-Logging-Endpunkt, so
  beschreibt es auch die Renovate-Regel). Bei der Analyse von 1.1.1 fand sich dieser Logger im Bundle, in 0.10.x
  sind keine externen URLs enthalten. Das widerspräche der Zusage "keine Anfragen an Dritte". Die Version darf
  deshalb nicht auf 1.x angehoben werden, ohne das zu prüfen. Renovate ist per Regel in `renovate.json` darauf
  eingestellt, die Version nicht auf 1.x zu heben (`allowedVersions: "<1"`).
- **Modell-Download beim Build:** `scripts/fetch-model.mjs` (läuft als `predev`/`prebuild` der Web-App und damit
  auch im Docker-Build) lädt `gesture_recognizer.task` von `storage.googleapis.com`, prüft die SHA-256-Summe und
  bricht bei Abweichung ab. Der Build braucht deshalb **Netzwerk**. Ein vorhandenes, geprüftes Modell wird nicht
  erneut geladen. Zur Laufzeit ist kein Netzwerkzugriff nötig. Die WASM-Dateien kopiert das Skript aus dem
  npm-Paket nach `apps/web/public/mediapipe-wasm/`.
- **`.wasm`:** Der Server liefert `.wasm` als `application/wasm` aus. Wer die statischen Dateien hinter einem
  anderen Server ausliefert, muss das ebenfalls sicherstellen und `wasm-unsafe-eval` in der CSP erlauben.

## Release und CI

### Conventional Commits und Releaseplan

Commit-Nachrichten (bei Squash-Merges der PR-Titel) folgen den
[Conventional Commits](https://www.conventionalcommits.org/). Die Regeln stehen in
[`.releaserc.json`](.releaserc.json):

| Commit | Release |
| --- | --- |
| `feat` | minor |
| `fix`, `perf` | patch |
| `fix(deps)` (Renovate) | patch |
| Breaking Change (`feat!:` oder Footer `BREAKING CHANGE:`) | major |
| `docs`, `ci`, `chore`, `test`, `refactor`, `build`, `style` | kein Release |

Das erste Release ist `1.0.0`. Jeder Push auf `main` startet den Workflow
[`release.yml`](.github/workflows/release.yml): Er installiert die Abhängigkeiten und führt als Qualitätstor
`npm run lint && npm run typecheck && npm test` aus. Erst danach läuft semantic-release. Der End-to-End-Test läuft
nur in der PR-CI. Wenn die Commits ein Release rechtfertigen, entstehen:

- der Git-Tag `vX.Y.Z` und ein GitHub Release mit Changelog,
- das Multi-Arch-Image (linux/amd64 und linux/arm64) `ghcr.io/jaydee94/rps-arena:X.Y.Z`, bei stabilen
  Versionen zusätzlich `:latest`,
- das Helm-Chart als OCI-Artefakt `oci://ghcr.io/jaydee94/charts/rps-arena` in Version `X.Y.Z` (mit `appVersion`
  `X.Y.Z`).

semantic-release committet **nichts** zurück nach `main`. Es setzt nur Tag und GitHub Release, das Chart bekommt
seine Version erst beim Verpacken in [`scripts/publish.sh`](scripts/publish.sh). Dadurch braucht `main` keine
Ausnahme in der Branch-Protection und keinen Bot-Token. `publish.sh` überschreibt nie ein bereits vorhandenes
Image oder Chart und bricht ab, wenn die Registry nicht eindeutig antwortet.

### Pull Requests

Gemergt wird per **Squash-Merge** mit einem Conventional-Commit-Titel. Der Workflow
[`pr-title.yml`](.github/workflows/pr-title.yml) prüft den PR-Titel (erlaubte Typen: `feat`, `fix`, `perf`,
`docs`, `ci`, `chore`, `test`, `refactor`, `build`, `style`). Die PR-CI [`ci.yml`](.github/workflows/ci.yml)
läuft bei Pull Requests gegen `main` (und manuell) mit diesen Jobs:

| Job | Inhalt |
| --- | --- |
| `test` | `npm ci`, Lint, Typprüfung, Tests (mit einem Redis-Service, die Redis-Tests laufen also) |
| `e2e` | Build und Playwright-Tests mit Chromium (bei Fehlern wird der Report als Artefakt hochgeladen) |
| `image` | Docker-Build ohne Push |
| `chart` | `scripts/helm-check.sh` (Helm-Lint, `helm template`, kubeconform) |
| `renovate-config` | Validiert `renovate.json` mit dem Renovate-Config-Validator (`--strict`) |

### Wenn das Veröffentlichen fehlschlägt

semantic-release legt Tag und GitHub Release an, *bevor* es `scripts/publish.sh` aufruft. Schlägt das
Veröffentlichen von Image oder Chart fehl, findet ein erneuter Lauf nichts Neues und tut nichts. Stattdessen:
**Actions → release → Run workflow** und die vorhandene Version ohne `v` eintragen, z. B. `1.2.3`. Der Job
`republish` checkt den Tag aus, baut Image und Chart neu und veröffentlicht beides. Vorhandene Artefakte werden
nicht überschrieben, ein halb fertiger Release lässt sich so vervollständigen. Alternativ von Hand (braucht
`docker`, `helm` und `git` sowie einen buildx-Builder, der Multi-Plattform-Images bauen kann, z. B. mit QEMU):

```bash
git checkout v1.2.3
docker login ghcr.io
bash scripts/publish.sh 1.2.3
# Trockenlauf: baut lokal nur für die eigene Plattform, pusht nichts, kontaktiert die Registry nicht
bash scripts/publish.sh 1.2.3 --dry-run
```

**Erstes Veröffentlichen:** GHCR antwortet für Pakete, die es noch nicht gibt, mit `403 denied`. Das lässt sich
nicht von einem echten Rechteproblem unterscheiden, deshalb bricht `publish.sh` bei so einer Antwort ab und
pusht nichts. Scheitert der allererste Release-Lauf im Veröffentlichen (Tag und GitHub Release existieren dann
schon), startet man den manuellen Lauf mit der erzeugten Version (z. B. `1.0.0`) und setzt zusätzlich
**`first_publish = true`**. Dann gilt eine Autorisierungsantwort als "Paket existiert noch nicht" (Warnzeile im
Log) und Image sowie Chart werden gepusht. Netzwerkfehler, Timeouts und Serverfehler brechen weiter ab. Von Hand
geht dasselbe mit `bash scripts/publish.sh 1.0.0 --assume-missing` (oder der Umgebungsvariable
`PUBLISH_ASSUME_MISSING=1`). `first_publish` nie für spätere Releases setzen. Nur der manuelle Job kann das Flag
setzen, der Lauf bei einem Push nie.

### Renovate

[`renovate.json`](renovate.json) erweitert `config:recommended` und gilt für npm, Dockerfile, GitHub Actions und
Helm sowie für zwei Custom Manager (Node-Image im Dockerfile und die angepinnte Renovate-Version im Job
`renovate-config`). Die Regeln im Überblick, Details und Begründungen stehen als `description` in der Datei:

- Renovate-Commits haben das Präfix `fix(deps)`, ein Update erzeugt also einen Patch-Release. Ausnahmen mit
  `build(deps)` (kein Release): das Release-Tooling (siehe unten) und die in `ci.yml` angepinnte Renovate-Version,
  die nur die CI-Validierung betrifft und kein Spielupdate ist. Automerge gilt dafür wie sonst (Minor und Patch).
- Minor- und Patch-Updates der npm-Abhängigkeiten werden in einem PR gruppiert. Minor- und Patch-Updates werden
  automatisch gemergt (Platform-Automerge), sobald die Required Checks grün sind. **Major-Updates bleiben
  manuell.**
- Das Release-Tooling (`semantic-release` und seine Plugins) bekommt eine eigene Gruppe, keinen Automerge und
  das Präfix `build(deps)`, löst also kein Release aus und wird von Hand geprüft.
- Versionsgrenzen: `@mediapipe/tasks-vision` bleibt unter 1.0 (Telemetrie, siehe oben) und
  `conventional-changelog-conventionalcommits` unter 10 (inkompatibel mit dem Release-Notes-Generator).
- Der Node-Major des Dockerfile-Images folgt `.nvmrc` und wird von Hand angehoben.

Die Konfiguration wird in der CI validiert (Job `renovate-config`).

## Einmalige manuelle Schritte nach dem ersten Push

- [ ] **Repository** `Jaydee94/rps-arena` auf GitHub anlegen bzw. verbinden und `main` pushen.
- [ ] **Renovate** installieren: die Renovate GitHub App für das Repository freigeben. Sie liest die vorhandene
  `renovate.json` und öffnet danach die Update-PRs.
- [ ] **Merge-Einstellungen** (Settings → General → Pull Requests): nur *Squash merging* erlauben, als
  Commit-Nachricht "Pull request title" wählen. Merge-Commits und Rebase-Merge deaktivieren.
- [ ] **Auto-Merge** erlauben (Settings → General → Pull Requests → *Allow auto-merge*). Renovate nutzt
  `platformAutomerge` und braucht diese Einstellung.
- [ ] **Ersten Pull Request öffnen** (z. B. eine kleine Doku-Änderung), damit `ci.yml` und `pr-title.yml` einmal
  laufen. GitHub bietet Status-Checks in der Branch-Protection erst zur Auswahl an, nachdem sie gelaufen sind.
- [ ] **Branch-Protection** für `main` (Settings → Branches oder Rulesets), nach dem ersten PR: Pull Request
  vorschreiben und diese Status-Checks verlangen (die Namen der Jobs): `test`, `e2e`, `image`, `chart`,
  `renovate-config` (aus `ci.yml`) und `pr-title` (aus `pr-title.yml`).
  Der Renovate-Automerge wartet dann auf grüne Checks. Eine Ausnahme für den Release-Bot ist nicht nötig,
  weil nichts nach `main` zurückgeschrieben wird.
- [ ] **Actions-Rechte** (Settings → Actions → General → Workflow permissions): Die Workflows fordern ihre Rechte
  selbst per `permissions:` an (`contents: write`, `packages: write`, `issues: write`, `pull-requests: write` im
  Release-Job). Eine Org- oder Repo-Einstellung darf das nicht kappen, damit `GITHUB_TOKEN` Tags, Releases und
  Pakete anlegen kann. Gibt es Tag-Rulesets, müssen sie das Anlegen von `v*`-Tags durch GitHub Actions erlauben.
- [ ] **GHCR-Pakete:** Nach dem ersten Veröffentlichen entstehen zwei Pakete, `rps-arena` (Image) und
  `charts/rps-arena` (Chart). Neue GHCR-Pakete sind privat. Auf Wunsch unter *Package settings* auf öffentlich
  stellen (dann ist für `helm install` und `docker pull` keine Anmeldung nötig), jedes Paket mit dem Repository
  verknüpfen (*Connect repository*) und dem Repository Schreibzugriff für Actions geben (*Manage Actions
  access*). Das Image trägt das Label `org.opencontainers.image.source`, das Chart-Paket sollte man prüfen.
- [ ] **Erstes Release:** Der erste Push auf `main` mit `feat`-Commits erzeugt `1.0.0`. Scheitert dabei das
  Veröffentlichen mit einer 403-Antwort von GHCR, den manuellen Lauf mit `first_publish = true` starten
  (siehe [Release und CI](#release-und-ci)).

## Lizenzen und Assets

Der Quellcode steht unter der [MIT-Lizenz](LICENSE). Alle Illustrationen (Avatare, Gesten) sind selbst
gezeichnete SVGs und stehen unter derselben Lizenz. Die Schriften Bangers und Comic Neue sind
selbst gehostet (SIL Open Font License 1.1, Lizenztexte liegen neben den Dateien). SFX und Musik werden zur
Laufzeit mit der Web-Audio-API erzeugt, es gibt keine Audiodateien. Zur Laufzeit wird kein Asset von Dritten
geladen. Quellen und Lizenzen stehen in [`docs/assets.md`](docs/assets.md).

## Entscheidungen

Nicht offensichtliche Festlegungen (Details im [Design](docs/superpowers/specs/2026-10-22-rps-arena-design.md)):

- **Bluff nutzt das Lizard-Spock-Set** (die Emotes der Ansage sind dessen fünf Gesten). Die Ansage ist
  unverbindlich und eine feste Emote-Auswahl, kein Freitext, damit es keine Moderation und keine Längenlimits
  braucht.
- **2v2 nutzt das Klassik-Set.** Das Datenmodell trennt Modus und Gestenset (`gestureSetFor`), andere
  Kombinationen sind später möglich. Im 2v2 gibt es keinen Bot.
- **Redis ist der einzige Zustand.** Es gibt keinen Zustand im Prozess, deshalb funktionieren mehrere
  Replicas, Pod-Neustarts und Rolling Updates ohne Sticky Sessions. `RPS_DEV_MEMORY_STORE=1` ist nur ein
  Entwicklungs- und Testwerkzeug.
- **Nur WebSocket**, kein Long-Polling-Fallback, damit kein Pod an eine Sitzung gebunden ist.
- **Abbruchregel:** Drei leere Runden in Folge beenden ein Match ohne Gewinner, damit verlassene Räume nicht
  endlos laufen und ihre TTL erneuern.
- **Kein Sudden Death als eigene Phase:** Unentschiedene Runden werden wiederholt, ein Seriengleichstand ist
  bei ungeradem `bestOf` nicht möglich.
- **Kamera nur für das Klassik-Set**, als experimentelle, abschaltbare Funktion, mit Halte-Zeit gegen
  Fehlerkennungen. Die Library ist auf 0.10.x gepinnt (Telemetrie in 1.x).
- **Keine Rückschreibung nach `main`:** Die Chart-Version wird erst beim Verpacken gesetzt.
- **Keine Accounts, keine Rangliste, kein Matchmaking** mit Fremden, kein Hot-Seat-Modus.
