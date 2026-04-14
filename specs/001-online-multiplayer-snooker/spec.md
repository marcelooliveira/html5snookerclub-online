# Feature Specification: Online Multiplayer Snooker via TogetherJS

**Feature Branch**: `001-online-multiplayer-snooker`  
**Created**: 2026-04-13  
**Status**: Draft  
**Input**: User description: "add Mozilla's TogetherJS to adapt the current game into a turn-based snooker game with real online players"

---

## Clarifications

### Session 2026-04-13

- Q: What security model governs the session URL token? → A: Long random token (unguessable UUID-style) — private to those who receive the link
- Q: Who runs the authoritative physics simulation for each shot? → A: The shooting player's browser runs physics; final ball positions are broadcast to the opponent when all balls stop
- Q: Which TogetherJS hub server will relay messages between the two browsers? → A: Mozilla's public hub at hub.togetherjs.com (no self-hosted server required)
- Q: Where is game state stored during a disconnection so the rejoining player can resume? → A: Connected player's browser holds state in memory and re-broadcasts it when the disconnected player rejoins
- Q: How is the active player's turn surfaced visually in the UI? → A: Extend existing player panel opacity toggling with a "Your turn" / "Waiting for opponent…" text label below each score

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Share a Game Session (Priority: P1)

A player opens the snooker game in their browser and wants to invite a friend to play online. They initiate a new online session and receive a shareable link. They share that link with their opponent. Once the opponent joins, both players are connected and the game begins.

**Why this priority**: Without the ability to connect two players, none of the online multiplayer functionality is usable. This is the entry point for all other stories.

**Independent Test**: A player can generate a session link, share it, and a second player joining via that link sees both players shown as connected — even before any shots are taken.

**Acceptance Scenarios**:

1. **Given** a player is on the game page, **When** they click "Play Online", **Then** a unique session link is displayed and ready to copy.
2. **Given** a session link has been generated, **When** a second player opens that link, **Then** both players see each other's names and connection status in the game UI.
3. **Given** a second player has joined, **When** the game begins, **Then** Player 1 (the host) is assigned the first turn.

---

### User Story 2 - Enforced Turn-Based Shot Taking (Priority: P1)

During an online game, only the player whose turn it is should be able to aim and shoot. The other player must see the table state in real-time but must not be able to interact with the cue.

**Why this priority**: Turn enforcement is the core mechanic that makes the game fair and functional as an online two-player game.

**Independent Test**: While Player 1 is taking their shot, Player 2's controls are fully disabled. Once Player 1's shot resolves and the turn passes, Player 2's controls become active. This can be tested independently with two browser windows on separate sessions.

**Acceptance Scenarios**:

1. **Given** it is Player 1's turn, **When** Player 2 tries to aim or interact with the cue, **Then** Player 2's interface shows no cue control and displays a "Waiting for opponent..." indicator.
2. **Given** Player 1 has taken a valid shot, **When** the shot outcome is resolved (all balls have stopped), **Then** the turn passes to Player 2 and their controls become active.
3. **Given** it is Player 1's turn, **When** Player 1 takes a shot, **Then** the shot motion and ball physics appear on both Player 1's and Player 2's screens simultaneously.
4. **Given** a foul is committed, **When** the shot resolves, **Then** the turn passes according to standard snooker rules and both players see the updated score.

---

### User Story 3 - Real-Time Game State Synchronisation (Priority: P2)

All changes to the game state — ball positions after a shot, score updates, and whose turn it is — must be reflected on both players' screens accurately and without manual refresh.

**Why this priority**: Without synchronisation, each player would see a different game state, making the game unplayable even with turn enforcement.

**Independent Test**: After any shot, both screens should show identical ball positions and scores. Can be verified visually by comparing two open browser sessions.

**Acceptance Scenarios**:

1. **Given** a shot has been taken, **When** all balls come to rest, **Then** both players see the same ball positions on the table.
2. **Given** a ball is potted, **When** the shot resolves, **Then** both players see the same score update on the scoreboard simultaneously.
3. **Given** the cue ball is in hand (after a foul), **When** the active player repositions it, **Then** the viewing player sees the cue ball move in real-time.

---

### User Story 4 - Player Disconnection Handling (Priority: P2)

If a player's connection drops during a game, both players should receive a clear notification and the game should pause. The disconnected player should be able to rejoin the same session and resume.

**Why this priority**: Network instability is expected in online play. Without disconnection handling, any brief dropout would silently ruin the game experience.

**Independent Test**: Close one browser tab mid-game. The remaining player should see a clear disconnection notice. Re-opening the original link should allow the player to rejoin and continue.

**Acceptance Scenarios**:

1. **Given** a player is in an active online game, **When** their connection is lost, **Then** the other player sees a "Opponent disconnected — waiting to reconnect…" message and the game pauses.
2. **Given** a player disconnected during a game, **When** they reopen the session link and reconnect, **Then** the still-connected player's browser re-broadcasts the full current game state so the rejoining player's screen is restored to the exact point of disconnection.
3. **Given** a disconnected player has not returned within 5 minutes, **When** the connected player chooses to end the game, **Then** they are declared the winner and returned to the start screen.

---

### User Story 5 - Player Identity and Name Display (Priority: P3)

Each player should have a visible name in the game UI. Players should be identifiable by a name throughout the session so that the scoreboard and turn indicator are unambiguous.

**Why this priority**: Enhances the experience but is not required for the game to function. Default names ("Player 1", "Player 2") are an acceptable fallback.

**Independent Test**: Join a game session. Each player's name appears correctly next to their score and in the turn indicator throughout the match.

**Acceptance Scenarios**:

1. **Given** a player connects via TogetherJS, **When** they enter or confirm a display name, **Then** that name appears in their opponent's UI under the score panel.
2. **Given** no custom name is set, **When** the game starts, **Then** default names "Player 1" and "Player 2" are displayed without error.

---

### Edge Cases

- What happens if both players try to start the game before the second player has fully loaded?
- What happens if a player refreshes the page mid-game (treated as a disconnection)?
- What happens if a third browser opens the session link (only two active players are allowed; a third join attempt should be rejected or treated as spectator)?
- What happens if the shot synchronisation message arrives out of order or is delayed significantly?
- What happens if a player is at the cue-ball-in-hand stage and disconnects before placing it?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a player to initiate an online session and generate a unique, shareable session URL containing a cryptographically random, unguessable token (128-bit UUID or equivalent) so that only players who receive the link can access the session.
- **FR-002**: System MUST allow a second player to join an active session by opening the shared URL.
- **FR-003**: System MUST enforce that only the active player (the one whose turn it is) can aim and shoot the cue ball.
- **FR-004**: System MUST display turn state to both players using the existing player panel opacity mechanism (active player at full opacity, inactive at reduced opacity) supplemented by a text label below each score panel: "Your turn" for the active player and "Waiting for opponent…" for the inactive player.
- **FR-005**: System MUST transmit shot input (cue direction, shot power) from the active player to the remote player so the opponent can observe the shot in progress.
- **FR-006**: System MUST broadcast the authoritative final positions of all balls — as resolved by the shooting player's browser — to the opponent once all balls have come to rest, ensuring both screens converge to an identical table state.
- **FR-007**: System MUST synchronise score updates, turn changes, and fouls to both players in real-time.
- **FR-008**: System MUST display the connection status of both players (connected / disconnected) in the UI.
- **FR-009**: System MUST pause the game and notify both players when one player disconnects.
- **FR-010**: System MUST allow a disconnected player to rejoin the session within 5 minutes; upon rejoin the still-connected player's browser MUST re-broadcast the full current game state so both screens are identical.
- **FR-011**: System MUST display each player's name adjacent to their score on the scoreboard.
- **FR-012**: System MUST allow Player 1 (the session host) to take the first turn.
- **FR-013**: System MUST prevent a third party from becoming an active player in a session already occupied by two players.

### Key Entities

- **Session**: A unique online game instance shared between exactly two players. Identified by a cryptographically random, unguessable URL token (128-bit UUID or equivalent). Carries current game state.
- **Player**: A human participant in a session. Has a display name, a connection status, an assigned player slot (Player 1 / Player 2), and a score.
- **Turn**: The active period during which one player has control of the cue. Passes between players according to snooker rules.
- **Game State**: The complete snapshot of the table at any point — ball positions, scores, whose turn it is, balls remaining, current "ball on", and any fouls.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two players on separate computers can start and complete a full frame of snooker entirely online without any manual page refresh or state reset.
- **SC-002**: The authoritative ball-position snapshot broadcast by the shooting player's browser arrives and is applied on the opponent's screen within 2 seconds of all balls stopping, under normal network conditions.
- **SC-003**: A second player can go from receiving the session link to being ready to play in under 30 seconds.
- **SC-004**: The active player's turn control is disabled on the opponent's screen 100% of the time — no shot can be taken by the wrong player.
- **SC-005**: A player who disconnects and reconnects within 5 minutes sees their screen restored to the exact game state at the point of disconnection — ball positions, scores, and whose turn it is — within 3 seconds of reconnecting.
- **SC-006**: Players can identify whose turn it is at all times without ambiguity: the active player's score panel is at full opacity and shows "Your turn"; the inactive player's panel is dimmed and shows "Waiting for opponent…".

---

## Assumptions

- The game will use Mozilla's TogetherJS as the real-time synchronisation layer, relying on Mozilla's public hub at `hub.togetherjs.com` as the WebSocket relay. No custom or self-hosted server is required for this version. If the public hub becomes unavailable, the hub URL is a single configurable value that can be pointed to a self-hosted replacement without further code changes.
- Session URLs are secured by a long, cryptographically random token (128-bit UUID or equivalent); no additional PIN or password is required. Security relies on the link remaining private to the two players.
- Both players must use a modern browser with WebSocket support (Chrome, Firefox, Edge, Safari at current versions).
- The session host is always Player 1 and takes the first turn.
- Spectator support (more than two connected users watching) is out of scope for this version.
- Mobile/touch device support is out of scope for this version.
- Player authentication (login accounts, persistent player profiles) is out of scope; players are identified only within the session.
- The existing single-player/local two-player game logic (turn management, scoring, fouls, ball physics) remains unchanged; only the input source and state broadcast layer are new.
- The shooting player's browser is the authoritative physics host for each shot. The opponent's screen applies the broadcast final ball-position snapshot rather than running an independent simulation, eliminating floating-point divergence between browsers.
- A disconnection timeout of 5 minutes before the remaining player can claim a win is a reasonable default for casual play.
- Game state is not persisted to any external store. Recovery after disconnection relies on the still-connected player's browser holding the authoritative in-memory state. If both players disconnect simultaneously the session is unrecoverable and a new game must be started.
- If a third party opens the session link, they are shown a read-only view (spectator) rather than an error page, to keep the experience graceful.
