/* ============================================================
   MiniTerra — BATCH 2 (add-on file)
   Adds: minimap, compass, chests with loot, elite health glow,
         F3 coordinate/biome HUD.
   Depends on batch1.js (loads after it). No edits to the
   original game code required.
   ============================================================ */
(function () {
  'use strict';

  // ---- Wait for the game to finish loading ----
  if (typeof player === 'undefined' || typeof frame === 'undefined') {
    setTimeout(arguments.callee, 50);
    return;
  }

  // ============================================================
  // 1. MINIMAP (top-right, 200x120 world tiles at 2px each)
  // ============================================================
  const MM_W = 200;      // minimap canvas width in px
  const MM_H = 120;      // minimap canvas height in px
  const MM_SCALE = 2;    // px per world tile
  const MM_RANGE_X = MM_W / MM_SCALE;  // world tiles shown horizontally
  const MM_RANGE_Y = MM_H / MM_SCALE;  // world tiles shown vertically

  const mmCanvas = document.createElement('canvas');
  mmCanvas.width = MM_W;
  mmCanvas.height = MM_H;
  mmCanvas.style.cssText =
    'position:fixed;top:10px;right:10px;width:' + MM_W + 'px;height:' + MM_H + 'px;' +
    'border:2px solid #555c6e;border-radius:6px;background:#111;z-index:7;' +
    'image-rendering:pixelated;box-shadow:0 2px 8px rgba(0,0,0,.5);';
  document.body.appendChild(mmCanvas);
  const mmCtx = mmCanvas.getContext('2d');

  // Fog of war: tiles the player has seen. Key = "x,y". Cheap to grow.
  const seen = {};
  function markSeen(cx, cy) {
    const r = 25;
    for (let x = cx - r; x <= cx + r; x++) {
      for (let y = cy - r; y <= cy + r; y++) {
        seen[x + ',' + y] = 1;
      }
    }
  }

  function blockMiniColor(name) {
    const def = BLOCKS[name];
    if (!def) return null;
    if (name === 'air') return null;
    let c = def.color;
    if (typeof c !== 'string' || c.charAt(0) !== '#') return null;
    return c;
  }

  function drawMinimap() {
    const px = Math.floor(player.x), py = Math.floor(player.y + 0.9);
    const left = px - Math.floor(MM_RANGE_X / 2);
    const top = py - Math.floor(MM_RANGE_Y / 2);

    mmCtx.fillStyle = '#0a0d12';
    mmCtx.fillRect(0, 0, MM_W, MM_H);

    // Terrain colors
    for (let sx = 0; sx < MM_RANGE_X; sx++) {
      const wx = left + sx;
      if (!world[wx]) continue;
      const col = world[wx];
      for (let sy = 0; sy < MM_RANGE_Y; sy++) {
        const wy = top + sy;
        if (wy < 0 || wy >= col.length) continue;
        const name = col[wy];
        if (name === 'air') continue;
        const c = blockMiniColor(name);
        if (!c) continue;
        const k = wx + ',' + wy;
        const known = seen[k];
        mmCtx.fillStyle = known ? c : shade(c, 0.45);
        mmCtx.fillRect(sx * MM_SCALE, sy * MM_SCALE, MM_SCALE, MM_SCALE);
      }
    }

    // Chests (batch 2) drawn as gold dots
    mmCtx.fillStyle = '#ffd54a';
    for (const k in chests) {
      const p = k.split(',');
      const cx = +p[0], cy = +p[1];
      const sx = cx - left, sy = cy - top;
      if (sx < 0 || sy < 0 || sx >= MM_RANGE_X || sy >= MM_RANGE_Y) continue;
      mmCtx.fillRect(sx * MM_SCALE - 1, sy * MM_SCALE - 1, 3, 3);
    }

    // Enemies as red dots
    if (typeof enemies !== 'undefined') {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        const sx = Math.floor(e.x) - left, sy = Math.floor(e.y) - top;
        if (sx < 0 || sy < 0 || sx >= MM_RANGE_X || sy >= MM_RANGE_Y) continue;
        mmCtx.fillStyle = ENEMIES[e.type].hostile === false ? '#8dd' : (e.elite ? '#ffd54a' : '#f44');
        mmCtx.fillRect(sx * MM_SCALE - 1, sy * MM_SCALE - 1, 3, 3);
      }
    }

    // Player as white dot in center
    const ccx = Math.floor(MM_RANGE_X / 2) * MM_SCALE;
    const ccy = Math.floor(MM_RANGE_Y / 2) * MM_SCALE;
    mmCtx.fillStyle = '#fff';
    mmCtx.fillRect(ccx - 1, ccy - 1, 3, 3);
    mmCtx.strokeStyle = '#000';
    mmCtx.lineWidth = 1;
    mmCtx.strokeRect(ccx - 1.5, ccy - 1.5, 4, 4);
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.floor(((n >> 16) & 255) * f);
    const g = Math.floor(((n >> 8) & 255) * f);
    const b = Math.floor((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ============================================================
  // 2. COMPASS / DEPTH BAR (below minimap)
  // ============================================================
  const compassEl = document.createElement('div');
  compassEl.style.cssText =
    'position:fixed;top:' + (MM_H + 18) + 'px;right:10px;width:' + MM_W + 'px;' +
    'background:rgba(0,0,0,.65);color:#fff;font:12px system-ui,sans-serif;' +
    'padding:4px 8px;border-radius:6px;text-align:center;z-index:7;' +
    'border:2px solid #555c6e;box-sizing:border-box;';
  document.body.appendChild(compassEl);

  // ============================================================
  // 3. F3 INFO HUD (top-center, toggle with F3)
  // ============================================================
  const f3El = document.createElement('div');
  f3El.style.cssText =
    'position:fixed;top:10px;left:50%;transform:translateX(-50%);' +
    'background:rgba(0,0,0,.7);color:#fff;font:12px ui-monospace,Menlo,monospace;' +
    'padding:6px 10px;border-radius:6px;z-index:7;display:none;white-space:pre;line-height:1.5;';
  document.body.appendChild(f3El);
  let f3On = false;
  addEventListener('keydown', function (e) {
    if (e.key === 'F3') { e.preventDefault(); f3On = !f3On; f3El.style.display = f3On ? 'block' : 'none'; }
  });

  // ============================================================
  // 4. CHESTS
  // ============================================================
  // Chests are world tiles named 'chest'. We define the block lazily
  // so the save/load diff in batch1 picks them up automatically.
  if (!BLOCKS.chest) {
    BLOCKS.chest = {
      color: '#c8954f',
      hardness: 30,
      drops: null,          // opened on use, not mined
      needsFloor: true,
      chop: true,
      chest: true
    };
  }

  // Which chests are open (their loot has been taken). Key = "x,y".
  const chests = {};       // "x,y" -> { loot: { item: count, ... }, opened: bool }
  const openedChests = {}; // "x,y" -> true, so we don't re-roll loot after reload

  // Random loot table for cave chests.
  const CHEST_LOOT = [
    { item: 'torch',   min: 5,   max: 15,  weight: 8 },
    { item: 'apple',   min: 2,   max: 5,   weight: 7 },
    { item: 'coal',    min: 3,   max: 10,  weight: 7 },
    { item: 'iron',    min: 2,   max: 6,   weight: 6 },
    { item: 'gel',     min: 2,   max: 5,   weight: 5 },
    { item: 'planks',  min: 8,   max: 20,  weight: 5 },
    { item: 'gold',    min: 1,   max: 4,   weight: 4 },
    { item: 'diamond', min: 1,   max: 2,   weight: 2 },
    { item: 'ruby',    min: 1,   max: 1,   weight: 1 },
    { item: 'mythril', min: 1,   max: 1,   weight: 1 },
    { item: 'silk',    min: 1,   max: 3,   weight: 4 },
    { item: 'claw',    min: 1,   max: 2,   weight: 3 },
    { item: 'scale',   min: 1,   max: 2,   weight: 3 },
  ];

  function rollChestLoot(depth) {
    const loot = {};
    const rolls = 3 + Math.floor(Math.random() * 3);  // 3-5 item stacks
    const pool = CHEST_LOOT.filter(function (l) {
      // Deeper chests can roll rarer loot
      if (l.item === 'diamond' || l.item === 'ruby') return depth > 40;
      if (l.item === 'mythril') return depth > 90;
      if (l.item === 'gold') return depth > 20;
      return true;
    });
    const totalW = pool.reduce(function (s, l) { return s + l.weight; }, 0);
    for (let i = 0; i < rolls; i++) {
      let r = Math.random() * totalW;
      let pick = pool[0];
      for (let j = 0; j < pool.length; j++) { r -= pool[j].weight; if (r <= 0) { pick = pool[j]; break; } }
      const n = pick.min + Math.floor(Math.random() * (pick.max - pick.min + 1));
      loot[pick.item] = (loot[pick.item] || 0) + n;
    }
    return loot;
  }

  // When a chunk generates, sprinkle chests into air pockets.
  // We hook buildChunk() so we catch every newly generated column.
  const _origBuildChunk = buildChunk;
  buildChunk = function (c) {
    _origBuildChunk(c);
    // Look for air pockets near the surface of the underground.
    const c0 = c * CH, c1 = c0 + CH - 1;
    // One chest chance per chunk, deeper = higher chance
    if (Math.random() > 0.35) return;
    for (let tries = 0; tries < 8; tries++) {
      const x = c0 + 4 + Math.floor(Math.random() * (CH - 8));
      if (!world[x]) continue;
      const surfaceY = heights[x];
      const depth = 20 + Math.floor(Math.random() * 120);  // 20-140 blocks below surface
      const y = surfaceY + depth;
      if (y >= H - 2) continue;
      if (world[x][y] === 'air' && BLOCKS[world[x][y + 1]] && BLOCKS[world[x][y + 1]].solid !== false) {
        world[x][y] = 'chest';
        chests[x + ',' + y] = { loot: rollChestLoot(depth), opened: false };
        updateLight(x, y);
        return;
      }
    }
  };

  // Open a chest on right-click. The original place() is on right-click,
  // so we intercept: if the target is a chest, open it instead.
  const _origPlaceB2 = place;
  place = function () {
    const t = target();
    if (get(t.x, t.y) === 'chest' && canReach(t)) {
      openChest(t.x, t.y);
      return;
    }
    _origPlaceB2();
  };

  // Also intercept mine: hitting a chest should open it, not mine it.
  const _origMineB2 = mine;
  mine = function () {
    const t = target();
    if (mouse.left && get(t.x, t.y) === 'chest' && canReach(t)) {
      openChest(t.x, t.y);
      // Prevent rapid re-opening
      mouse.left = false;
      return;
    }
    _origMineB2();
  };

  function openChest(x, y) {
    const k = x + ',' + y;
    const chest = chests[k];
    if (!chest) {
      // Unknown chest (e.g. loaded from a save before we tracked loot):
      // roll fresh loot on the spot.
      const depth = y - heights[x];
      chests[k] = { loot: rollChestLoot(depth), opened: false };
      return openChest(x, y);
    }
    if (chest.opened) { toast('Chest is empty'); return; }

    // Show a small toast listing what you got
    const lines = [];
    for (const item in chest.loot) {
      const n = chest.loot[item];
      add(item, n);   // add() already fires the pickup feed from batch1
      lines.push(n + ' ' + item.replace(/_/g, ' '));
    }
    chest.opened = true;
    chest.loot = {};
    // Turn the chest tile into an open chest (visually the same for now, but flagged)
    openedChests[k] = true;
    toast('Chest: ' + lines.join(', '));
  }

  // Draw chests with a lid detail
  const _origDrawB2 = draw;
  draw = function () {
    _origDrawB2();
    const cx = camX(), cy = camY();
    const x0 = Math.floor(cx / TS), x1 = Math.ceil((cx + canvas.width) / TS);
    const y0 = Math.max(0, Math.floor(cy / TS)), y1 = Math.min(H - 1, Math.ceil((cy + canvas.height) / TS));
    for (let x = x0; x <= x1; x++) {
      if (!world[x]) continue;
      for (let y = y0; y <= y1; y++) {
        if (world[x][y] !== 'chest') continue;
        const px = Math.round(x * TS - cx), py = Math.round(y * TS - cy);
        const opened = openedChests[x + ',' + y];
        // Chest body
        ctx.fillStyle = opened ? '#6d4c2a' : '#c8954f';
        ctx.fillRect(px + 1, py + 2, TS - 2, TS - 3);
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(px + 1, py + 2, TS - 2, Math.floor(TS * 0.35));
        // Lid line
        ctx.fillStyle = '#000';
        ctx.fillRect(px + 1, py + Math.floor(TS * 0.38), TS - 2, 1);
        // Latch
        ctx.fillStyle = opened ? '#444' : '#ffd54a';
        ctx.fillRect(px + TS / 2 - 2, py + Math.floor(TS * 0.35), 4, 4);
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.fillRect(px + 1, py + TS - 2, TS - 2, 2);
      }
    }
  };

  // ============================================================
  // 5. ELITE HEALTH GLOW (bigger, brighter bar + outline)
  // ============================================================
  // We hook the enemy draw by wrapping the whole draw pass; elites
  // are already drawn by the original code, so we just add extra
  // glow effects for them on top.
  const _origDrawB2b = draw;
  draw = function () {
    _origDrawB2b();
    if (typeof enemies === 'undefined') return;
    const cx = camX(), cy = camY();
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.elite) continue;
      const px = e.x * TS - cx, py = e.y * TS - cy, w = e.w * TS, h = e.h * TS;
      if (px < -100 || px > canvas.width + 100 || py < -100 || py > canvas.height + 100) continue;
      // Pulsing outer glow
      const pulse = 0.5 + 0.5 * Math.sin(frame * 0.15);
      ctx.save();
      ctx.globalAlpha = 0.35 + pulse * 0.35;
      ctx.strokeStyle = '#ffd54a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py + h / 2, Math.max(w, h) * (0.75 + pulse * 0.1), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // Wider HP bar above elite
      ctx.fillStyle = '#000';
      ctx.fillRect(px - 22, py - 14, 44, 6);
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(px - 21, py - 13, 42 * Math.max(0, e.hp / e.maxHp), 4);
    }
  };

  // ============================================================
  // 6. TICK
  // ============================================================
  // Mark minimap vision + draw HUD elements once per frame, using
  // the same rAF loop that the game already runs.
  let lastTick = 0;
  function tick() {
    const now = performance.now();
    if (now - lastTick > 60) {   // ~16 fps is plenty for a minimap
      lastTick = now;

      // Mark vision around the player
      markSeen(Math.floor(player.x), Math.floor(player.y + 0.9));

      // Minimap
      try { drawMinimap(); } catch (e) { /* world not ready */ }

      // Compass
      const depth = Math.round(player.y + 0.9 - (heights[Math.floor(player.x)] || 0));
      const dir = depth < 0 ? '↑ sky' : depth > 0 ? '↓ depth ' + depth : '● surface';
      compassEl.textContent = 'X ' + Math.floor(player.x) + '  ·  ' + dir;

      // F3
      if (f3On) {
        const px = Math.floor(player.x), py = Math.floor(player.y + 0.9);
        const bd = py - heights[px];
        const bio = typeof biomeCol !== 'undefined' && biomeCol[px] ? BIOMES[biomeCol[px]].name : '?';
        const fps = Math.round(fpsAvg || 60);
        f3El.textContent =
          'Pos: ' + px + ', ' + py + '\n' +
          'Depth: ' + bd + '\n' +
          'Biome: ' + bio + '\n' +
          'FPS: ' + fps + '\n' +
          'Enemies: ' + (typeof enemies !== 'undefined' ? enemies.length : 0) + '\n' +
          'Chests seen: ' + Object.keys(chests).length;
      }
    }
    requestAnimationFrame(tick);
  }
  tick();

  console.log('[MiniTerra Batch 2] loaded — minimap, chests, compass, F3.');
})();