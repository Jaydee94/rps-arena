# Decisions

The non-obvious choices and why they were made. Details are in the
[design spec](superpowers/specs/2026-10-22-rps-arena-design.md).

- **Bluff uses the Lizard-Spock set** (the announcement emotes are its five gestures). The announcement is
  non-binding and a fixed set of emotes, not free text, so no moderation and no length limits are needed.
- **2v2 uses the Classic set.** The data model separates mode and gesture set (`gestureSetFor`), so other
  combinations are possible later. There is no bot in 2v2.
- **Redis is the only state.** No state lives in the process, so several replicas, pod restarts and rolling
  updates work without sticky sessions. `RPS_DEV_MEMORY_STORE=1` is only a development and test tool.
- **WebSocket only**, no long-polling fallback, so no pod is tied to a session.
- **Abort rule:** three idle rounds in a row end a match without a winner, so abandoned rooms do not run forever
  and keep renewing their TTL.
- **No separate sudden death:** drawn rounds are replayed, and with an odd `bestOf` a series cannot end level.
- **Camera only for the Classic set**, experimental and switchable, with a hold time against misrecognition. The
  library is pinned to 0.10.x (telemetry in 1.x).
- **No write-back to `main`:** the chart version is set only when packaging.
- **No accounts, no leaderboard, no matchmaking** with strangers, no hot-seat mode.
