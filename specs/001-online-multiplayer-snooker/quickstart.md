# Quickstart: Online Multiplayer Snooker

**Date**: 2026-04-13 | **Plan**: [plan.md](plan.md)

---

## For Players

### Starting an Online Game (Player 1 — Host)

1. Open `Index.htm` in a modern browser (Chrome, Firefox, Edge, or Safari).
2. Click the **"Play Online"** button in the top-left panel.
3. Wait a moment while the session connects to the hub. The button will be replaced by a
   **session link** in a text box.
4. Copy the link (the text box is pre-selected — use Ctrl+C / Cmd+C) and send it to your
   opponent via any channel (chat, email, etc.).
5. Wait for your opponent to join. When they connect, both panels light up with your names
   and the game begins. **You (Player 1) take the first shot.**

### Joining a Game (Player 2)

1. Open the session link your opponent sent you in a modern browser.
2. The game loads and you are automatically connected. No button click is required —
   TogetherJS detects the session from the URL.
3. You are assigned **Player 2**. Wait for Player 1 to take the first shot. Your score
   panel shows "Waiting for opponent…" until it is your turn.

### During Play

- **Your turn**: Your score panel is at full brightness and shows **"Your turn"**. Click
  anywhere on the table to aim and shoot.
- **Opponent's turn**: Your score panel is dimmed and shows **"Waiting for opponent…"**.
  Clicking the table has no effect.
- **Strength bar**: Adjust shot power using the strength meter before clicking (same as
  local play).

### If Your Opponent Disconnects

- A notice appears on your screen: "Opponent disconnected — waiting to reconnect…"
- The game is **paused**. No shots can be taken.
- Your opponent has **5 minutes** to rejoin by reopening the session link.
- If they rejoin, the game resumes automatically from the exact point it was paused.
- If they do not rejoin within 5 minutes, a **"Claim Win"** button appears. Click it to
  end the session and be declared the winner.

### If You Disconnect

- Reopen the **same session link** that was originally shared.
- You will be reconnected and your screen will be restored to the current game state within
  a few seconds.

### Third Player (Spectator)

- If a third person opens the session link after both players have joined, they enter
  **spectator mode**: they can watch the game in real-time but cannot take shots.
- A notice reads "You are spectating" in place of the "Play Online" button.

---

## For Developers

### Architecture Summary

```
Index.htm  ←→  OnlineSession.js  ←→  TogetherJS CDN  ←→  hub.togetherjs.com  ←→  Peer browser
```

- `OnlineSession.js` is a self-contained module. It exposes three functions that
  `Index.htm` calls at injection points:

  | Function | Called from | Purpose |
  |----------|------------|---------|
  | `OnlineSession.isActive()` | `topCanvas` click handler | Returns `true` when an online session is running |
  | `OnlineSession.isMyTurn()` | `topCanvas` click handler | Returns `false` to block shot if not this player's turn |
  | `OnlineSession.onShotResolved()` | End of `processFallenBalls()` | Captures and broadcasts `state_sync` |

- All other logic (TogetherJS init, message handling, UI updates) lives inside
  `OnlineSession.js` with no further changes to `Index.htm`'s game logic.

### Changing the Hub Server

To point the game at a self-hosted TogetherJS hub, edit the single constant at the top of
`OnlineSession.js`:

```javascript
var TOGETHERJS_HUB_URL = 'https://hub.togetherjs.com'; // ← change this
```

Then follow the [together.js hub self-hosting guide](https://github.com/mozilla/togetherjs)
to run the Node.js hub server.

### Files Changed / Added

| File | Change |
|------|--------|
| `Html5SnookerClub_files/OnlineSession.js` | **New** — entire online session module |
| `Html5SnookerClub_files/Site.css` | **Modified** — adds `.playerTurnLabel` styles |
| `Index.htm` | **Modified** — three injection points + "Play Online" button + turn label spans + two `<script>` tags |

### Running Locally for Testing

Because TogetherJS requires two real browser connections routed through the hub, local
testing requires either:

**Option A — Two browser tabs, same machine** (quick smoke test):
1. Serve `Index.htm` from a plain HTTP server (e.g., `python -m http.server 8080`).
2. Open `http://localhost:8080/Index.htm` in Tab 1. Click "Play Online". Copy the link.
3. Open the copied link in Tab 2 (same or different browser). Both should connect.

**Option B — Two machines** (full test):
1. Serve `Index.htm` from a machine accessible on your local network or the internet.
2. Share the session link across the two machines.

> **Note**: Opening `Index.htm` as a `file://` URL will not work for TogetherJS because
> the hub requires an HTTP/HTTPS origin. Use a local web server.
