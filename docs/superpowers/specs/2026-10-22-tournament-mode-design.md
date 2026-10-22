# Turniermodus – Design

Stand: 2026-10-22. Entstanden im Gespräch mit Jan. Noch nichts gebaut.

## Worum es geht und warum

RPS Arena kennt heute nur Duelle (1 gegen 1, 2 gegen 2). Jan möchte, dass eine Runde Freunde (oder ein Team) mit **allen Leuten im Raum** ein Turnier spielen kann: zufällig ausgelost, mit Baum oder Tabelle, mit Siegerehrung. Der Reiz ist das gemeinsame Event: Alle sind im selben Raum, schauen die Matches der anderen live und fiebern mit.

## Ziele

- 4 bis 8 Spieler in **einem** Raum spielen ein Turnier.
- Der Host wählt in der Lobby das **Format**: K.o.-Baum oder Alle gegen alle.
- Der Host wählt **einen Gesten-Modus** für das ganze Turnier (Klassisch, Echse-Spock, Rad der 7/9/15; nicht Bluff, nicht 2 gegen 2). Jedes Match ist **Best of 3**.
- Die Auslosung ist zufällig. Sie wird als kleine Comic-Animation gezeigt (entfällt bei reduzierter Bewegung).
- Die Matches laufen **nacheinander**. Alle anderen im Raum, auch ausgeschiedene Spieler und Zuschauer, **sehen das laufende Match live** (die gewählten Gesten bleiben wie immer bis zum Aufdecken geheim).
- Zwischen zwei Matches zeigt der Raum rund 6 Sekunden den Baum bzw. die Tabelle mit dem Ergebnis, dann startet das nächste Match **automatisch**. Der Host kann die Pause überspringen.
- Der Host spielt als normaler Teilnehmer mit und hat zusätzlich die Start- und Einstellungsrechte.
- Wer **nach dem Start** beitritt, kommt als **Zuschauer** in den Raum (sieht Baum/Tabelle und Matches, spielt nicht mit).
- Die **Zuschauerrolle gilt für alle Räume**, nicht nur für Turniere: Auch wer einem laufenden normalen Duell (1v1, 2v2, Bot) per Einladungslink beitritt, kommt als Zuschauer hinein, statt „Raum voll“ zu bekommen (Jans Entscheidung).
- Siegerehrung am Ende; danach „Nochmal“ (gleiche Teilnehmer, neue Auslosung) und „Zurück“.

## Spielregeln des Turniers

- **K.o.-Baum:** zufällige Setzung. Bei ungerader Zahl gibt es **Freilose** (wer eins hat, kommt ohne Match weiter). Wer verliert, scheidet aus und wird Zuschauer.
- **Alle gegen alle:** jeder gegen jeden, Tabelle nach gewonnenen Matches. Bei Gleichstand zählt zuerst der **direkte Vergleich**. Bei Gleichstand von drei oder mehr Spielern, den der direkte Vergleich nicht auflöst, spielen die Beteiligten ein **Stichmatch** (Best of 1, bei mehr als zwei Beteiligten wiederum nach den gleichen Regeln).
- **Verbindungsabbruch:** Es gilt die vorhandene Wiederverbinden-Frist von 30 s. Danach hat die Person per **Forfait** verloren. Im K.o.-Baum kommt der Gegner weiter; bei Alle gegen alle zählen die ausstehenden Matches der Person als verloren. Das Turnier läuft weiter.
- Ausgeschiedene und zuschauende Personen dürfen sich trennen und wieder verbinden, ohne dass das Turnier oder der Raum davon berührt wird.

## Nicht-Ziele

- Keine Bots im Turnier (kein Auffüllen auf 4/8 Spieler).
- Kein 2-gegen-2-Turnier, kein Bluff-Modus im Turnier.
- Kein paralleles Spielen mehrerer Matches, keine Doppel-K.o.-Bäume, kein Schweizer System.
- Keine Accounts, keine Rangliste über mehrere Turniere hinweg, keine Archivierung.
- Kein Chat.

## Anti-Ziele (daran würde es scheitern, auch wenn es technisch läuft)

- Ein einzelner Verbindungsabbruch, ein gelangweilter Zuschauer oder die Entscheidung des Hosts darf das Turnier **nicht** einfrieren.
- Zuschauer dürfen **niemals** eine Geste vor dem Aufdecken sehen (weder in der Ansicht noch im Datenverkehr).
- Die bestehenden Duelle (1v1, 2v2, Bot) dürfen sich **für die Spielenden** nicht verändern oder langsamer werden. Die einzige gewollte Verhaltensänderung: Späte Beitritte werden Zuschauer statt „Raum voll“ (die bisherigen Tests dazu werden bewusst angepasst). Vor dem Start einer Partie bleibt ein volles Duell-Raum-Lobby weiterhin voll (Zuschauer gibt es erst, wenn die Partie läuft).

## Rahmenbedingungen aus dem Bestand (Recherche)

Das Paket `packages/shared` und der Server sind auf **ein** Match mit **festen vier Plätzen** (`a0`, `a1`, `b0`, `b1`) gebaut:

- `SeatId` ist eine Vereinigung aus vier Werten und steckt in Protokoll (zod), Raummodell, Ansichten, Kanälen, Gateway, Web (`teamOf`, `Lobby`, `Result`, `sfx-bridge`) und vielen Tests (z. B. `view.test.ts`, `protocol.test.ts`, `store.contract.ts`).
- Ein Raum hat genau **ein** `match`, einen Zeitgeber (`deadline`/`phaseDeadline`), eine Bot-Stufe und eine begrenzte `history` (max. 50). Der Ticker (`ticker.ts`) und `settle`/`tick` hängen daran.
- Es gibt **keine Zuschauer**: Ansichten gehen über Kanäle pro Platz; `RoomView.you` ist Pflicht; `joinRoom` lehnt nach Matchbeginn mit `room_full` ab; `seatOfSocket` wirft für nicht sitzende Sockets.
- Der Raum liegt als **ein JSON-Dokument** im Speicher bzw. in Redis (optimistische Sperre, TTL 1800 s, Retry bis 20). Baum/Tabelle und Teilnehmerzahl vergrößern es; die View-Verteilung (`broadcast`, eine Ansicht pro Teilnehmer) wächst mit.
- Die Match-Logik (`match.ts`: `createMatch`, `pick`, `advance`, `timeoutPhase`, `forfeitSeat`) ist rein und arbeitet auf zwei Plätzen (`a0` gegen `b0`). Eine Paarung lässt sich als `a0 = Spieler X`, `b0 = Spieler Y` abbilden und damit **unverändert wiederverwenden**.
- Der Leerlauf-Abbruch (`IDLE_ROUNDS_LIMIT = 3`) und die Aufgeben-Logik (`isAbandoned`, `graceEnd`) gehen vom Raum als „sitzende Menschen“ aus. Zuschauer und Ausgeschiedene dürfen dort nicht als Spieler zählen.
- Tests, die Formen festschreiben und deshalb angepasst oder gezielt erweitert werden müssen: `view.test.ts` (ganzer View per `toEqual`, Geheimhaltungsprüfungen), `protocol.test.ts` (`RoomJoined` ist genau `{code, seat, token}`), Gateway-Tests zu `room_full` nach Start, `store.contract.ts`.

## Vorgehen (Jan hat zugestimmt, in zwei Stufen zu bauen)

**Stufe 1 – Fundament: Teilnehmer und Zuschauer im Raum.** Ohne Turnierlogik. Ergebnis: ein Raum kann mehr als zwei/vier Personen halten, jede Person hat eine eigene Kennung (Teilnehmer-ID statt festem Platz), es gibt eine Zuschauerrolle mit eigener, geheimhaltungssicherer Ansicht, und späte Beitritte während eines laufenden Matches sind **in allen Raumarten** als Zuschauer möglich. Das Spielverhalten der bestehenden Modi bleibt für die Spielenden unverändert (Rückwärtskompatibilität des Verhaltens, nicht unbedingt der Datenform). Zuschauer zählen nie als Spieler: nicht für Leerlauf-Abbruch, Raum-Verlassen, Wiederverbinden-Frist oder „Alle haben ‚Weiter‘ gedrückt“. Das ist der größte Eingriff und sollte für sich getestet und reviewt werden, bevor Stufe 2 darauf aufbaut.

**Stufe 2 – Turnier.** Eine Turnier-Schicht im Server, die Format, Setzung, Freilose, Tabelle, Stichmatch-Regeln und den Ablauf „Paarung → Match → Ergebnis → Pause → nächste Paarung“ besitzt und je Paarung die vorhandene Match-Logik laufen lässt. Dazu die Oberflächen: Turnier-Einstellungen in der Lobby, Auslosungsanimation, Baum- und Tabellenansicht, Zuschauer-Brett mit dem laufenden Match, Siegerehrung. Texte in DE und EN, Comic-Panel-Look, Bewegung nur in `animations.css` (siehe `2026-10-22-comic-panel-design-handoff.md`).

## Entscheidungen des Autors (Jan hat sie nicht ausdrücklich getroffen, bitte prüfen)

- **Match ohne Sieger** (beide untätig, Leerlauf-Abbruch, beide gleichzeitig getrennt): Im K.o.-Baum kommt weiter, wer mehr Runden gewonnen hat; bei Gleichstand entscheidet ein sichtbarer **Münzwurf** (zufällig, mit festem Zufall testbar). Bei Alle gegen alle gilt das Match als **für beide verloren** (kein Punkt).
- **Wiederverbinden-Frist im Turnier:** Sie läuft pro Person ab dem Moment, in dem deren Match aufgerufen wird bzw. sie in einem laufenden Match wegbricht, nicht schon zwischen den Matches. Die Pause und das nächste Match warten nie auf eine abwesende Person: Ist sie beim Aufruf nicht verbunden, läuft die 30-Sekunden-Frist, danach Forfait. Ausgeschiedene und Zuschauer haben keine Frist.
- **Host-Wechsel:** Verlässt der Host den Raum oder verliert per Forfait/Frist, geht die Host-Rolle an den nächsten verbundenen **Turnierteilnehmer** in der Reihenfolge des Beitritts. Zuschauer werden nie Host (ihre Ansicht ist für alle identisch und enthält keine Personenrolle). Sind keine verbundenen Teilnehmer mehr da, ist das Turnier zu Ende und der Raum räumt sich über den bestehenden Abbruch-Mechanismus ab. Damit hängen „Weiter“, „Nochmal“ und „Zurück“ nie an einer abwesenden Person. (Planungsentscheidung beim Schreiben des Stufe-2-Plans; ersetzt „dann Zuschauer“.)
- **Alle gegen alle, Gleichstand:** Der direkte Vergleich wird nur unter den gleichstehenden Spielern als Mini-Tabelle gerechnet; teilweise aufgelöste Gruppen werden aufgeteilt, bevor ein Stichmatch greift. Ein **Stichmatch gibt es nur um Platz 1**; Gleichstände auf den Plätzen dahinter bleiben als geteilter Platz stehen. Die Siegerehrung zeigt das Treppchen bis Platz 3 (bei geteilten Plätzen entsprechend).
- **„Nochmal“:** Der Raum geht zurück in die Lobby. Alle aktuell verbundenen Personen (frühere Zuschauer eingeschlossen) können mitspielen, die ersten 8 nach Beitrittsreihenfolge werden Spielende, weitere bleiben Zuschauer. Die Spielerzahl ist erst mit dem Start des neuen Turniers festgelegt, nicht mehr davor.

## Was der Baumeister entscheiden darf

- Aufbau der Teilnehmerkennung und ihrer Kanäle, Form der Zuschauer-Ansicht, Migration der Typen (z. B. `SeatId` ablösen oder erweitern) und wie die Tests angepasst werden.
- Konkrete Darstellung von Baum und Tabelle, Länge der Auslosungsanimation, genaue Pausenlänge (Richtwert 6 s), Texte.
- Wie die Setzung zufällig erzeugt wird (muss in Tests mit festem Zufall reproduzierbar sein).
- Ob Stufe 1 hinter einem festen Obergrenzen-Wert (Spieler plus Zuschauer pro Raum) abgesichert wird. Richtwert: 8 Spieler, Zuschauer zusätzlich bis zu einer sinnvollen Obergrenze.

## Offen / nicht entschieden

- Obergrenze für Zuschauer pro Raum (Richtwert siehe oben).
- Ob die Turnier-Einstellung „Best of“ später für das Finale getrennt einstellbar sein soll (jetzt: Best of 3 für alle Matches).
