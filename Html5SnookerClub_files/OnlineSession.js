/*
 * OnlineSession.js
 *
 * Online multiplayer session module for HTML5 Snooker Club.
 * Handles TogetherJS initialisation, message routing, turn enforcement,
 * and disconnection recovery.
 *
 * Exposes a single global: window.OnlineSession
 *
 * Hub URL is the only external dependency point — change TOGETHERJS_HUB_URL
 * to switch to a self-hosted relay without any other code changes.
 */

(function (window) {
    'use strict';

    /* ------------------------------------------------------------------
     * Configuration
     * ------------------------------------------------------------------ */
    var TOGETHERJS_HUB_URL = 'https://hub.togetherjs.com';

    /* ------------------------------------------------------------------
     * UUID fallback (crypto.randomUUID not available on all targets)
     * ------------------------------------------------------------------ */
    var _uuidFallback = function () {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    };

    var generateId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID.bind(crypto)
        : _uuidFallback;

    /* ------------------------------------------------------------------
     * Session state
     * ------------------------------------------------------------------ */
    var SessionState = {
        active: false,
        localSlot: null,      // 1 = host, 2 = joiner, null = unassigned / spectator
        localName: null,
        isSpectator: false,
        paused: false,
        disconnectTimer: null,
        peerConnected: false
    };

    /* ------------------------------------------------------------------
     * Internal helpers — access Index.htm globals safely
     * ------------------------------------------------------------------ */
    function getGlobal(name) {
        return window[name];
    }

    function setGlobal(name, value) {
        window[name] = value;
    }

    /* ------------------------------------------------------------------
     * Phase 2: State capture / apply (T005, T006)
     * ------------------------------------------------------------------ */

    function captureState() {
        var balls = getGlobal('balls');
        var teams = getGlobal('teams');
        var ballSnapshots = [];
        var i;

        for (i = 0; i < balls.length; i++) {
            var b = balls[i];
            ballSnapshots.push({
                id: b.Id,
                x: b.position.x,
                y: b.position.y,
                vx: b.velocity.x,
                vy: b.velocity.y,
                pocketIndex: b.pocketIndex
            });
        }

        var teamSnapshots = [];
        for (i = 0; i < teams.length; i++) {
            var t = teams[i];
            teamSnapshots.push({
                points: t.Points,
                ballOnId: t.BallOn ? t.BallOn.Id : 0,
                justSwapped: t.JustSwapped,
                foulList: t.FoulList ? t.FoulList.slice() : [0]
            });
        }

        return {
            balls: ballSnapshots,
            teams: teamSnapshots,
            playingTeamID: getGlobal('playingTeamID'),
            isReady: getGlobal('isReady'),
            started: getGlobal('started')
        };
    }

    function applyState(snapshot) {
        var balls = getGlobal('balls');
        var teams = getGlobal('teams');
        var i, j, ball, snap;

        // Apply ball positions
        for (i = 0; i < snapshot.balls.length; i++) {
            snap = snapshot.balls[i];
            ball = null;
            for (j = 0; j < balls.length; j++) {
                if (balls[j].Id === snap.id) {
                    ball = balls[j];
                    break;
                }
            }
            if (!ball) continue; // unknown id — ignore safely

            ball.position.x = snap.x;
            ball.position.y = snap.y;
            ball.velocity = new Vector2D(snap.vx, snap.vy);
            ball.pocketIndex = snap.pocketIndex;
        }

        // Apply team state
        for (i = 0; i < snapshot.teams.length; i++) {
            var ts = snapshot.teams[i];
            teams[i].Points = ts.points;

            // Resolve BallOn reference
            var resolved = null;
            for (j = 0; j < balls.length; j++) {
                if (balls[j].Id === ts.ballOnId) {
                    resolved = balls[j];
                    break;
                }
            }
            teams[i].BallOn = resolved || balls[0];
            teams[i].JustSwapped = ts.justSwapped;
            teams[i].FoulList = ts.foulList ? ts.foulList.slice() : [0];
        }

        // Write game loop globals
        setGlobal('playingTeamID', snapshot.playingTeamID);
        setGlobal('awaitingTeamID', snapshot.playingTeamID === 1 ? 2 : 1);
        setGlobal('isReady', snapshot.isReady);
        setGlobal('started', snapshot.started);

        // Update scoreboard
        var p1Score = document.getElementById('player1Score');
        var p2Score = document.getElementById('player2Score');
        if (p1Score) p1Score.textContent = teams[0].Points;
        if (p2Score) p2Score.textContent = teams[1].Points;

        // Refresh ball-on canvas and player image highlight
        if (typeof window.renderBallOn === 'function') {
            window.renderBallOn();
        }
        if (typeof window.animateCurrentPlayerImage === 'function') {
            window.animateCurrentPlayerImage();
        }
    }

    /* ------------------------------------------------------------------
     * Phase 2: Turn labels (T007)
     * ------------------------------------------------------------------ */

    function updateTurnLabels() {
        if (!SessionState.active) return;

        var playingTeamID = getGlobal('playingTeamID');
        var label1 = document.getElementById('player1TurnLabel');
        var label2 = document.getElementById('player2TurnLabel');
        var img1 = document.getElementById('player1Image');
        var img2 = document.getElementById('player2Image');

        if (label1) {
            label1.textContent = (SessionState.localSlot === 1 && playingTeamID === 1)
                ? 'Your turn'
                : 'Waiting for opponent\u2026';
        }
        if (label2) {
            label2.textContent = (SessionState.localSlot === 2 && playingTeamID === 2)
                ? 'Your turn'
                : 'Waiting for opponent\u2026';
        }

        // Sync opacity with active team
        if (img1) img1.style.opacity = (playingTeamID === 1) ? '1.0' : '0.25';
        if (img2) img2.style.opacity = (playingTeamID === 2) ? '1.0' : '0.25';
    }

    /* ------------------------------------------------------------------
     * Phase 2: isActive / isMyTurn (T008)
     * ------------------------------------------------------------------ */

    function isActive() {
        return SessionState.active;
    }

    function isMyTurn() {
        return SessionState.active
            && !SessionState.paused
            && !SessionState.isSpectator
            && SessionState.localSlot === getGlobal('playingTeamID');
    }

    /* ------------------------------------------------------------------
     * Phase 3: player_ready helpers
     * ------------------------------------------------------------------ */

    function _sendPlayerReady() {
        var slot = SessionState.localSlot;
        var name = SessionState.localName || ('Player ' + slot);
        try {
            TogetherJS.send({
                type: 'togetherjs.player_ready',
                slot: slot,
                name: name
            });
        } catch (e) {
            console.error('OnlineSession send failed:', e);
        }
    }

    /* ------------------------------------------------------------------
     * Phase 3: start() (T009, T010, T011, T012)
     * ------------------------------------------------------------------ */

    function start() {
        // Prompt for name — host path
        var rawName = window.prompt('Enter your name:', 'Player 1') || 'Player 1';
        SessionState.localName = rawName.trim().slice(0, 30) || 'Player 1';

        // Configure hub before TogetherJS loads
        if (typeof TogetherJS !== 'undefined' && TogetherJS.config) {
            TogetherJS.config('hubBase', TOGETHERJS_HUB_URL);
        }

        TogetherJS(window);

        // Session ready (this browser is host = slot 1)
        TogetherJS.on('ready', function () {
            SessionState.active = true;
            SessionState.localSlot = 1;

            var urlBox = document.getElementById('sessionUrlBox');
            var btn = document.getElementById('playOnlineBtn');
            if (urlBox) {
                urlBox.value = TogetherJS.shareUrl();
                urlBox.style.display = 'block';
                urlBox.select();
            }
            if (btn) btn.style.display = 'none';

            _sendPlayerReady();
            updateTurnLabels();
        });

        // Remote peer joined
        TogetherJS.on('peer-added', function (peer) {
            // If we are watching and a third person joins — spectator path
            if (SessionState.peerConnected && !SessionState.paused) {
                // Both slots already taken — new arrival is a spectator
                try {
                    TogetherJS.send({ type: 'togetherjs.spectator_notice' });
                } catch (e) {
                    console.error('OnlineSession send failed:', e);
                }
                return;
            }

            // Reconnection after disconnection
            if (SessionState.paused) {
                clearTimeout(SessionState.disconnectTimer);
                SessionState.disconnectTimer = null;
                SessionState.peerConnected = true;
                SessionState.paused = false;

                var overlay = document.getElementById('disconnectOverlay');
                if (overlay) overlay.style.display = 'none';

                // Re-broadcast full game state to the rejoining player
                var snapshot = captureState();
                try {
                    TogetherJS.send({
                        type: 'togetherjs.rejoin_state',
                        balls: snapshot.balls,
                        teams: snapshot.teams,
                        playingTeamID: snapshot.playingTeamID,
                        isReady: snapshot.isReady,
                        started: snapshot.started
                    });
                } catch (e) {
                    console.error('OnlineSession send failed:', e);
                }
                return;
            }

            // First peer addition — joiner gets slot 2
            if (SessionState.localSlot === null) {
                // This browser is the joiner
                var rawJoinName = window.prompt('Enter your name:', 'Player 2') || 'Player 2';
                SessionState.localName = rawJoinName.trim().slice(0, 30) || 'Player 2';
                SessionState.localSlot = 2;
                SessionState.active = true;
                SessionState.peerConnected = true;

                var joinBtn = document.getElementById('playOnlineBtn');
                if (joinBtn) joinBtn.style.display = 'none';

                _sendPlayerReady();
                updateTurnLabels();
            } else {
                // Host receives peer-added
                SessionState.peerConnected = true;
                _sendPlayerReady();
                updateTurnLabels();
            }
        });

        // Remote peer disconnected
        TogetherJS.on('peer-removed', function () {
            if (!SessionState.active) return;

            SessionState.paused = true;
            SessionState.peerConnected = false;

            var overlay = document.getElementById('disconnectOverlay');
            if (overlay) {
                overlay.innerHTML = '<p>Opponent disconnected \u2014 waiting to reconnect\u2026</p>';
                overlay.style.display = 'flex';
            }

            // 5-minute win-claim timer
            SessionState.disconnectTimer = setTimeout(function () {
                var overlay2 = document.getElementById('disconnectOverlay');
                if (overlay2) {
                    overlay2.innerHTML += '<button id="claimWinBtn">Claim Win</button>';
                    var claimBtn = document.getElementById('claimWinBtn');
                    if (claimBtn) {
                        claimBtn.addEventListener('click', function () {
                            TogetherJS.close();
                            var o = document.getElementById('disconnectOverlay');
                            if (o) o.style.display = 'none';
                            _resetSessionState();
                        });
                    }
                }
            }, 5 * 60 * 1000);
        });

        // Session closed locally
        TogetherJS.on('close', function () {
            _resetSessionState();
            var urlBox = document.getElementById('sessionUrlBox');
            var btn = document.getElementById('playOnlineBtn');
            var lbl1 = document.getElementById('player1TurnLabel');
            var lbl2 = document.getElementById('player2TurnLabel');
            if (urlBox) urlBox.style.display = 'none';
            if (btn) { btn.textContent = 'Play Online'; btn.style.display = 'block'; }
            if (lbl1) lbl1.textContent = '';
            if (lbl2) lbl2.textContent = '';
        });

        // Incoming messages
        TogetherJS.hub.on('togetherjs.player_ready', function (msg) {
            var name = (msg.name || '').trim().slice(0, 30) || ('Player ' + msg.slot);
            var nameEl = document.getElementById('player' + msg.slot + 'Name');
            if (nameEl) nameEl.textContent = name;
            SessionState.peerName = name;
        });

        TogetherJS.hub.on('togetherjs.spectator_notice', function () {
            SessionState.isSpectator = true;
            var btn = document.getElementById('playOnlineBtn');
            if (btn) {
                btn.textContent = 'You are spectating';
                btn.style.display = 'block';
            }
        });

        TogetherJS.hub.on('togetherjs.shot_fired', function (msg) {
            // Opponent fired — animate cue ball from the broadcast velocity
            var cueBall = getGlobal('cueBall');
            if (!cueBall) return;
            cueBall.velocity = new Vector2D(msg.vx, msg.vy);
            setGlobal('targetX', msg.targetX);
            setGlobal('targetY', msg.targetY);
            setGlobal('isReady', false);
            setGlobal('started', true);
            setGlobal('fallenBallsProcessed', false);
        });

        TogetherJS.hub.on('togetherjs.state_sync', function (msg) {
            applyState(msg);
            updateTurnLabels();
        });

        TogetherJS.hub.on('togetherjs.rejoin_state', function (msg) {
            applyState(msg);
            updateTurnLabels();
            SessionState.paused = false;
            var overlay = document.getElementById('disconnectOverlay');
            if (overlay) overlay.style.display = 'none';
        });

        TogetherJS.hub.on('togetherjs.aim_update', function (msg) {
            // Receiver: update aiming globals so the draw loop shows the live aim line
            setGlobal('targetX', msg.targetX);
            setGlobal('targetY', msg.targetY);
        });
    }

    /* ------------------------------------------------------------------
     * Phase 4: broadcastShotFired (T015)
     * ------------------------------------------------------------------ */

    function broadcastShotFired(vx, vy, targetX, targetY, strength) {
        if (!SessionState.active) return;
        try {
            TogetherJS.send({
                type: 'togetherjs.shot_fired',
                vx: vx,
                vy: vy,
                targetX: targetX,
                targetY: targetY,
                strength: strength
            });
        } catch (e) {
            console.error('OnlineSession send failed:', e);
        }
    }

    /* ------------------------------------------------------------------
     * Phase 4: onShotResolved (T018)
     * ------------------------------------------------------------------ */

    function onShotResolved() {
        if (!SessionState.active || SessionState.isSpectator) return;
        var snapshot = captureState();
        try {
            TogetherJS.send({
                type: 'togetherjs.state_sync',
                balls: snapshot.balls,
                teams: snapshot.teams,
                playingTeamID: snapshot.playingTeamID,
                isReady: snapshot.isReady,
                started: snapshot.started
            });
        } catch (e) {
            console.error('OnlineSession send failed:', e);
        }
        updateTurnLabels();
    }

    /* ------------------------------------------------------------------
     * Phase 5: aim broadcast (T021)
     * ------------------------------------------------------------------ */

    var _lastAimBroadcast = 0;

    function onMouseMove(x, y) {
        if (!isMyTurn() || !getGlobal('isReady')) return;
        var now = Date.now();
        if (now - _lastAimBroadcast < 50) return;
        _lastAimBroadcast = now;
        try {
            TogetherJS.send({ type: 'togetherjs.aim_update', targetX: x, targetY: y });
        } catch (e) {
            console.error('OnlineSession send failed:', e);
        }
    }

    /* ------------------------------------------------------------------
     * Internal: reset session state on close
     * ------------------------------------------------------------------ */

    function _resetSessionState() {
        clearTimeout(SessionState.disconnectTimer);
        SessionState.active = false;
        SessionState.localSlot = null;
        SessionState.localName = null;
        SessionState.isSpectator = false;
        SessionState.paused = false;
        SessionState.disconnectTimer = null;
        SessionState.peerConnected = false;
    }

    /* ------------------------------------------------------------------
     * Public API
     * ------------------------------------------------------------------ */

    window.OnlineSession = {
        isActive: isActive,
        isMyTurn: isMyTurn,
        start: start,
        onShotResolved: onShotResolved,
        broadcastShotFired: broadcastShotFired,
        onMouseMove: onMouseMove,
        captureState: captureState,
        applyState: applyState,
        updateTurnLabels: updateTurnLabels,
        generateId: generateId
    };

}(window));
