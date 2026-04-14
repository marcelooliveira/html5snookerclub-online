# Implementation Plan: Online Multiplayer Snooker via TogetherJS

**Branch**: `feat/online-multiplayer` | **Date**: 2026-04-13 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/001-online-multiplayer-snooker/spec.md`

---

## Summary

Add real-time online two-player support to the existing HTML5 snooker game using Mozilla's
TogetherJS as the WebSocket relay layer. The shooting player's browser remains the authoritative
physics host; it broadcasts the resolved ball-position snapshot to the opponent when all balls
stop. A new `OnlineSession.js` module handles session creation, TogetherJS initialisation,
message routing, turn enforcement, and disconnection recovery. All existing game logic
(`Index.htm` inline script) is left unchanged except for three injection points: shot gating
(block the click handler when it is not this client's turn), post-shot broadcast (send
resolved state after `processFallenBalls()`), and UI turn labels ("Your turn" /
"Waiting for opponent…").

---

## Technical Context

**Language/Version**: Vanilla JavaScript (ES6 acceptable — `crypto.randomUUID()`, `const/let`,
arrow functions verified across Chrome, Firefox, Edge, Safari current stable)  
**Primary Dependencies**: jQuery 1.5.1 (existing, pinned) · TogetherJS (CDN, external —
**see Constitution Check**)  
**Storage**: In-memory only (browser runtime); no `localStorage`, no server-side persistence  
**Testing**: Manual browser testing in Chrome and Firefox (two tabs / two machines)  
**Target Platform**: Modern desktop browsers — Chrome, Firefox, Edge, Safari (current stable)  
**Project Type**: Browser game — single HTML file + static JS files, no build step  
**Performance Goals**: Shot state broadcast delivered and applied on opponent screen within
2 seconds under normal network conditions; join-ready within 30 seconds of opening link  
**Constraints**: No build step; all files served as-is; hub URL is a single named constant
`TOGETHERJS_HUB_URL` in `OnlineSession.js`; no server-side code  
**Scale/Scope**: Exactly 2 active players per session; casual online play

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Canvas-First Rendering | ✅ PASS | All rendering stays in Canvas 2D API. TogetherJS adds no rendering. |
| **II. No Additional External Dependencies** | ❌ **VIOLATION** | TogetherJS is an external CDN script. See justification below. |
| III. Clean Code | ✅ PASS | New module scoped to a single responsibility. Descriptive camelCase names used throughout. |
| IV. Modern Browser Compatibility | ✅ PASS | TogetherJS supports all four target browsers. Feature-detect `crypto.randomUUID` with a fallback. |
| V. Simplicity (YAGNI) | ✅ PASS | TogetherJS is chosen specifically to eliminate the need for a custom WebSocket relay server, minimising complexity. |

### Principle II Violation — Justification

**Violation**: TogetherJS is an external CDN library not in the current approved dependency set.

**Why the violation is necessary**:
Real-time online multiplayer between two separate browsers is fundamentally impossible using
only jQuery 1.5.1 and vanilla JS without a persistent network transport. The alternatives are:

1. **Build a custom WebSocket relay server** — introduces server infrastructure, a build
   pipeline, and ongoing ops cost, all of which violate the project's no-server constraint
   more severely than adding a single approved external library does.
2. **Use native browser WebRTC** — still requires a signalling server (comparable complexity
   to option 1 and more code than TogetherJS).
3. **Use native WebSocket API** — same requirement: a relay server must exist somewhere.

TogetherJS provides both the CDN-loaded client library and a hosted relay hub
(`hub.togetherjs.com`), eliminating any server requirement. This directly satisfies
Principle V (YAGNI — solve only the concrete problem with minimum complexity).

**Simpler alternative rejected**: There is no simpler path to real-time online multiplayer
that is compatible with the existing no-server, no-build-step constraints.

**Amendment required**:
> Constitution Principle II must be amended (MINOR version bump) to add:
> *"TogetherJS (loaded from its official CDN) is an approved exception for the online
> multiplayer feature. The hub URL MUST be isolated in a single named constant
> (`TOGETHERJS_HUB_URL`) to allow replacement without code changes."*

---

## Project Structure

### Documentation (this feature)

```text
specs/001-online-multiplayer-snooker/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── messages.md      # Phase 1 output — TogetherJS message schemas
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
Html5SnookerClub_files/
├── OnlineSession.js     # NEW — session lifecycle, TogetherJS wiring, message routing
├── CanvasPrototype.js   # existing — unchanged
├── Queue.js             # existing — unchanged
├── Vector2D.js          # existing — unchanged
├── Site.css             # existing — turn label styles added
└── css                  # existing — unchanged

Index.htm                # existing — three injection points:
                         #   1. <script> tag for TogetherJS CDN + OnlineSession.js
                         #   2. Shot gate in topCanvas click handler
                         #   3. Broadcast call at end of processFallenBalls()
                         #   4. "Play Online" button + session link UI
                         #   5. Turn label spans (#player1TurnLabel, #player2TurnLabel)
```

**Structure Decision**: Single-project layout. No new subdirectories under source root needed;
`OnlineSession.js` mirrors the existing flat `Html5SnookerClub_files/` pattern and follows
the constitution's file-scoping rule (one clear responsibility per file).

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Principle II: TogetherJS CDN dependency | Real-time online multiplayer requires a persistent cross-browser transport that cannot be built from vanilla JS alone | All pure-JS alternatives (native WebSocket, WebRTC) still require a relay/signalling server, violating the no-server constraint more severely |
