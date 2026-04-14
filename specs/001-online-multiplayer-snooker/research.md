# Research: Online Multiplayer Snooker via TogetherJS

**Phase**: 0 | **Date**: 2026-04-13 | **Plan**: [plan.md](plan.md)

---

## 1. TogetherJS API — Integration Model

**Decision**: Use TogetherJS `TogetherJS.send(msg)` / `TogetherJS.hub.on(type, handler)` for
all game message exchange. Initialise TogetherJS lazily when the user clicks "Play Online"
rather than on page load.

**Rationale**: Lazy init means offline/local play is unaffected. The public API surface
needed is small:

| API | Purpose |
|-----|---------|
| `TogetherJS(config)` startup via `data-togetherjs` attribute omitted; call `TogetherJS.reinitialize()` or let host script call `TogetherJS()` | Start session |
| `TogetherJS.send({ type, ...payload })` | Broadcast a typed message to all peers |
| `TogetherJS.hub.on("togetherjs.type", handler)` | Receive a typed message |
| `TogetherJS.on("ready", fn)` | Session started, URL ready |
| `TogetherJS.on("close", fn)` | Local user ended session |
| `TogetherJS.on("peer-added", fn)` | Remote player joined |
| `TogetherJS.on("peer-removed", fn)` | Remote player disconnected |
| `TogetherJS.config("hubBase", URL)` | Override hub URL |

**Alternatives considered**: Custom WebSocket server, PeerJS/WebRTC — both rejected (see
plan.md Constitution Check).

---

## 2. Session URL Token Generation

**Decision**: Use `crypto.randomUUID()` (Web Crypto API, available in all four target
browsers since 2021) to generate the 128-bit UUID that forms the session token.
TogetherJS's own built-in session URL mechanism (`TogetherJS.shareUrl()`) already appends
a random `#together-<token>` fragment — this is leveraged directly rather than building a
separate token system.

**Rationale**: Reusing TogetherJS's built-in share URL eliminates duplicate token-management
code and guarantees the token is coordinated with the hub. The UUID is cryptographically
random, satisfying FR-001 and the Clarification answer (Q1).

**Fallback**: If `crypto.randomUUID` is unavailable (should not occur on target browsers),
fall back to `Math.random()`-based 36-char hex string. This is a graceful degradation, not
a primary path.

**Alternatives considered**: Short human-readable code (rejected — guessable), PIN system
(rejected — friction over security for casual play).

---

## 3. Hub Server Availability

**Decision**: Use Mozilla's public hub at `https://hub.togetherjs.com`. Isolate the URL in
a single constant `TOGETHERJS_HUB_URL` in `OnlineSession.js` and set it via
`TogetherJS.config("hubBase", TOGETHERJS_HUB_URL)` before starting a session.

**Rationale**: Answered definitively in Clarification Q3. Zero server ops required. The
single-constant isolation means switching to a self-hosted hub (e.g., the open-source
`node-together` package) requires changing exactly one line in `OnlineSession.js`.

**Risk acknowledged**: `hub.togetherjs.com` is a third-party service. If it becomes
unavailable, existing sessions fail. The mitigation (configurable constant) is the
appropriate v1 response; self-hosting is a documented upgrade path.

**Alternatives considered**: Self-hosted hub (deferred), PeerJS (different dependency,
same class of external lib, less applicable API).

---

## 4. Shot Synchronisation Model

**Decision**: The shooting player's browser runs the full physics simulation. When all balls
stop (`speedSum < 0.01` in the existing `render()` loop, which calls `processFallenBalls()`),
`OnlineSession.js` broadcasts a `state_sync` message containing the serialised ball positions,
scores, and new `playingTeamID`. The opponent's browser receives this message and applies it
directly, skipping its own physics run for that turn.

**Rationale**: Answered definitively in Clarification Q2. Eliminates floating-point
divergence between different browser JS engines. The existing `processFallenBalls()` function
is already the natural post-shot lifecycle hook.

**Injection point in existing code**:
```
// End of processFallenBalls() in Index.htm inline script:
if (typeof OnlineSession !== 'undefined') {
    OnlineSession.onShotResolved();
}
```

**Intermediate cue-ball-in-motion broadcast** (for visual fidelity): The shooting player
broadcasts a `shot_fired` message immediately on shot (click handler), containing
`cueBall.velocity` and `targetX/Y`. The opponent renders the moving cue ball using its own
physics loop from that starting state. Because final positions are authoritative from the
broadcaster, any minor divergence during animation is overwritten on `state_sync`.

**Alternatives considered**: Both clients run physics independently (rejected — float
divergence), dedicated server runs physics (rejected — server required).

---

## 5. Turn Enforcement

**Decision**: `OnlineSession.js` tracks which player slot (1 or 2) belongs to the local
browser (`localSlot`). Before allowing the click handler in `Index.htm` to fire a shot,
it checks `OnlineSession.isMyTurn()`. If false, the click is swallowed silently and the
"Waiting for opponent…" label is already visible (UI-level deterrent).

**Rationale**: Client-side gating is sufficient for a casual game; there is no server to
enforce it at a protocol level. Since TogetherJS messages are broadcast to all peers, a
malicious actor could in theory send a fake `shot_fired` message — but this is casual play,
not a competitive ranked game. The spec does not require server-side authority.

**Injection point**:
```javascript
// In topCanvas click handler (Index.htm):
if (typeof OnlineSession !== 'undefined' && OnlineSession.isActive() && !OnlineSession.isMyTurn()) {
    return; // not this player's turn
}
```

---

## 6. Disconnection and Rejoin State Recovery

**Decision**: When a peer disconnects (`peer-removed` event), `OnlineSession.js` sets
`gameState.paused = true` and displays the disconnection overlay. The remaining player's
browser retains the full authoritative game state in memory. When the disconnected player
reconnects (`peer-added`), the connected player broadcasts a `rejoin_state` message
containing the complete current game state; the rejoining player applies it.

**Five-minute timeout**: `OnlineSession.js` starts a `setTimeout(5 * 60 * 1000)` on
disconnect. If it fires before reconnection, a "Claim win" button becomes available.

**Both-player simultaneous disconnect**: Session state is lost (no server persistence).
A new game must be started. This is documented in spec Assumptions.

**Rationale**: Answered definitively in Clarification Q4. Zero external storage needed.
The `peer-added` / `peer-removed` events from TogetherJS are the natural hooks.

---

## 7. Turn Indicator Visual Design

**Decision**: Two new `<span>` elements (`#player1TurnLabel`, `#player2TurnLabel`) are
added to the existing `#snookerRoom` div, positioned below `#player1Score` /
`#player2Score`. They display "Your turn" (visible to the local player when active) or
"Waiting for opponent…" (visible when not active). The existing opacity animation on
`player1Image` / `player2Image` continues to function unchanged.

**Rationale**: Answered definitively in Clarification Q5. Minimal DOM addition; integrates
with the existing CSS layout without restructuring the UI.

**CSS addition to `Site.css`**:
```css
.playerTurnLabel {
    position: absolute;
    color: #aaffaa;
    font-family: Arial Black;
    font-size: 0.75em;
}
#player1TurnLabel { left: 52px; top: 132px; }
#player2TurnLabel { left: 52px; top: 254px; }
```

---

## 8. "Play Online" Entry Point

**Decision**: A single `<button id="playOnlineBtn">Play Online</button>` is added to
`Index.htm` inside `#snookerRoom`. When clicked, it calls `OnlineSession.start()`, which
initialises TogetherJS and, on `ready`, replaces the button with a copyable session URL
display (`<input id="sessionUrl" readonly>`). A second player who opens the URL is
automatically connected via TogetherJS's fragment-based session detection; `OnlineSession.js`
fires `peer-added` and assigns them slot 2.

**Rationale**: Minimal UI addition. No routing, no login screen. Consistent with the
project's zero-build, zero-server philosophy.

---

## 9. Third-Party Join (Spectator) Handling

**Decision**: On `peer-added`, `OnlineSession.js` checks whether both player slots are
already occupied. If yes, it sends a `spectator_notice` message to the joining peer and sets
the local `isSpectator` flag to `true` on that peer's session object. The spectator receives
all `state_sync` messages (table stays updated) but `OnlineSession.isMyTurn()` always returns
`false` for spectators, and the "Play Online" button is replaced with a "You are spectating"
notice.

**Rationale**: Graceful handling as specified in spec Assumptions. FR-013 (block third active
player) is satisfied; the experience is not an error page.

---

## Resolved Unknowns Summary

| Unknown | Resolution |
|---------|-----------|
| TogetherJS integration approach | Lazy init, `hub.on` / `send` API |
| Session URL token | Reuse TogetherJS's built-in `shareUrl()` (UUID-backed) |
| Hub server | `hub.togetherjs.com` via `TOGETHERJS_HUB_URL` constant |
| Shot sync authority | Shooting player broadcasts `state_sync` on `processFallenBalls()` |
| Turn enforcement | Client-side gate via `OnlineSession.isMyTurn()` check in click handler |
| Disconnection recovery | `peer-removed` → pause + timeout; `peer-added` → `rejoin_state` broadcast |
| Turn indicator UI | New `#playerNTurnLabel` spans; existing opacity toggling unchanged |
| "Play Online" UX | Single button → session URL display on ready |
| Third-party join | Spectator mode (receive state, no turn control) |
