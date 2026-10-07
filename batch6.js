/* ============================================================
   MiniTerra — BATCH 6 (replaces previous batch6.js)
   Fixes: minimap water/lava now render as regular blocks
          (no more overlay canvases, no smear).
   Also:  proper poison flag, depth-based chest loot.
   Loads after batch1–5.
   ============================================================ */
(function () {
  'use strict';

  if (typeof player === 'undefined' || typeof frame === 'undefined') {
    setTimeout(arguments.callee, 50);
    return;
  }

  // ============================================================
  // 1. MAKE WATER / LAVA HEX-COLORED BLOCKS
  // ============================================================
  // Batch 2's minimap filters by "color starts with #". Water and
  // lava were rgba() / had custom handling, so they were skipped.
  // We give them plain hex colors (with an `alpha` value used only
  // by the world renderer below), so the minimap picks them up
  // automatically.
  if (BLOCKS.water) {
    BLOCKS.water.color = '#2a6dcc';
    BLOCKS.water.alpha = 0.65;
  }
  if (BLOCKS.lava) {
    BLOCKS.lava.color = '#ff5a14';
    BLOCKS.lava.alpha = 1.0;
  }

  // ============================================================
  // 2. RENDER WATER / LAVA WITH ALPHA IN THE WORLD
  // ============================================================
  // The original draw() sets `ctx.fillStyle = col; ctx.fillRect(...)`.
  // For water that used to be an rgba() string, so it drew semi-
  // transparent. Now that col is hex, we need to apply the alpha
  // ourselves. We hook draw() and, before the original runs, swap
  // the water/lava color to an rgba() string for that frame, then
  // restore it. This way the original renderer produces the same
  // visual result, while the minimap (which reads the hex) sees a
  // plain color.

  const _origDraw6 = draw;
  draw = function () {
    // Build rgba versions for the world render pass
    const waterHex = BLOCKS.water.color;
    const lavaHex = BLOCKS.lava.color;
    BLOCKS.water.color = hexToRgba(waterHex, BLOCKS.water.alpha);
    BLOCKS.lava.color = hexToRgba(lavaHex, BLOCKS.lava.alpha);
    try {
      _origDraw6.call(this);
    } finally {
      // Restore hex so the minimap (which runs on a setInterval, not
      // inside draw) sees the plain hex value.
      BLOCKS.water.color = waterHex;
      BLOCKS.lava.color = lavaHex;
    }
  };

  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  // ============================================================
  // 3. NEUTRALIZE BATCH 5 / BATCH 6-v1 OVERLAY CANVASES
  // ============================================================
  // The previous batch5 drew liquids onto b4mmoverlay (a smear-prone
  // canvas) and batch6-v1 created its own liquid/marker canvases.
  // Now that the minimap renders liquids natively, we hide those
  // canvases so they can't smear over the top.
  function hideOldOverlays() {
    const ids = ['b4mmoverlay'];   // batch5/batch6-v1 liquid canvases
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    // Any canvas batch6-v1 created had no id; find stray canvases
    // positioned at top-right with the minimap dimensions and hide them.
    const canvases = document.querySelectorAll('canvas');
    for (const c of canvases) {
      if (c.id === 'c') continue;   // main game canvas
      if (c.id === 'b4mmoverlay') continue;
      // Minimap-sized canvas at top-right
      const s = c.style;
      if (s.position === 'fixed' && s.top === '10px' && s.right === '10px' && c.width === 200 && c.height === 120) {
        // Was it created by batch6-v1? It has pointer-events:none and z-index 7/8.
        if (s.pointerEvents === 'none' && (s.zIndex === '7' || s.zIndex === '8')) {
          c.style.display = 'none';
        }
      }
    }
  }
  hideOldOverlays();
  // Also re-hide on a timer, in case batch5 recreates something
  setInterval(hideOldOverlays, 2000);

  // ============================================================
  // 4. PROPER POISON FLAG ON ENEMIES
  // ============================================================
  if (ENEMIES.spider) ENEMIES.spider.poison = true;
  if (ENEMIES.scorpion) ENEMIES.scorpion.poison = true;

  const _origUpdateEnemies6 = updateEnemies;
  updateEnemies = function () {
    if (typeof buffs === 'object' && buffs && buffs.poison) {
      const px = player.x, py = player.y + 0.9;
      for (const e of enemies) {
        const d = ENEMIES[e.type];
        if (!d || !d.poison) continue;
        const dx = Math.abs(px - e.x), dy = Math.abs(py - (e.y + e.h / 2));
        if (dx < e.w / 2 + player.w / 2 && dy < e.h / 2 + player.h / 2) {
          buffs.poison.time = Math.max(buffs.poison.time, 240);
        }
      }
    }
    _origUpdateEnemies6.call(this);
  };

  // ============================================================
  // 5. DEPTH-BASED CHEST LOOT
  // ============================================================
  let chestBurst = { active: false, timer: 0, count: 0 };

  const _origAdd6 = add;
  add = function (item, n) {
    const now = frame;
    if (!chestBurst.active) {
      chestBurst.active = true;
      chestBurst.timer = now + 5;
      chestBurst.count = 1;
    } else if (now <= chestBurst.timer) {
      chestBurst.count++;
    } else {
      evaluateBurst();
      chestBurst.active = true;
      chestBurst.timer = now + 5;
      chestBurst.count = 1;
    }
    return _origAdd6.call(this, item, n);
  };

  function evaluateBurst() {
    if (chestBurst.count < 3) return;
    const depth = player.y - (heights[Math.floor(player.x)] || 0);
    if (depth < 40) return;
    const roll = Math.random();
    if (depth > 150 && roll < 0.35) {
      add('diamond', 1 + Math.floor(Math.random() * 2));
    } else if (depth > 100 && roll < 0.5) {
      add('gold', 2 + Math.floor(Math.random() * 3));
    } else if (depth > 60 && roll < 0.6) {
      add('iron', 3 + Math.floor(Math.random() * 4));
    } else if (roll < 0.7) {
      add('coal', 3 + Math.floor(Math.random() * 5));
    }
  }

  setInterval(function () {
    if (chestBurst.active && frame > chestBurst.timer) {
      evaluateBurst();
      chestBurst.active = false;
    }
  }, 300);

  // ============================================================
  // READY
  // ============================================================
  console.log('[MiniTerra Batch 6] loaded — minimap liquids natively, poison flag, depth loot.');
})();