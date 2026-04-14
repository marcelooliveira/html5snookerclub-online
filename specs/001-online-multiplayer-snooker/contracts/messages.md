# Message Contracts: Online Multiplayer TogetherJS Messages

**Phase**: 1 | **Date**: 2026-04-13 | **Plan**: [../plan.md](../plan.md)

All messages are sent via `TogetherJS.send({ type: "togetherjs.<TYPE>", ...payload })` and
received via `TogetherJS.hub.on("togetherjs.<TYPE>", handler)`.

The `sameUrl` option is left at its TogetherJS default (messages only reach peers in the
same session URL). No authentication token is embedded in messages; security is provided by
the unguessable session URL (see spec Clarifications Q1).

---

## Message Types

### 1. `player_ready`

**Direction**: Each player → all peers (sent on `ready` or `peer-added`)  
**Trigger**: TogetherJS `ready` event (host) or `peer-added` event (joiner)  
**Purpose**: Announce player slot and display name so both screens can label the scoreboard.

```json
{
  "type": "togetherjs.player_ready",
  "slot": 1,
  "name": "Alice"
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `slot` | `1 \| 2` | Host sends `1`; joiner sends `2`; spectator sends `null` |
| `name` | `string` | TogetherJS display name or `"Player 1"` / `"Player 2"` fallback. Max 30 chars. |

**Receiver action**: Set `#player1Name` or `#player2Name` text content; update
`OnlineSession.peerName`.

---

### 2. `shot_fired`

**Direction**: Active player → all peers  
**Trigger**: Immediately when the active player's `topCanvas` click handler fires a shot  
**Purpose**: Allow the opponent's browser to animate the cue ball in motion while the
shooting player's physics runs. (The final positions from `state_sync` overwrite these.)

```json
{
  "type": "togetherjs.shot_fired",
  "vx": 12.3,
  "vy": -8.7,
  "targetX": 220.0,
  "targetY": 145.0,
  "strength": 0.72
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `vx` | `number` | `cueBall.velocity.x` at moment of shot |
| `vy` | `number` | `cueBall.velocity.y` at moment of shot |
| `targetX` | `number` | Click target x (canvas coordinates) |
| `targetY` | `number` | Click target y (canvas coordinates) |
| `strength` | `number` | Shot strength, `0 < strength ≤ 1` |

**Receiver action**: Apply `vx/vy` to the local `cueBall.velocity`; set `isReady = false`,
`started = true`, `fallenBallsProcessed = false`. The opponent's physics loop animates from
this starting state. Final positions will be overwritten by `state_sync`.

**Sender constraint**: Only the player whose `localSlot === playingTeamID` may send this
message. `OnlineSession.isMyTurn()` is checked before the click handler fires.

---

### 3. `state_sync`

**Direction**: Shooting player → all peers  
**Trigger**: At the end of `processFallenBalls()` in `Index.htm`, via the
`OnlineSession.onShotResolved()` injection point  
**Purpose**: Broadcast the authoritative resolved game state after every shot so all screens
converge to identical ball positions and scores.

```json
{
  "type": "togetherjs.state_sync",
  "balls": [
    { "id": 0,  "x": 132.5, "y": 80.0,  "vx": 0, "vy": 0, "pocketIndex": null },
    { "id": 21, "x": 288.0, "y": 154.5, "vx": 0, "vy": 0, "pocketIndex": null }
  ],
  "teams": [
    { "points": 7,  "ballOnId": 0, "justSwapped": false, "foulList": [0] },
    { "points": 12, "ballOnId": 3, "justSwapped": true,  "foulList": [0] }
  ],
  "playingTeamID": 2,
  "isReady": true,
  "started": true
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `balls` | `BallSnapshot[]` | All 22 balls. See `BallSnapshot` in data-model.md. |
| `teams` | `TeamSnapshot[2]` | Both teams. Index 0 = team 1. See `TeamSnapshot` in data-model.md. |
| `playingTeamID` | `1 \| 2` | Whose turn begins next |
| `isReady` | `boolean` | Should be `true` at point of broadcast |
| `started` | `boolean` | `true` after first shot |

**Receiver action**: Apply full `GameStateSnapshot` via `OnlineSession.applyState()`. See
data-model.md State Transition section.

---

### 4. `rejoin_state`

**Direction**: Still-connected player → reconnecting peer  
**Trigger**: `peer-added` event fires while `SessionState.paused === true`
(i.e., the re-added peer is a known player who disconnected)  
**Purpose**: Restore the rejoining player's screen to the exact game state held in the
connected player's memory.

```json
{
  "type": "togetherjs.rejoin_state",
  "balls": [ /* same shape as state_sync */ ],
  "teams": [ /* same shape as state_sync */ ],
  "playingTeamID": 1,
  "isReady": true,
  "started": true
}
```

Schema is identical to `state_sync`. No additional fields required.

**Receiver action**: Same as `state_sync`. Additionally: clear disconnection overlay,
set `SessionState.paused = false`, clear `SessionState.disconnectTimer`.

---

### 5. `game_pause`

**Direction**: Server-side event proxied by TogetherJS `peer-removed` (no explicit send
needed — `OnlineSession.js` reacts to the TogetherJS event directly). Documented here for
completeness.

**No explicit message sent.** The `peer-removed` TogetherJS event carries the peer's
`clientId`. `OnlineSession.js` handles pause/resume entirely through TogetherJS lifecycle
events.

---

### 6. `spectator_notice`

**Direction**: Either connected player → newly joined third peer  
**Trigger**: `peer-added` when both slots are already occupied  
**Purpose**: Inform the third-party browser that they are in spectator mode, not an active
player.

```json
{
  "type": "togetherjs.spectator_notice"
}
```

No payload fields. The receiver sets `SessionState.isSpectator = true` and displays
"You are spectating" in place of the "Play Online" button.

---

## Message Ordering and Idempotency

| Concern | Handling |
|---------|---------|
| `shot_fired` arrives after `state_sync` | `state_sync` always wins; receiver applies final positions regardless of animation state |
| `state_sync` arrives before `shot_fired` (out of order) | Receiver applies `state_sync` immediately; `shot_fired` animation is skipped |
| Duplicate `state_sync` (e.g. on reconnect) | Applying the same snapshot twice is idempotent — ball positions and scores are overwritten to the same values |
| `player_ready` arrives before TogetherJS `ready` fires | Queued in `OnlineSession.pendingMessages[]` and replayed after `ready` |
| `rejoin_state` arrives on a non-paused session | Treated as a `state_sync` (safe to apply) |

---

## Security Considerations

- All messages are relayed through `hub.togetherjs.com` over HTTPS/WSS.
- Session isolation is provided by the unguessable session URL token (UUID). A peer must
  know the URL to join the WebSocket room.
- No credentials, player account data, or server-side state are transmitted.
- A malicious client could send fake `shot_fired` messages out-of-turn. This is a client-side
  casual game; server-side authority is out of scope. Turn enforcement is UI-level only.
