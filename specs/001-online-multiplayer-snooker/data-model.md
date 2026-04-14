# Data Model: Online Multiplayer Snooker via TogetherJS

**Phase**: 1 | **Date**: 2026-04-13 | **Plan**: [plan.md](plan.md)

---

## Overview

The online multiplayer feature adds a thin session and messaging layer on top of the
existing in-memory game state. All game state already lives in `Index.htm`'s inline script
as plain JavaScript objects. No new persistent storage is introduced.

The entities below are split into two groups:
- **Existing entities** (already in `Index.htm`) — properties documented for clarity, not
  to be restructured.
- **New entities** (introduced by `OnlineSession.js`) — the session layer.

---

## Existing Entities (read-only reference)

### Ball

Lives in `balls[]` array (22 entries).

| Field | Type | Description |
|-------|------|-------------|
| `Id` | `number` (0–21) | Unique identifier. 0–14 = reds (Points=1), 15–20 = colours (Points=2–7), 21 = cue ball (Points=0) |
| `position` | `Vector2D` | Current x/y position on the canvas (pixels) |
| `velocity` | `Vector2D` | Current x/y velocity vector |
| `size` | `number` | Radius in pixels (10 for all play balls) |
| `color` | `string` | CSS hex colour string |
| `bounce` | `number` | Restitution coefficient (0.5) |
| `Points` | `number` | Snooker point value of this ball |
| `pocketIndex` | `number \| null` | Index of the pocket this ball fell into, or `null` if still on table |
| `isFixed` | `boolean` | `true` for cushion corner balls |
| `initPosition` | `Vector2D` | Starting position (for respotting) |

**State transitions**:
- `pocketIndex === null` → ball on table (rendered and in physics)
- `pocketIndex !== null` → ball potted (not rendered, not in physics)

### Team

Lives in `teams[]` (2 entries, 0-indexed).

| Field | Type | Description |
|-------|------|-------------|
| `Points` | `number` | Cumulative score for this team |
| `BallOn` | `Ball` reference | The ball type this team must pot next (red or nominated colour) |
| `FoulList` | `number[]` | Foul point values accumulated during current shot |
| `JustSwapped` | `boolean` | Whether the team just swapped `BallOn` this turn |

### Game Loop Globals (Index.htm)

| Variable | Type | Description |
|----------|------|-------------|
| `playingTeamID` | `1 \| 2` | Which team has the current turn (1-based) |
| `awaitingTeamID` | `1 \| 2` | The other team |
| `isReady` | `boolean` | `true` when all balls are stopped and a shot can be taken |
| `fallenBallsProcessed` | `boolean` | `false` while a shot is in progress |
| `started` | `boolean` | `true` after first shot of game |
| `cueBall` | `Ball` reference | Shortcut to `balls[21]` |
| `strength` | `number` | Current shot power (0–1) |
| `strokenBalls` | `Ball[]` | Balls that were struck during the current shot |
| `pottedBalls` | `Ball[]` | Balls potted during the current shot |

---

## New Entities (OnlineSession.js)

### OnlineSessionConfig (module-level constants)

| Constant | Type | Value | Description |
|----------|------|-------|-------------|
| `TOGETHERJS_HUB_URL` | `string` | `"https://hub.togetherjs.com"` | Hub relay URL; change here to self-host |

---

### SessionState (singleton object inside `OnlineSession`)

Tracks the current online session for this browser tab.

| Field | Type | Description |
|-------|------|-------------|
| `active` | `boolean` | Whether an online session is currently running |
| `localSlot` | `1 \| 2 \| null` | This browser's player slot (`1` = host, `2` = joiner, `null` = not yet assigned or spectator) |
| `isSpectator` | `boolean` | `true` if this browser joined a full session (both slots taken) |
| `paused` | `boolean` | `true` when a player has disconnected and the game is waiting |
| `disconnectTimer` | `ReturnType<setTimeout> \| null` | Handle for the 5-minute win-claim timer; `null` when not running |
| `peerConnected` | `boolean` | Whether the remote player is currently connected |

**State transitions**:

```
not active
    → [playOnlineBtn click] → active, localSlot=1, paused=false
    → [peer-added, slot available] → peerConnected=true
    → [peer-removed] → paused=true, disconnectTimer started
    → [peer-added again within 5 min] → paused=false, disconnectTimer cleared
    → [disconnectTimer fires] → "claim win" available
    → [TogetherJS close] → not active, reset all fields
```

---

### BallSnapshot (serialised for network messages)

A lightweight serialisable version of a `Ball` object. Only stateful fields are included;
immutable fields (`color`, `size`, `bounce`, `Points`, `isFixed`, `Id`) are rehydrated
on the receiver from the existing `balls[]` array using `Id` as the key.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Matches `Ball.Id` — used to identify which ball to update |
| `x` | `number` | `position.x` |
| `y` | `number` | `position.y` |
| `vx` | `number` | `velocity.x` |
| `vy` | `number` | `velocity.y` |
| `pocketIndex` | `number \| null` | Potted status |

---

### TeamSnapshot (serialised for network messages)

| Field | Type | Description |
|-------|------|-------------|
| `points` | `number` | `Team.Points` |
| `ballOnId` | `number` | `Team.BallOn.Id` — receiver resolves to the actual `Ball` reference |
| `justSwapped` | `boolean` | `Team.JustSwapped` |
| `foulList` | `number[]` | `Team.FoulList` |

---

### GameStateSnapshot (payload of `state_sync` and `rejoin_state` messages)

Full serialisable snapshot of the table. Produced by `OnlineSession.captureState()`,
applied by `OnlineSession.applyState(snapshot)`.

| Field | Type | Description |
|-------|------|-------------|
| `balls` | `BallSnapshot[]` | All 22 ball states |
| `teams` | `TeamSnapshot[2]` | Both team states (index 0 = team 1, index 1 = team 2) |
| `playingTeamID` | `1 \| 2` | Whose turn it is on the receiving end |
| `isReady` | `boolean` | Whether a shot can be taken immediately |
| `started` | `boolean` | Whether the game has begun |

---

## Validation Rules

| Rule | Applies To | Constraint |
|------|-----------|-----------|
| Slot assignment | `SessionState.localSlot` | Must be `1` or `2` exactly; `null` only before connection or when spectator |
| Ball ID in snapshot | `BallSnapshot.id` | Must be in range 0–21; receiver looks up by `Id` — silently ignore unknown IDs |
| Team index in snapshot | `GameStateSnapshot.teams` | Exactly 2 entries; index 0 → `teams[0]` (team 1), index 1 → `teams[1]` (team 2) |
| `ballOnId` | `TeamSnapshot.ballOnId` | Must resolve to an existing `ball.Id` in `balls[]`; receiver falls back to `balls[0]` if not found |
| Hub URL | `TOGETHERJS_HUB_URL` | Must be a valid absolute HTTPS URL |

---

## State Transition: Application of `state_sync` on Receiver

```
1. For each BallSnapshot in snapshot.balls:
     ball = balls.find(b => b.Id === snap.id)
     ball.position.x = snap.x
     ball.position.y = snap.y
     ball.velocity    = new Vector2D(snap.vx, snap.vy)
     ball.pocketIndex = snap.pocketIndex

2. For each TeamSnapshot (i = 0, 1):
     teams[i].Points      = snap.points
     teams[i].BallOn      = balls.find(b => b.Id === snap.ballOnId) ?? balls[0]
     teams[i].JustSwapped = snap.justSwapped
     teams[i].FoulList    = snap.foulList

3. playingTeamID = snapshot.playingTeamID
   awaitingTeamID = (playingTeamID === 1) ? 2 : 1
   isReady        = snapshot.isReady
   started        = snapshot.started

4. Update scoreboard DOM:
     #player1Score.textContent = teams[0].Points
     #player2Score.textContent = teams[1].Points

5. Update turn labels via OnlineSession.updateTurnLabels()
```
