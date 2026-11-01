/* assets/js/stick-hero.js - Filewise Stick Hero Game */

(function () {
  "use strict";

  // --- Constants & Config ---
  var CANVAS_WIDTH = 420;
  var CANVAS_HEIGHT = 580;
  var PLATFORM_HEIGHT = 160;
  var PLATFORM_TOP_Y = CANVAS_HEIGHT - PLATFORM_HEIGHT; // 420
  var HERO_WIDTH = 24;
  var HERO_HEIGHT = 34;
  var HERO_BASE_Y = PLATFORM_TOP_Y - HERO_HEIGHT; // 386

  var STRETCH_SPEED = 280; // pixels per second
  var WALK_SPEED = 200; // pixels per second
  var TURNING_DURATION = 0.28; // seconds for 90-degree drop
  var FALL_GRAVITY = 1600; // pixels per second^2
  var TRANSITION_SPEED = 4.0; // camera slide speed

  var STORAGE_KEY_BEST = "filewise_stick_hero_best";
  var STORAGE_KEY_MUTE = "filewise_stick_hero_muted";

  // --- DOM Elements ---
  var viewportEl = document.getElementById("stick-hero-viewport");
  var canvas = document.getElementById("stick-hero-canvas");
  if (!canvas || !viewportEl) return;
  var ctx = canvas.getContext("2d");

  var hudCurrentScore = document.getElementById("hud-current-score");
  var hudBestScore = document.getElementById("hud-best-score");
  var canvasBigScore = document.getElementById("canvas-big-score");
  var startBestScore = document.getElementById("start-best-score");
  var gameoverFinalScore = document.getElementById("gameover-final-score");
  var gameoverBestScore = document.getElementById("gameover-best-score");
  var gameoverMessage = document.getElementById("gameover-message");

  var overlayStart = document.getElementById("overlay-start");
  var overlayGameOver = document.getElementById("overlay-gameover");
  var btnStart = document.getElementById("btn-game-start");
  var btnRestart = document.getElementById("btn-game-restart");
  var btnQuickRestart = document.getElementById("btn-quick-restart");
  var btnSoundToggle = document.getElementById("btn-sound-toggle");
  var iconSoundState = document.getElementById("icon-sound-state");

  // --- Audio Synthesis (Web Audio API) ---
  var audioCtx = null;
  var isMuted = false;

  try {
    isMuted = localStorage.getItem(STORAGE_KEY_MUTE) === "true";
  } catch (e) {
    isMuted = false;
  }

  function updateSoundIcon() {
    if (!iconSoundState) return;
    iconSoundState.innerHTML = isMuted
      ? '<use href="#icon-mute"></use>'
      : '<use href="#icon-sound"></use>';
  }
  updateSoundIcon();

  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playSound(type) {
    if (isMuted) return;
    try {
      initAudio();
      if (!audioCtx) return;
      var now = audioCtx.currentTime;

      if (type === "stretch") {
        var oscS = audioCtx.createOscillator();
        var gainS = audioCtx.createGain();
        oscS.type = "triangle";
        oscS.frequency.setValueAtTime(260, now);
        oscS.frequency.exponentialRampToValueAtTime(540, now + 0.12);
        gainS.gain.setValueAtTime(0.04, now);
        gainS.gain.linearRampToValueAtTime(0.01, now + 0.12);
        oscS.connect(gainS);
        gainS.connect(audioCtx.destination);
        oscS.start(now);
        oscS.stop(now + 0.12);
      } else if (type === "fall_stick") {
        var oscF = audioCtx.createOscillator();
        var gainF = audioCtx.createGain();
        oscF.type = "sine";
        oscF.frequency.setValueAtTime(280, now);
        oscF.frequency.exponentialRampToValueAtTime(90, now + 0.22);
        gainF.gain.setValueAtTime(0.08, now);
        gainF.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        oscF.connect(gainF);
        gainF.connect(audioCtx.destination);
        oscF.start(now);
        oscF.stop(now + 0.22);
      } else if (type === "score") {
        var oscSc = audioCtx.createOscillator();
        var gainSc = audioCtx.createGain();
        oscSc.type = "sine";
        oscSc.frequency.setValueAtTime(523.25, now); // C5
        oscSc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        gainSc.gain.setValueAtTime(0.12, now);
        gainSc.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        oscSc.connect(gainSc);
        gainSc.connect(audioCtx.destination);
        oscSc.start(now);
        oscSc.stop(now + 0.28);
      } else if (type === "perfect") {
        [523.25, 659.25, 783.99, 1046.5].forEach(function (freq, idx) {
          var o = audioCtx.createOscillator();
          var g = audioCtx.createGain();
          o.type = "triangle";
          o.frequency.setValueAtTime(freq, now + idx * 0.06);
          g.gain.setValueAtTime(0.12, now + idx * 0.06);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.25);
          o.connect(g);
          g.connect(audioCtx.destination);
          o.start(now + idx * 0.06);
          o.stop(now + idx * 0.06 + 0.25);
        });
      } else if (type === "die") {
        var oscD = audioCtx.createOscillator();
        var gainD = audioCtx.createGain();
        oscD.type = "sawtooth";
        oscD.frequency.setValueAtTime(360, now);
        oscD.frequency.exponentialRampToValueAtTime(70, now + 0.45);
        gainD.gain.setValueAtTime(0.1, now);
        gainD.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        oscD.connect(gainD);
        gainD.connect(audioCtx.destination);
        oscD.start(now);
        oscD.stop(now + 0.45);
      }
    } catch (e) {
      // Audio fallback silent
    }
  }

  // --- High Score Persistence ---
  var bestScore = 0;
  try {
    var stored = localStorage.getItem(STORAGE_KEY_BEST);
    if (stored !== null) {
      bestScore = parseInt(stored, 10) || 0;
    }
  } catch (e) {
    bestScore = 0;
  }

  function updateBestScoreUI() {
    if (hudBestScore) hudBestScore.textContent = bestScore;
    if (startBestScore) startBestScore.textContent = bestScore;
    if (gameoverBestScore) gameoverBestScore.textContent = bestScore;
  }
  updateBestScoreUI();

  // --- Game State Variables ---
  var phase = "idle"; // idle | waiting | stretching | turning | walking | transitioning | falling | gameover
  var score = 0;
  var sceneOffset = 0;
  var targetSceneOffset = 0;

  var platforms = [];
  var currentPlatformIndex = 0;
  var stick = {
    x: 0,
    length: 0,
    angle: 0, // 0 = straight up, Math.PI / 2 = horizontal (flat), Math.PI = down
    rotationProgress: 0
  };

  var hero = {
    x: 0,
    y: HERO_BASE_Y,
    vy: 0,
    walkFrame: 0,
    isFalling: false,
    rotation: 0
  };

  var floatingTexts = [];
  var particles = [];
  var clouds = [
    { x: 40, y: 50, speed: 8, r: 24 },
    { x: 220, y: 90, speed: 12, r: 32 },
    { x: 340, y: 35, speed: 6, r: 20 }
  ];

  var lastTime = performance.now();
  var stretchAudioTimer = 0;
  var activePointerId = null;

  // --- Platform Generator ---
  function generatePlatform(startX) {
    // Distance from previous platform: 50 to 180
    var minGap = 55;
    var maxGap = 160;
    var gap = Math.floor(minGap + Math.random() * (maxGap - minGap));
    // Platform width: 40 to 85
    var minWidth = 40;
    var maxWidth = 80;
    var width = Math.floor(minWidth + Math.random() * (maxWidth - minWidth));

    var x = startX + gap;
    return {
      x: x,
      w: width,
      hasTarget: true,
      targetX: x + Math.floor(width / 2) - 5,
      targetW: 10
    };
  }

  function resetGame() {
    score = 0;
    currentPlatformIndex = 0;
    sceneOffset = 0;
    targetSceneOffset = 0;
    floatingTexts = [];
    particles = [];

    // Starting platforms
    platforms = [
      {
        x: 0,
        w: 95,
        hasTarget: false,
        targetX: 0,
        targetW: 0
      }
    ];

    var p1 = generatePlatform(95);
    platforms.push(p1);
    var p2 = generatePlatform(p1.x + p1.w);
    platforms.push(p2);
    var p3 = generatePlatform(p2.x + p2.w);
    platforms.push(p3);

    // Initial Hero position
    hero.x = platforms[0].w - HERO_WIDTH - 6;
    hero.y = HERO_BASE_Y;
    hero.vy = 0;
    hero.walkFrame = 0;
    hero.isFalling = false;
    hero.rotation = 0;

    // Initial Stick
    stick.x = platforms[0].w;
    stick.length = 0;
    stick.angle = 0;
    stick.rotationProgress = 0;

    phase = "waiting";
    updateScoreUI(0);

    if (overlayStart) overlayStart.hidden = true;
    if (overlayGameOver) overlayGameOver.hidden = true;
  }

  function updateScoreUI(newScore) {
    score = newScore;
    if (hudCurrentScore) hudCurrentScore.textContent = score;
    if (canvasBigScore) canvasBigScore.textContent = score;

    // Pop animation
    if (hudCurrentScore) {
      hudCurrentScore.classList.remove("score-pop");
      void hudCurrentScore.offsetWidth; // reflow
      hudCurrentScore.classList.add("score-pop");
    }

    if (score > bestScore) {
      bestScore = score;
      try {
        localStorage.setItem(STORAGE_KEY_BEST, bestScore.toString());
      } catch (e) {
        // quota ignore
      }
      updateBestScoreUI();
    }
  }

  function addFloatingText(text, x, y, color) {
    floatingTexts.push({
      text: text,
      x: x,
      y: y,
      vy: -55,
      alpha: 1.0,
      color: color || "#10b981",
      size: 18
    });
  }

  function spawnConfetti(x, y) {
    var colors = ["#e11d48", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#d3f47a"];
    for (var i = 0; i < 22; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 70 + Math.random() * 150;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        color: colors[Math.floor(Math.random() * colors.length)],
        radius: 3 + Math.random() * 3,
        alpha: 1.0,
        gravity: 420
      });
    }
  }

  // --- Input Handling (Pointer Events Strictly on Canvas) ---
  function onPointerDown(e) {
    if (e.button && e.button !== 0) return; // Only left click
    if (phase !== "waiting") return;

    e.preventDefault();
    initAudio();
    activePointerId = e.pointerId;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore if unsupported
    }

    phase = "stretching";
    stick.length = 0;
    stick.angle = 0;
    stick.rotationProgress = 0;
    stretchAudioTimer = 0;
  }

  function onPointerUp(e) {
    if (phase !== "stretching") return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;

    e.preventDefault();
    activePointerId = null;

    try {
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (err) {
      // Ignore
    }

    if (stick.length > 0) {
      phase = "turning";
      stick.rotationProgress = 0;
      playSound("fall_stick");
    } else {
      phase = "waiting";
    }
  }

  // Bind pointer listeners ONLY to canvas
  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp, { passive: false });
  canvas.addEventListener("pointercancel", onPointerUp, { passive: false });

  // Keyboard Spacebar Support (Only when canvas or viewport is active)
  viewportEl.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      if (phase === "waiting") {
        phase = "stretching";
        stick.length = 0;
        stick.angle = 0;
        stick.rotationProgress = 0;
        stretchAudioTimer = 0;
      }
    }
  });

  viewportEl.addEventListener("keyup", function (e) {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      if (phase === "stretching") {
        if (stick.length > 0) {
          phase = "turning";
          stick.rotationProgress = 0;
          playSound("fall_stick");
        } else {
          phase = "waiting";
        }
      }
    }
  });

  // UI Action Buttons
  if (btnStart) {
    btnStart.addEventListener("click", function (e) {
      e.stopPropagation();
      initAudio();
      resetGame();
    });
  }

  if (btnRestart) {
    btnRestart.addEventListener("click", function (e) {
      e.stopPropagation();
      initAudio();
      resetGame();
    });
  }

  if (btnQuickRestart) {
    btnQuickRestart.addEventListener("click", function (e) {
      e.stopPropagation();
      initAudio();
      resetGame();
    });
  }

  if (btnSoundToggle) {
    btnSoundToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      isMuted = !isMuted;
      try {
        localStorage.setItem(STORAGE_KEY_MUTE, isMuted ? "true" : "false");
      } catch (err) {}
      updateSoundIcon();
      if (!isMuted) {
        initAudio();
        playSound("score");
      }
    });
  }

  // --- Game Loop Update Logic ---
  function update(dt) {
    // 1. Cloud drifting
    for (var c = 0; c < clouds.length; c++) {
      clouds[c].x += clouds[c].speed * dt;
      if (clouds[c].x - clouds[c].r > CANVAS_WIDTH) {
        clouds[c].x = -clouds[c].r * 2;
        clouds[c].y = 25 + Math.random() * 85;
      }
    }

    // 2. Floating text animations
    for (var i = floatingTexts.length - 1; i >= 0; i--) {
      var ft = floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.alpha -= 0.85 * dt;
      if (ft.alpha <= 0) {
        floatingTexts.splice(i, 1);
      }
    }

    // 3. Particle animations
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += pt.gravity * dt;
      pt.alpha -= 1.1 * dt;
      if (pt.alpha <= 0) {
        particles.splice(p, 1);
      }
    }

    var currPlatform = platforms[currentPlatformIndex];
    var nextPlatform = platforms[currentPlatformIndex + 1];

    // State machine updates
    if (phase === "stretching") {
      stick.length += STRETCH_SPEED * dt;
      // Cap maximum length so it doesn't stretch to infinity
      if (stick.length > CANVAS_WIDTH * 1.5) {
        stick.length = CANVAS_WIDTH * 1.5;
      }
      stretchAudioTimer += dt;
      if (stretchAudioTimer >= 0.12) {
        stretchAudioTimer = 0;
        playSound("stretch");
      }
    } else if (phase === "turning") {
      stick.rotationProgress += dt / TURNING_DURATION;
      if (stick.rotationProgress >= 1.0) {
        stick.rotationProgress = 1.0;
        stick.angle = Math.PI / 2; // Flat 90 deg

        // Check landing
        var stickTipX = stick.x + stick.length;
        var landSuccess = stickTipX >= nextPlatform.x && stickTipX <= nextPlatform.x + nextPlatform.w;

        hero.targetWalkX = landSuccess
          ? nextPlatform.x + nextPlatform.w - HERO_WIDTH - 6
          : stickTipX + HERO_WIDTH / 2;

        hero.landSuccess = landSuccess;

        // Check perfect center
        if (landSuccess) {
          var targetMid = nextPlatform.x + nextPlatform.w / 2;
          hero.isPerfect = Math.abs(stickTipX - targetMid) <= 5.5;
        } else {
          hero.isPerfect = false;
        }

        phase = "walking";
      } else {
        // Ease in turning
        stick.angle = (Math.PI / 2) * Math.sin((stick.rotationProgress * Math.PI) / 2);
      }
    } else if (phase === "walking") {
      hero.walkFrame += dt * 14;
      hero.x += WALK_SPEED * dt;

      if (hero.x >= hero.targetWalkX) {
        hero.x = hero.targetWalkX;

        if (hero.landSuccess) {
          // Success landing!
          var addPts = hero.isPerfect ? 2 : 1;
          updateScoreUI(score + addPts);

          if (hero.isPerfect) {
            playSound("perfect");
            addFloatingText("+2 PERFECT!", hero.x - sceneOffset, hero.y - 14, "#e11d48");
            spawnConfetti(hero.x - sceneOffset + HERO_WIDTH / 2, hero.y);
          } else {
            playSound("score");
            addFloatingText("+1", hero.x - sceneOffset + 4, hero.y - 12, "#10b981");
          }

          // Camera shift transition
          currentPlatformIndex++;
          var newCurrentPlatform = platforms[currentPlatformIndex];
          targetSceneOffset = newCurrentPlatform.x - 45;
          phase = "transitioning";
        } else {
          // Stick too short or too long -> Fall!
          playSound("die");
          phase = "falling";
          hero.vy = 0;
        }
      }
    } else if (phase === "transitioning") {
      // Smooth camera interpolation
      var diff = targetSceneOffset - sceneOffset;
      sceneOffset += diff * TRANSITION_SPEED * dt;

      if (Math.abs(diff) < 1.0) {
        sceneOffset = targetSceneOffset;

        // Prepare next stick
        var activeP = platforms[currentPlatformIndex];
        stick.x = activeP.x + activeP.w;
        stick.length = 0;
        stick.angle = 0;
        stick.rotationProgress = 0;

        // Generate upcoming platform if needed
        var lastP = platforms[platforms.length - 1];
        if (lastP.x - sceneOffset < CANVAS_WIDTH + 150) {
          platforms.push(generatePlatform(lastP.x + lastP.w));
        }

        // Clean up distant behind platforms
        while (platforms.length > 4 && platforms[0].x + platforms[0].w < sceneOffset - 150) {
          platforms.shift();
          currentPlatformIndex--;
        }

        phase = "waiting";
      }
    } else if (phase === "falling") {
      hero.vy += FALL_GRAVITY * dt;
      hero.y += hero.vy * dt;
      hero.rotation += 4 * dt;

      // Rotate stick downwards as hero falls
      if (stick.angle < Math.PI) {
        stick.angle += Math.PI * 1.5 * dt;
        if (stick.angle > Math.PI) stick.angle = Math.PI;
      }

      if (hero.y > CANVAS_HEIGHT + 60) {
        // Trigger Game Over
        phase = "gameover";
        if (gameoverFinalScore) gameoverFinalScore.textContent = score;
        if (gameoverBestScore) gameoverBestScore.textContent = bestScore;

        if (gameoverMessage) {
          if (score === 0) {
            gameoverMessage.textContent = "화면을 조금 더 길게 눌러보세요!";
          } else if (score >= bestScore && score > 0) {
            gameoverMessage.textContent = "축하합니다! 새로운 최고 점수 달성!";
          } else {
            gameoverMessage.textContent = "완벽한 길이를 맞춰 다시 도전해보세요.";
          }
        }

        if (overlayGameOver) overlayGameOver.hidden = false;
      }
    }
  }

  // --- Rendering Pipeline ---
  function render() {
    ctx.save();

    // 1. Sky Background Gradient
    var bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGrad.addColorStop(0, "#d5ede2");
    bgGrad.addColorStop(0.5, "#e9f6f0");
    bgGrad.addColorStop(1, "#f7fbf9");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Distant Sun / Aura
    ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
    ctx.beginPath();
    ctx.arc(CANVAS_WIDTH - 65, 80, 48, 0, Math.PI * 2);
    ctx.fill();

    // 3. Clouds
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    for (var c = 0; c < clouds.length; c++) {
      var cl = clouds[c];
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.r, 0, Math.PI * 2);
      ctx.arc(cl.x + cl.r * 0.7, cl.y - cl.r * 0.3, cl.r * 0.75, 0, Math.PI * 2);
      ctx.arc(cl.x + cl.r * 1.4, cl.y, cl.r * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Distant Mountains (Parallax Layer)
    ctx.fillStyle = "rgba(23, 77, 67, 0.08)";
    ctx.beginPath();
    var mountainOffset = sceneOffset * 0.15;
    ctx.moveTo(0, PLATFORM_TOP_Y);
    ctx.lineTo(0, PLATFORM_TOP_Y - 90);
    ctx.lineTo(80 - (mountainOffset % 240), PLATFORM_TOP_Y - 140);
    ctx.lineTo(190 - (mountainOffset % 240), PLATFORM_TOP_Y - 80);
    ctx.lineTo(310 - (mountainOffset % 240), PLATFORM_TOP_Y - 160);
    ctx.lineTo(440 - (mountainOffset % 240), PLATFORM_TOP_Y - 70);
    ctx.lineTo(CANVAS_WIDTH + 80, PLATFORM_TOP_Y - 130);
    ctx.lineTo(CANVAS_WIDTH, PLATFORM_TOP_Y);
    ctx.closePath();
    ctx.fill();

    // 5. Platforms
    for (var p = 0; p < platforms.length; p++) {
      var plat = platforms[p];
      var screenX = plat.x - sceneOffset;

      if (screenX + plat.w < -20 || screenX > CANVAS_WIDTH + 20) continue;

      // Platform body
      ctx.fillStyle = "#172b29";
      ctx.fillRect(screenX, PLATFORM_TOP_Y, plat.w, PLATFORM_HEIGHT);

      // Platform top accent line
      ctx.fillStyle = "#264840";
      ctx.fillRect(screenX, PLATFORM_TOP_Y, plat.w, 4);

      // Red Center Bonus Zone
      if (plat.hasTarget) {
        var targetScreenX = plat.targetX - sceneOffset;
        ctx.fillStyle = "#e11d48";
        ctx.fillRect(targetScreenX, PLATFORM_TOP_Y, plat.targetW, 4);

        // Center white dot pip
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(targetScreenX + 4, PLATFORM_TOP_Y + 1, 2, 2);
      }
    }

    // 6. The Stick
    if (stick.length > 0) {
      var stickPivotX = stick.x - sceneOffset;
      var stickPivotY = PLATFORM_TOP_Y;

      ctx.save();
      ctx.translate(stickPivotX, stickPivotY);
      // stick.angle = 0 is straight up, so we rotate clockwise from -PI/2
      ctx.rotate(stick.angle - Math.PI / 2);

      // Stick rod
      ctx.strokeStyle = "#172b29";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(stick.length, 0);
      ctx.stroke();

      ctx.restore();
    }

    // 7. Hero Character
    var heroScreenX = hero.x - sceneOffset;
    var heroScreenY = hero.y;

    ctx.save();
    ctx.translate(heroScreenX + HERO_WIDTH / 2, heroScreenY + HERO_HEIGHT / 2);
    if (hero.rotation !== 0) {
      ctx.rotate(hero.rotation);
    }

    var hx = -HERO_WIDTH / 2;
    var hy = -HERO_HEIGHT / 2;

    // A. Character Body (Rounded Dark Charcoal)
    ctx.fillStyle = "#172b29";
    roundRect(ctx, hx, hy, HERO_WIDTH, HERO_HEIGHT - 6, 6);
    ctx.fill();

    // B. Eye
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(hx + HERO_WIDTH - 6, hy + 10, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#172b29";
    ctx.beginPath();
    ctx.arc(hx + HERO_WIDTH - 4.8, hy + 10, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // C. Red Ninja Headband & Wave Ribbon
    ctx.fillStyle = "#e11d48";
    ctx.fillRect(hx, hy + 6, HERO_WIDTH, 4);

    // Trailing ribbon waving behind
    var wave = Math.sin((phase === "walking" ? hero.walkFrame : performance.now() * 0.005) * 1.5) * 3;
    ctx.beginPath();
    ctx.moveTo(hx, hy + 7);
    ctx.quadraticCurveTo(hx - 7, hy + 7 + wave, hx - 14, hy + 5 + wave);
    ctx.lineTo(hx - 14, hy + 9 + wave);
    ctx.quadraticCurveTo(hx - 7, hy + 10 + wave, hx, hy + 10);
    ctx.closePath();
    ctx.fill();

    // D. Animated Walking Legs
    ctx.fillStyle = "#172b29";
    if (phase === "walking") {
      var legOffset = Math.sin(hero.walkFrame) * 4;
      // Left leg
      ctx.fillRect(hx + 3, hy + HERO_HEIGHT - 6, 4, 6 + legOffset);
      // Right leg
      ctx.fillRect(hx + HERO_WIDTH - 7, hy + HERO_HEIGHT - 6, 4, 6 - legOffset);
    } else {
      // Standing legs
      ctx.fillRect(hx + 3, hy + HERO_HEIGHT - 6, 4, 6);
      ctx.fillRect(hx + HERO_WIDTH - 7, hy + HERO_HEIGHT - 6, 4, 6);
    }

    ctx.restore();

    // 8. Particles (Confetti / Sparkles)
    for (var ptIdx = 0; ptIdx < particles.length; ptIdx++) {
      var pObj = particles[ptIdx];
      ctx.save();
      ctx.globalAlpha = Math.max(0, pObj.alpha);
      ctx.fillStyle = pObj.color;
      ctx.beginPath();
      ctx.arc(pObj.x, pObj.y, pObj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 9. Floating Score Texts
    for (var ftIdx = 0; ftIdx < floatingTexts.length; ftIdx++) {
      var ftObj = floatingTexts[ftIdx];
      ctx.save();
      ctx.globalAlpha = Math.max(0, ftObj.alpha);
      ctx.font = "bold 20px 'Manrope', 'Noto Sans KR', sans-serif";
      ctx.fillStyle = ftObj.color;
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.shadowBlur = 4;
      ctx.fillText(ftObj.text, ftObj.x, ftObj.y);
      ctx.restore();
    }

    ctx.restore();
  }

  // Canvas Helper: Rounded Rect
  function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  // --- High-DPI Scaling & Canvas Resize ---
  function resizeCanvas() {
    var rect = viewportEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    var scaleX = canvas.width / CANVAS_WIDTH;
    var scaleY = canvas.height / CANVAS_HEIGHT;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  }

  window.addEventListener("resize", resizeCanvas);

  // --- Main Animation Loop ---
  function gameLoop(now) {
    var dt = (now - lastTime) / 1000;
    lastTime = now;

    // Cap delta time to prevent physics anomalies on tab switch
    if (dt > 0.1) dt = 0.1;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
  }

  // --- Sync Active Navigation State ---
  function syncNavigationActive() {
    var primaryNav = document.getElementById("primary-navigation");
    if (!primaryNav) {
      // Retry in 200ms if header component is still fetching
      setTimeout(syncNavigationActive, 200);
      return;
    }
    var links = primaryNav.querySelectorAll("a");
    links.forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (href.indexOf("stick-hero") !== -1) {
        link.setAttribute("aria-current", "page");
      }
    });
  }

  // --- Initialization ---
  document.addEventListener("DOMContentLoaded", function () {
    resizeCanvas();
    resetGame();
    // Default to start screen
    phase = "idle";
    if (overlayStart) overlayStart.hidden = false;
    if (overlayGameOver) overlayGameOver.hidden = true;

    syncNavigationActive();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  });
})();

