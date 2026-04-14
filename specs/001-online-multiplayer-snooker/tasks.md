# Tasks: Online Multiplayer Snooker via TogetherJS

**Input**: Design documents from `specs/001-online-multiplayer-snooker/`  
**Date**: 2026-04-13  
**Branch**: `feat/online-multiplayer`

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files or independent scope — no dependency on an
  incomplete peer task in this phase)
- **[US1–US5]**: User story this task belongs to (maps to spec.md priorities)
- All paths are relative to the repository root

---

## Phase 1: Setup

**Purpose**: Add TogetherJS CDN reference, scaffold `OnlineSession.js`, and extend the DOM
and CSS with the new online-mode elements. No game logic changes yet.

- [x] T001 Add TogetherJS CDN `<script src="https://togetherjs.com/togetherjs-min.js">` tag to `Index.htm` — place it immediately after the existing `Queue.js` `<script>` tag and before a new `OnlineSession.js` tag; also add `<script type="text/javascript" src="./Html5SnookerClub_files/OnlineSession.js"></script>` directly after it
- [x] T002 [P] Create `Html5SnookerClub_files/OnlineSession.js` — IIFE module that exposes a global `OnlineSession` object; declare `var TOGETHERJS_HUB_URL = 'https://hub.togetherjs.com';` as the sole hub reference; declare `SessionState` object with fields `active`, `localSlot`, `localName`, `isSpectator`, `paused`, `disconnectTimer`, `peerConnected` all at their initial falsy/null values; stub out public functions `isActive()`, `isMyTurn()`, `start()`, `onShotResolved()`, `broadcastShotFired(vx, vy, targetX, targetY, strength)` as empty stubs
- [x] T003 [P] Add `.playerTurnLabel { position: absolute; color: #aaffaa; font-family: Arial Black; font-size: 0.75em; }`, `#player1TurnLabel { left: 52px; top: 132px; }`, `#player2TurnLabel { left: 52px; top: 254px; }` rules to `Html5SnookerClub_files/Site.css`
- [x] T004 [P] Add the following elements to `Index.htm` inside `<div id="snookerRoom">`, after the existing `#player2Score` span: a `<button id="playOnlineBtn">` with text "Play Online"; a `<input id="sessionUrlBox" type="text" readonly>` (hidden by default via `display:none`); a `<span id="player1TurnLabel" class="playerTurnLabel"></span>`; a `<span id="player2TurnLabel" class="playerTurnLabel"></span>`; a `<div id="disconnectOverlay">` (hidden by default via `display:none`) that will hold the disconnection message and claim-win button

---

## Phase 2: Foundational

**Purpose**: Implement the serialisation/deserialisation core that all user stories depend on.
No messages sent or received yet.

⚠️ No user story work can begin until this phase is complete.

- [x] T005 Implement `OnlineSession.captureState()` in `Html5SnookerClub_files/OnlineSession.js` — reads the globals `balls`, `teams`, `playingTeamID`, `isReady`, `started` from `Index.htm`'s inline script scope; returns a `GameStateSnapshot` object with `balls` array of `{id, x, y, vx, vy, pocketIndex}` for all 22 balls, `teams` array of `{points, ballOnId, justSwapped, foulList}` for both teams, `playingTeamID`, `isReady`, `started` per `data-model.md`
- [x] T006 Implement `OnlineSession.applyState(snapshot)` in `Html5SnookerClub_files/OnlineSession.js` — for each ball snapshot find the matching entry in global `balls[]` by `id`, set `position.x`, `position.y`, `velocity` (`new Vector2D(vx, vy)`), and `pocketIndex`; for each team snapshot update `teams[i].Points`, `teams[i].BallOn` (resolve by `ballOnId` against `balls[]`, fallback to `balls[0]`), `teams[i].JustSwapped`, `teams[i].FoulList`; write `playingTeamID`, `awaitingTeamID = playingTeamID === 1 ? 2 : 1`, `isReady`, `started` globals; update `document.getElementById('player1Score').textContent` and `document.getElementById('player2Score').textContent`; call `renderBallOn()`
- [x] T007 [P] Implement `OnlineSession.updateTurnLabels()` in `Html5SnookerClub_files/OnlineSession.js` — sets `#player1TurnLabel` text to `"Your turn"` when `SessionState.localSlot === 1 && playingTeamID === 1`, else `"Waiting for opponent…"`; sets `#player2TurnLabel` text to `"Your turn"` when `SessionState.localSlot === 2 && playingTeamID === 2`, else `"Waiting for opponent…"`; also sets `document.getElementById('player1Image').style.opacity` to `1.0` for the active team and `0.25` for the inactive team to match the existing local-play behaviour
- [x] T008 [P] Implement `OnlineSession.isActive()` returning `SessionState.active` and `OnlineSession.isMyTurn()` returning `SessionState.active && !SessionState.paused && !SessionState.isSpectator && SessionState.localSlot === playingTeamID` in `Html5SnookerClub_files/OnlineSession.js`; the `paused` guard ensures no shot fires during a disconnection window

**Checkpoint**: Foundation ready — serialisation round-trips can be unit-tested by calling
`captureState()` then `applyState()` and verifying game globals are unchanged.

---

## Phase 3: User Story 1 — Create and Share a Game Session (Priority: P1) 🎯 MVP Start

**Goal**: Two browsers connect via a shared URL; both see each other's names and connection
status before any shot is taken.

**Independent Test**: Open `Index.htm` on a local HTTP server in Tab 1, click "Play Online",
copy the URL, open it in Tab 2 — both tabs show the other player's name and the "Play
Online" button is replaced by the session URL box.

- [x] T009 [US1] Implement `OnlineSession.start()` in `Html5SnookerClub_files/OnlineSession.js` — call `TogetherJS.config('hubBase', TOGETHERJS_HUB_URL)` then `TogetherJS(window)` to start a session; bind `TogetherJS.on('ready', fn)` where `fn` sets `SessionState.active = true`, `SessionState.localSlot = 1`, shows `#sessionUrlBox` with value `TogetherJS.shareUrl()`, hides `#playOnlineBtn`; if `crypto.randomUUID` is unavailable (guard with `typeof crypto !== 'undefined' && crypto.randomUUID`) fall through gracefully since TogetherJS generates its own token
- [x] T010 [US1] Implement `player_ready` message send and receive in `Html5SnookerClub_files/OnlineSession.js` — send `TogetherJS.send({type:'togetherjs.player_ready', slot: SessionState.localSlot, name: SessionState.localName || ('Player ' + SessionState.localSlot)})` inside the `ready` handler and again inside the `peer-added` handler; register `TogetherJS.hub.on('togetherjs.player_ready', fn)` where `fn` sets `document.getElementById('player' + msg.slot + 'Name').textContent = msg.name` and stores `SessionState.peerName = msg.name`
- [x] T011 [P] [US1] Implement spectator detection in `Html5SnookerClub_files/OnlineSession.js` — in the `peer-added` handler, after assigning slot 2 to the joiner, check whether `SessionState.localSlot !== null && SessionState.peerConnected === true` (both slots taken before this new arrival); if so send `TogetherJS.send({type:'togetherjs.spectator_notice'})` to the new peer; register `TogetherJS.hub.on('togetherjs.spectator_notice', fn)` where `fn` sets `SessionState.isSpectator = true`, changes `#playOnlineBtn` text to "You are spectating", and keeps it visible
- [x] T012 [US1] Wire `#playOnlineBtn` click to `OnlineSession.start()` in `Index.htm` — add `document.getElementById('playOnlineBtn').addEventListener('click', function() { OnlineSession.start(); })` inside the existing `jQuery(document).ready` block; bind `TogetherJS.on('peer-added', fn)` in `OnlineSession.start()` where `fn` checks `SessionState.localSlot === null` (no slot yet = this is the joiner) and if so sets `SessionState.localSlot = 2`, `SessionState.active = true`, `SessionState.peerConnected = true`, hides `#playOnlineBtn`, sends `player_ready`

**Checkpoint**: US1 complete — two players connect, see each other's names, and connection
status shows correctly. No shot mechanics yet.

---

## Phase 4: User Story 2 — Enforced Turn-Based Shot Taking (Priority: P1) 🎯 MVP End

**Goal**: Only the active player can shoot. Both screens see the shot and the resolved
table state.

**Independent Test**: In a two-tab session, confirm that the non-active tab's click on the
canvas does nothing; after the active tab shoots, both tabs show the same ball positions and
updated scores; turn indicator switches correctly.

- [x] T013 [US2] Add shot gate to `topCanvas` click handler in `Index.htm` — at the very beginning of the `$('#topCanvas').click(function(e) { ... })` handler body, before the coordinate calculation, insert: `if (typeof OnlineSession !== 'undefined' && OnlineSession.isActive() && !OnlineSession.isMyTurn()) { return; }`
- [x] T014 [US2] Add `OnlineSession.broadcastShotFired(...)` call to `topCanvas` click handler in `Index.htm` — immediately after the shot gate and after `var speed = 30 * strength;` and `var angle = Math.atan2(dX, dY);` are computed but before `cueBall.velocity = new Vector2D(...)` is assigned, insert: `if (typeof OnlineSession !== 'undefined' && OnlineSession.isActive()) { OnlineSession.broadcastShotFired(Math.sin(angle) * speed, Math.cos(angle) * speed, targetX, targetY, strength); }`
- [x] T015 [US2] Implement `OnlineSession.broadcastShotFired(vx, vy, targetX, targetY, strength)` in `Html5SnookerClub_files/OnlineSession.js` — inside the function call `TogetherJS.send({type:'togetherjs.shot_fired', vx: vx, vy: vy, targetX: targetX, targetY: targetY, strength: strength})` per the schema in `contracts/messages.md`; guard with `if (!SessionState.active) return;`
- [x] T016 [US2] Implement `shot_fired` receive handler in `Html5SnookerClub_files/OnlineSession.js` — register `TogetherJS.hub.on('togetherjs.shot_fired', function(msg) { ... })` where the handler sets the global `cueBall.velocity = new Vector2D(msg.vx, msg.vy)`, sets globals `isReady = false`, `started = true`, `fallenBallsProcessed = false`; also sets `targetX = msg.targetX` and `targetY = msg.targetY` so the aiming line starts from the correct direction; `strength` is not applied to the receiver (the shooter's physics are authoritative)
- [x] T017 [US2] Add `OnlineSession.onShotResolved()` injection call at the end of `processFallenBalls()` in `Index.htm` — locate the `function processFallenBalls() { ... }` body and append as the very last line inside it: `if (typeof OnlineSession !== 'undefined') { OnlineSession.onShotResolved(); }`
- [x] T018 [US2] Implement `OnlineSession.onShotResolved()` in `Html5SnookerClub_files/OnlineSession.js` — guard `if (!SessionState.active || SessionState.isSpectator) return;`; call `var snapshot = OnlineSession.captureState();`; call `TogetherJS.send({type:'togetherjs.state_sync', balls: snapshot.balls, teams: snapshot.teams, playingTeamID: snapshot.playingTeamID, isReady: snapshot.isReady, started: snapshot.started})` per `contracts/messages.md`
- [x] T019 [US2] Implement `state_sync` receive handler in `Html5SnookerClub_files/OnlineSession.js` — register `TogetherJS.hub.on('togetherjs.state_sync', function(msg) { OnlineSession.applyState(msg); OnlineSession.updateTurnLabels(); })`

**Checkpoint**: US2 complete — turn enforcement works; shot and final ball state sync to
both screens; scores update after every shot. MVP deliverable reached.

---

## Phase 5: User Story 3 — Real-Time Game State Synchronisation (Priority: P2)

**Goal**: Opponent's screen shows the active player's live aiming line and ball positions
are always in sync including after a foul when the cue ball is repositioned.

**Independent Test**: In a two-tab session, move the mouse over the active tab's canvas —
the other tab's aiming dashed line should follow in near-real-time. After any shot, both
tabs show identical ball positions.

- [x] T020 [P] [US3] Extend `OnlineSession.applyState(snapshot)` in `Html5SnookerClub_files/OnlineSession.js` — after writing all game globals, add a call to `animateCurrentPlayerImage()` (already defined in `Index.htm` inline script) to synchronise the player image highlight animation with the new `playingTeamID`; this ensures the blinking active-player effect is correct on the receiver's screen
- [x] T021 [US3] Implement throttled aim-direction broadcast in `Html5SnookerClub_files/OnlineSession.js` — declare `var _lastAimBroadcast = 0;` in module scope; inside a new function `OnlineSession.onMouseMove(x, y)` check `if (!OnlineSession.isMyTurn() || !isReady) return;`; check `Date.now() - _lastAimBroadcast < 50` and return early if within throttle window; otherwise send `TogetherJS.send({type:'togetherjs.aim_update', targetX: x, targetY: y})` and update `_lastAimBroadcast = Date.now()`
- [x] T022 [US3] Wire `OnlineSession.onMouseMove` to the existing `document.onmousemove` handler and `$('#topCanvas').mousemove` handler in `Index.htm` — at the end of both mousemove handler bodies, after `targetX` and `targetY` are set, add: `if (typeof OnlineSession !== 'undefined') { OnlineSession.onMouseMove(targetX, targetY); }`; in `Html5SnookerClub_files/OnlineSession.js` register `TogetherJS.hub.on('togetherjs.aim_update', function(msg) { targetX = msg.targetX; targetY = msg.targetY; })` to write the received aim coordinates directly into the `Index.htm` globals

**Checkpoint**: US3 complete — both screens show identical ball positions and scores; the
aiming line tracks the active player's mouse in near-real-time on the viewer's screen.

---

## Phase 6: User Story 4 — Player Disconnection Handling (Priority: P2)

**Goal**: When a player disconnects, the game pauses and they can rejoin within 5 minutes
to resume from the exact game state.

**Independent Test**: In a two-tab session, close Tab 2 — Tab 1 shows "Opponent
disconnected…" overlay. Re-open the original session URL in Tab 2 within 5 minutes — both
tabs resume with identical board state.

- [x] T023 [US4] Implement `peer-removed` handler in `Html5SnookerClub_files/OnlineSession.js` — register `TogetherJS.on('peer-removed', function(peer) { ... })` where the handler sets `SessionState.paused = true`, `SessionState.peerConnected = false`; sets `document.getElementById('disconnectOverlay').style.display = 'block'` with inner HTML `"<p>Opponent disconnected — waiting to reconnect…</p>"` and stores the disconnect time; does NOT send any message (pure local UI update)
- [x] T024 [US4] Implement 5-minute disconnect timer in `Html5SnookerClub_files/OnlineSession.js` — inside the `peer-removed` handler, after showing the overlay, set `SessionState.disconnectTimer = setTimeout(function() { document.getElementById('disconnectOverlay').innerHTML += '<button id="claimWinBtn">Claim Win</button>'; document.getElementById('claimWinBtn').addEventListener('click', function() { TogetherJS.close(); document.getElementById('disconnectOverlay').style.display = 'none'; }); }, 5 * 60 * 1000)`
- [x] T025 [US4] Implement reconnect handler in `Html5SnookerClub_files/OnlineSession.js` — extend the `peer-added` handler with a branch: `if (SessionState.paused) { clearTimeout(SessionState.disconnectTimer); SessionState.disconnectTimer = null; SessionState.peerConnected = true; SessionState.paused = false; document.getElementById('disconnectOverlay').style.display = 'none'; var snapshot = OnlineSession.captureState(); TogetherJS.send({type:'togetherjs.rejoin_state', balls: snapshot.balls, teams: snapshot.teams, playingTeamID: snapshot.playingTeamID, isReady: snapshot.isReady, started: snapshot.started}); }`
- [x] T026 [US4] Implement `rejoin_state` receive handler in `Html5SnookerClub_files/OnlineSession.js` — register `TogetherJS.hub.on('togetherjs.rejoin_state', function(msg) { OnlineSession.applyState(msg); OnlineSession.updateTurnLabels(); SessionState.paused = false; document.getElementById('disconnectOverlay').style.display = 'none'; })`
- [x] T027 [P] [US4] Style `#disconnectOverlay` in `Html5SnookerClub_files/Site.css` — add `#disconnectOverlay { position: absolute; left: 0; top: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; flex-direction: column; align-items: center; justify-content: center; color: #ffffff; font-family: Arial, sans-serif; font-size: 1em; z-index: 10; }`; add `#disconnectOverlay button { margin-top: 12px; padding: 8px 20px; font-size: 1em; cursor: pointer; }`

**Checkpoint**: US4 complete — disconnection is handled gracefully; game state is fully
restored on rejoin within 5 minutes.

---

## Phase 7: User Story 5 — Player Identity and Name Display (Priority: P3)

**Goal**: Both players are identified by a display name on the scoreboard throughout the
session; defaults to "Player 1" / "Player 2" when no name is entered.

**Independent Test**: Start a session, enter a custom name when prompted — the opponent's
scoreboard shows that name. Start a second session with no name input — both players default
to "Player 1" / "Player 2" without error.

- [x] T028 [US5] Extend `OnlineSession.start()` in `Html5SnookerClub_files/OnlineSession.js` — before calling `TogetherJS(window)`, call `SessionState.localName = (window.prompt('Enter your name:', 'Player 1') || 'Player 1').trim().slice(0, 30)`; if the result is empty after trim, default to `'Player 1'`
- [x] T029 [P] [US5] Add joiner name prompt in the `peer-added` / slot-assignment branch in `Html5SnookerClub_files/OnlineSession.js` — when `SessionState.localSlot === null` (joiner path), call `SessionState.localName = (window.prompt('Enter your name:', 'Player 2') || 'Player 2').trim().slice(0, 30)` before sending `player_ready`
- [x] T030 [P] [US5] Sanitise received `player_ready.name` in the receive handler in `Html5SnookerClub_files/OnlineSession.js` — apply `.trim().slice(0, 30)` to `msg.name`; if result is empty, substitute `'Player ' + msg.slot` as the fallback; then set the name span text content

**Checkpoint**: US5 complete — players are named throughout; all five user stories
implemented and independently testable.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T031 [P] Add `try/catch` around every `TogetherJS.send(...)` call in `Html5SnookerClub_files/OnlineSession.js` — catch block logs `console.error('OnlineSession send failed:', e)` and does not re-throw; this prevents hub connectivity errors from crashing the game
- [x] T032 [P] Add `crypto.randomUUID` availability guard in `Html5SnookerClub_files/OnlineSession.js` per research.md — declare `var _uuidFallback = function() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) { var r = Math.random()*16|0; return (c=='x'?r:(r&0x3|0x8)).toString(16); }); };`; export as `OnlineSession.generateId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID.bind(crypto) : _uuidFallback`; use it wherever a locally unique ID is needed (e.g. session debug logging)
- [x] T033 Verify load order in `Index.htm` — confirm the script tags read in this order: `jquery-1.5.1.min.js` → `Vector2D.js` → `CanvasPrototype.js` → `Queue.js` → TogetherJS CDN → `OnlineSession.js`; the inline game script must come after all of these
- [x] T034 [P] Add `paused` check to shot-gate in `Index.htm` — extend the gate added in T013 to also check `SessionState.paused` via `OnlineSession.isMyTurn()` (already returns false when paused per T008) so no additional change is needed; add a brief comment above the gate: `// Online guard: blocks shot when not active, not this player's turn, or game is paused`

---

## Dependencies

```
Phase 1 (T001–T004)
  └─ Phase 2 (T005–T008) — requires OnlineSession.js skeleton (T002) and DOM elements (T004)
       ├─ Phase 3 US1 (T009–T012) — requires captureState/applyState (T005, T006), isMyTurn (T008)
       │    └─ Phase 4 US2 (T013–T019) — requires isMyTurn (T008), start() (T009), slot assignment (T012)
       │         └─ Phase 5 US3 (T020–T022) — requires applyState (T006), state_sync handler (T019)
       │         └─ Phase 6 US4 (T023–T027) — requires captureState/applyState (T005, T006), isActive (T008)
       └─ Phase 7 US5 (T028–T030) — requires player_ready infrastructure (T010)
Final Phase (T031–T034) — requires all prior phases
```

Story independence:
- **US3** can be implemented in parallel with **US4** once US2 is complete
- **US5** can be implemented in parallel with **US3** and **US4** once US1 (T010) is complete

---

## Parallel Execution Examples

### US2 phase internal parallelism
- T013 (`Index.htm` shot gate) and T015 (`broadcastShotFired` implementation) are different
  files and can be worked simultaneously
- T016 (`shot_fired` receive) and T017 (`processFallenBalls` injection) are different files
  and can be worked simultaneously

### US3 + US4 + US5 (all after US2 checkpoint)
- T020 (applyState extension), T021+T022 (aim_update), T023–T027 (disconnection), and
  T028–T030 (names) touch different scopes and can all proceed in parallel after T019

### Polish (all after US5 checkpoint)
- T031 (try/catch), T032 (UUID guard), T034 (comment) are all inside `OnlineSession.js`
  and can be batched; T033 (`Index.htm` load-order check) is independent

---

## Implementation Strategy

**MVP scope (US1 + US2)**: Complete T001–T019 to deliver a fully playable two-player online
game. Players can connect, take alternate turns, and see each other's shots in real-time.
Ship this as the initial online multiplayer release.

**Incremental delivery**:
1. T001–T008 → skeleton in place, offline play unaffected, no regressions
2. T009–T012 → players can connect and see each other (US1 demo-able)
3. T013–T019 → full playable MVP (US2 complete)
4. T020–T022 → richer in-game sync experience (US3)
5. T023–T027 → production-quality resilience (US4)
6. T028–T030 → personalisation polish (US5)
7. T031–T034 → hardening and compliance

---

## Summary

| | |
|---|---|
| **Total tasks** | 34 |
| **US1 tasks** | 4 (T009–T012) |
| **US2 tasks** | 7 (T013–T019) |
| **US3 tasks** | 3 (T020–T022) |
| **US4 tasks** | 5 (T023–T027) |
| **US5 tasks** | 3 (T028–T030) |
| **Setup + Foundation** | 8 (T001–T008) |
| **Polish** | 4 (T031–T034) |
| **Parallel opportunities** | 16 tasks marked `[P]` |
| **MVP scope** | T001–T019 (19 tasks = US1 + US2) |
