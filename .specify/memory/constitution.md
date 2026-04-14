<!--
  Sync Impact Report
  Version change: unpublished → 1.0.0
  Modified principles: N/A (initial ratification)
  Added sections: Core Principles (I–V), Technology Constraints, Development Workflow, Governance
  Removed sections: N/A
  Templates requiring updates:
    - .specify/templates/plan-template.md  ✅ reviewed — generic placeholders; no updates required
    - .specify/templates/spec-template.md  ✅ reviewed — compatible with constitution; no updates required
    - .specify/templates/tasks-template.md ✅ reviewed — compatible with constitution; no updates required
  Follow-up TODOs: None — all placeholders resolved
-->

# HTML5 Snooker Club Constitution

## Core Principles

### I. Canvas-First Rendering

All game visuals MUST be rendered exclusively via the HTML5 Canvas 2D API.
External rendering engines, WebGL wrappers, SVG-based graphics libraries, and DOM-based
sprite systems are prohibited. Canvas context acquisition, draw calls, and animation loops
MUST reside in dedicated JavaScript files (`CanvasPrototype.js` or clearly named successors).
Shared mathematical/geometric utilities MUST live in `Vector2D.js` or a similarly scoped module.

**Rationale**: The Canvas API is the project's core technical foundation. Keeping rendering
in-house ensures portability, auditability, and complete freedom from third-party rendering
pipeline changes or deprecations.

### II. No Additional External Dependencies

The dependency set is frozen at: **jQuery 1.5.1** (DOM/event handling) and **vanilla JavaScript**.
No additional external libraries, CDN scripts, npm packages, or polyfill bundles may be introduced.
New features MUST be implemented using the Canvas API, the existing utility files
(`Vector2D.js`, `Queue.js`), or native browser APIs.
jQuery version upgrades require an explicit constitution amendment.

**Rationale**: Extra dependencies increase attack surface, maintenance burden, and page-load
cost. The existing stack is sufficient for a browser-based snooker game.

### III. Clean Code

Every function MUST have a single, clearly named responsibility.
Variables and functions MUST use descriptive camelCase names.
Dead code, commented-out blocks, and unused variables MUST be removed before committing.
Files MUST be logically scoped: physics utilities in `Vector2D.js`, canvas rendering in
`CanvasPrototype.js`, data structures in `Queue.js`, and UI orchestration via `Index.htm`.
Magic numbers affecting game physics or layout MUST be extracted to named constants.

**Rationale**: The codebase is read far more often than it is written. Clarity reduces
defect rate and lowers the friction of future contributions.

### IV. Modern Browser Compatibility

All code MUST run correctly in the current stable releases of Chrome, Firefox, Edge, and Safari.
Browser-specific vendor prefixes and proprietary APIs are prohibited.
Feature detection MUST be preferred over user-agent sniffing.
Audio playback (files under `Content/Sounds/`), Canvas animations, and DOM interactions
MUST degrade gracefully when a capability is absent rather than throwing unhandled errors.

**Rationale**: The project targets the open web. Cross-browser portability ensures the
widest possible audience without requiring installation or plugins.

### V. Simplicity (YAGNI)

Each change MUST solve a concrete, existing problem — speculative features and premature
abstractions are prohibited.
Game state, physics, and rendering MUST remain decoupled where natural but MUST NOT be
split across more files than necessary.
A new module is only introduced when an existing file provably exceeds a single clear
responsibility.
Any complexity added for performance or UX MUST be justified with a measurable goal
(e.g., maintain 60 fps on mid-range hardware at 1080p).

**Rationale**: A lean codebase is easier to test, debug, and extend. Complexity grows
only when the problem genuinely demands it.

## Technology Constraints

- **Language**: Vanilla JavaScript. ES6+ features MUST be verified against all four target
  browsers before use; jQuery 1.5.1 sets the minimum baseline for DOM interactions.
- **DOM Library**: jQuery 1.5.1 (pinned). Upgrading requires an explicit constitution amendment.
- **Rendering**: HTML5 Canvas 2D context exclusively (`canvas.getContext('2d')`).
- **Assets**: Static images in `Content/Images/`, audio in `Content/Sounds/`.
  No server-side asset pipeline; all resource paths MUST be relative.
- **Styling**: `Html5SnookerClub_files/Site.css` for all global styles. No CSS preprocessors,
  CSS-in-JS, or utility frameworks (e.g., Tailwind, Bootstrap) are permitted.
- **Build step**: None. All files are served as-is. Every change MUST work by opening
  `Index.htm` directly in a browser or via a plain HTTP file server with no compilation step.

## Development Workflow

- All non-trivial changes (>50 lines or touching core physics/rendering) MUST begin with a
  feature branch created via `/speckit.git.feature`.
- A feature specification (`spec.md`) and implementation plan (`plan.md`) MUST exist before
  code is written for any non-trivial change.
- Manual browser testing across at least Chrome and Firefox is REQUIRED before merging.
- Automated unit tests are encouraged for pure utility functions in `Vector2D.js` and
  `Queue.js` but are not mandated project-wide.
- Commits MUST be atomic and use the imperative mood
  (e.g., `fix: correct cue ball rebound angle when hitting cushion`).
- No build artifacts, `node_modules`, or IDE-specific folders may be committed.

## Governance

This constitution supersedes all prior informal coding conventions for the HTML5 Snooker Club
project. Amendments REQUIRE:

1. A written rationale explaining why the existing principle is insufficient or incorrect.
2. An updated `LAST_AMENDED_DATE` and an incremented `CONSTITUTION_VERSION` following
   semantic versioning (MAJOR: incompatible governance removals/redefinitions; MINOR: new
   principles or sections; PATCH: clarifications and wording fixes).
3. Propagation of any changes to all dependent templates under `.specify/templates/`.

All feature branches MUST verify compliance with Core Principles I–V before merge.
Complexity violations (unavoidable deviations from Principle V) MUST be justified in the
relevant `plan.md` Complexity Tracking table.

**Version**: 1.0.0 | **Ratified**: 2026-04-13 | **Last Amended**: 2026-04-13
