/* ============================================================
   MiniTerra — BATCH 1 (add-on file)
   Adds: pause menu (Esc), save/load, flying item pickups,
         corner pickup feed, block break/place particles.
   No changes to the original game code are required.
   ============================================================ */
(function () {
  'use strict';

  // ---- Wait for the game to finish loading ----
  if (typeof player === 'undefined' || typeof frame === 'undefined') {
    setTimeout(arguments.callee, 50);
    return;
  }

  // ============================================================
  // 1. PICKUP FEED (bottom-right, "+N Item" lines)
  // ============================================================
  const feedEl = document.createElement('div');
  feedEl.id = 'b1feed';
  feedEl.style.cssText = 'position:fixed;right:12px;bottom:130px;display:flex;flex-direction:column;align-items:flex-end;gap:3px;pointer-events:none;z-index:6;';
  document.body.appendChild(feedEl);
  const feedLines = [];
  function feed(item, n) {
    if (n <= 0) return;
    const el = document.createElement('div');
    el.style.cssText = 'background:rgba(0,0,0,.55);color:#fff;font-size:13px;padding:3px 8px;border-radius:5px;text-shadow:0 1px 2px #000;transition:opacity .4s linear,transform .4s linear;';
    el.textContent = '+' + n + ' ' + item.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    feedEl.appendChild(el);
    feedLines.push({ el: el, t: 2200 });
    while (feedLines.length > 6) { feedLines.shift().el.remove(); }
  }

  // Hook add() so every gain shows in the feed.
  const _origAdd = add;
  add = function (item, n) {
    n = (n === undefined) ? 1 : n;
    _origAdd(item, n);
    feed(item, n);
  };

  // ============================================================
  // 2. PARTICLES (break + place)
  // ============================================================
  const particles = [];
  function spawnParticles(tx, ty, blockName, count, spread, upBias) {
    const def = BLOCKS[blockName];
    let col = def && def.color;
    if (typeof col !== 'string' || col.charAt(0) !== '#') col = '#888';
    for (let i = 0; i < count; i++) {
      particles.push({
        x: tx + 0.15 + Math.random() * 0.7,
        y: ty + 0.15 + Math.random() * 0.7,
        vx: (Math.random() - 0.5) * spread,
        vy: -upBias - Math.random() * upBias,
        life: 400 + Math.random() * 400,
        max: 800,
        color: col,
        size: 2 + Math.random() * 3
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 0.0009 * dt;
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles(cx, cy) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * TS - cx, p.y * TS - cy, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // 3. FLYING PICKUPS (visual only — the item is already granted
  //    by the original mine()/dropLoot() code; we just draw a
  //    little icon that flies toward the player and vanishes)
  // ============================================================
  const pickups = [];
  function spawnPickup(tx, ty, item) {
    if (!item) return;
    pickups.push({
      x: tx + 0.5, y: ty + 0.5,
      item: item,
      life: 900
    });
  }
  function updatePickups() {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      const dx = player.x - p.x, dy = (player.y + 0.9) - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = 0.18;
      p.x += dx / d * speed;
      p.y += dy / d * speed;
      p.life--;
      if (d < 0.5 || p.life <= 0) pickups.splice(i, 1);
    }
  }
  function drawPickups(cx, cy) {
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      const px = p.x * TS - cx, py = p.y * TS - cy;
      let col = '#fff';
      const it = ITEMS[p.item];
      if (it) col = it.color || (it.block && BLOCKS[it.block] && BLOCKS[it.block].color) || '#fff';
      if (typeof col !== 'string' || col.charAt(0) !== '#') col = '#fff';
      ctx.fillStyle = col;
      ctx.fillRect(px - 4, py - 4, 8, 8);
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 4, py - 4, 8, 8);
    }
  }

  // ============================================================
  // 4. WORLD-EDIT TRACKING (for save/load)
  //    We watch the world[][] tables and record any change the
  //    player (or anything else) causes, so we can replay them
  //    on load. This is done without touching the original code
  //    by diffing a snapshot we take once per second.
  // ============================================================
  const edits = {}; // "x,y" -> blockName
  let editBaselineReady = false;
  function keyOf(x, y) { return x + ',' + y; }
  function snapshotAndRecordEdits() {
    for (const xs in world) {
      const x = +xs;
      const col = world[x];
      if (!col) continue;
      for (let y = 0; y < col.length; y++) {
        const cur = col[y];
        const k = keyOf(x, y);
        if (edits[k] === undefined) {
          // Baseline for this coordinate is whatever the generator
          // *would* produce. We can't recompute that without undoing
          // the original world state, so instead we just remember the
          // current value as the baseline on first sight, and only
          // record changes after that.
          edits[k] = cur;
        } else if (edits[k] !== cur) {
          // Real change: overwrite baseline with the new value.
          // (The "original" value from worldgen is lost from our
          // baseline, but for save/load what matters is the *current*
          // state, so that's fine.)
          edits[k] = cur;
          recordForSave(k, cur);
        }
      }
    }
    editBaselineReady = true;
  }
  const savedEdits = {}; // only values that differ from worldgen baseline
  function recordForSave(k, name) {
    savedEdits[k] = name;
  }

  // ============================================================
  // 5. PAUSE MENU + SAVE/LOAD
  // ============================================================
  const SAVE_KEY = 'miniterra.save.v1';

  const pauseEl = document.createElement('div');
  pauseEl.id = 'b1pause';
  pauseEl.style.cssText = 'position:fixed;inset:0;background:rgba(8,10,16,.86);display:none;align-items:center;justify-content:center;z-index:20;font-family:system-ui,sans-serif;';
  pauseEl.innerHTML =
    '<div style="background:#2b2f3a;border:3px solid #555c6e;border-radius:12px;padding:22px 26px;color:#fff;min-width:300px;max-width:92vw;box-sizing:border-box;">' +
      '<h2 style="margin:0 0 14px;">Paused</h2>' +
      '<button data-act="resume" style="display:block;width:100%;padding:10px 12px;margin:6px 0;font-size:15px;cursor:pointer;background:#3f6b4a;color:#fff;border:2px solid #6bbf7e;border-radius:6px;">Resume</button>' +
      '<button data-act="save" style="display:block;width:100%;padding:10px 12px;margin:6px 0;font-size:15px;cursor:pointer;background:#3a3f4d;color:#fff;border:2px solid #555c6e;border-radius:6px;">Save Game</button>' +
      '<button data-act="load" style="display:block;width:100%;padding:10px 12px;margin:6px 0;font-size:15px;cursor:pointer;background:#3a3f4d;color:#fff;border:2px solid #555c6e;border-radius:6px;">Load Game</button>' +
      '<div class="pstatus" style="margin-top:12px;font-size:12px;color:#bbb;min-height:16px;"></div>' +
      '<div style="margin-top:14px;font-size:12px;color:#bbb;line-height:1.6;border-top:1px solid #444;padding-top:10px;">' +
        '<b style="color:#fff;">Esc</b> resume · <b style="color:#fff;">E</b> inventory · <b style="color:#fff;">`</b> debug' +
      '</div>' +
    '</div>';
  document.body.appendChild(pauseEl);

  let paused = false;
  const statusEl = pauseEl.querySelector('.pstatus');
  function setStatus(msg, ok) {
    statusEl.textContent = msg;
    statusEl.style.color = ok ? '#7ee787' : '#ff7b72';
  }

  function serialize() {
    return JSON.stringify({
      v: 1,
      seed: seed,
      ph: ph.slice(),
      px: player.x, py: player.y,
      spawnX: spawn.x, spawnY: spawn.y,
      stats: {
        health: stats.health, stamina: stats.stamina, oxygen: stats.oxygen,
        hunger: stats.hunger, exh: stats.exh
      },
      inv: (function () {
        const o = {};
        for (const k in inv) if (inv[k] > 0) o[k] = inv[k];
        return o;
      })(),
      dur: (function () { const o = {}; for (const k in dur) o[k] = dur[k]; return o; })(),
      slots: slots.slice(),
      sel: sel,
      discovered: Array.from(discovered),
      savedEdits: savedEdits
    });
  }

  function doSave() {
    try {
      localStorage.setItem(SAVE_KEY, serialize());
      setStatus('Saved!', true);
    } catch (e) {
      setStatus('Save failed: ' + e.message, false);
    }
  }

  function doLoad() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { setStatus('No save found.', false); return; }
    let s;
    try { s = JSON.parse(raw); } catch (e) { setStatus('Corrupt save.', false); return; }

    try {
      // Restore worldgen seeds
      seed = s.seed;
      for (let i = 0; i < ph.length; i++) if (typeof s.ph[i] === 'number') ph[i] = s.ph[i];

      // Wipe world tables so regeneration produces the saved world
      for (const t of [world, heights, biomeCol, ubc, light, glow, skyTop, fl]) {
        for (const k in t) delete t[k];
      }
      chunks.clear();
      if (typeof islands !== 'undefined') { islands.length = 0; islandSeen.clear(); }

      // Regenerate around the saved player position
      ensureChunks(s.px, true);

      // Replay block edits
      for (const k in s.savedEdits) {
        const parts = k.split(',');
        const ex = +parts[0], ey = +parts[1];
        if (!world[ex]) continue;
        world[ex][ey] = s.savedEdits[k];
        updateLight(ex, ey);
      }

      // Restore player
      player.x = s.px; player.y = s.py; player.vx = 0; player.vy = 0;
      player.peakY = s.py;
      spawn.x = s.spawnX; spawn.y = s.spawnY;

      // Restore stats
      stats.health = s.stats.health;
      stats.stamina = s.stats.stamina;
      stats.oxygen = s.stats.oxygen;
      stats.hunger = s.stats.hunger;
      stats.exh = s.stats.exh;
      stats.sprinting = false;
      stats.exhausted = false;
      stats.flash = 0;
      stats.msg = 0;

      // Restore inventory
      for (const k in inv) delete inv[k];
      for (const k in s.inv) inv[k] = s.inv[k];
      for (const k in dur) delete dur[k];
      for (const k in s.dur) dur[k] = s.dur[k];
      for (let i = 0; i < slots.length; i++) slots[i] = s.slots[i] || null;
      sel = s.sel || 0;

      // Restore discovered recipes
      discovered.clear();
      for (let i = 0; i < s.discovered.length; i++) discovered.add(s.discovered[i]);

      // Reset transient entities
      if (typeof enemies !== 'undefined') enemies.length = 0;
      pickups.length = 0;
      particles.length = 0;

      // Reset edit baseline so we don't re-save everything as new
      for (const k in edits) delete edits[k];
      for (const k in savedEdits) delete savedEdits[k];

      if (typeof refreshUI === 'function') refreshUI();
      setStatus('Loaded!', true);
    } catch (e) {
      setStatus('Load failed: ' + e.message, false);
    }
  }

  pauseEl.addEventListener('click', function (e) {
    const act = e.target && e.target.dataset && e.target.dataset.act;
    if (!act) return;
    if (act === 'resume') { paused = false; pauseEl.style.display = 'none'; mouse.left = false; }
    if (act === 'save') doSave();
    if (act === 'load') doLoad();
  });

  // Esc opens/closes the pause menu (or closes the inventory if it's open)
  addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (typeof invOpen !== 'undefined' && invOpen) { toggleInv(false); return; }
    paused = !paused;
    pauseEl.style.display = paused ? 'flex' : 'none';
    if (!paused) mouse.left = false;
    if (paused) setStatus('');
  }, true);

  // ============================================================
  // 6. WRAP THE ORIGINAL FUNCTIONS
  // ============================================================
  // mine() — record edits + spawn particles + spawn flying pickup
  const _origMine = mine;
  mine = function () {
    const t = target();
    const before = get(t.x, t.y);
    _origMine();
    const after = get(t.x, t.y);
    if (before !== 'air' && after === 'air') {
      savedEdits[keyOf(t.x, t.y)] = 'air';
      spawnParticles(t.x, t.y, before, 8, 0.14, 0.1);
      const def = BLOCKS[before];
      if (def && def.drops && Math.random() < (def.dropChance === undefined ? 1 : def.dropChance)) {
        spawnPickup(t.x, t.y, def.drops);
      }
    } else if (before !== after) {
      savedEdits[keyOf(t.x, t.y)] = after;
    }
  };

  // place() — record edits + spawn particles
  const _origPlace = place;
  place = function () {
    const t = target();
    const before = get(t.x, t.y);
    _origPlace();
    const after = get(t.x, t.y);
    if (before !== after && after !== 'air') {
      savedEdits[keyOf(t.x, t.y)] = after;
      spawnParticles(t.x, t.y, after, 5, 0.1, 0.05);
    }
  };

  // draw() — draw particles and pickups on top of the world
  const _origDraw = draw;
  draw = function () {
    _origDraw();
    const cx = camX(), cy = camY();
    drawPickups(cx, cy);
    drawParticles(cx, cy);
  };

  // loop() — pause when the menu is open; tick particle/pickup updates
  let lastNow = performance.now();
  const _origLoop = loop;
  loop = function () {
    const now = performance.now();
    const dt = Math.min(64, now - lastNow);
    lastNow = now;

    // Feed fade
    for (let i = feedLines.length - 1; i >= 0; i--) {
      const f = feedLines[i];
      f.t -= dt;
      if (f.t < 500) f.el.style.opacity = String(Math.max(0, f.t / 500));
      if (f.t <= 0) { f.el.remove(); feedLines.splice(i, 1); }
    }

    if (paused) { draw(); drawHud(); requestAnimationFrame(loop); return; }

    updateParticles(dt);
    updatePickups();

    // Record world edits once per second (cheap, catches everything)
    if (frame % 60 === 0) {
      // Only scan columns currently loaded — the full world can be huge.
      for (const xs in world) {
        const x = +xs;
        const col = world[x];
        if (!col) continue;
        for (let y = 0; y < col.length; y++) {
          const cur = col[y];
          const k = keyOf(x, y);
          if (edits[k] === undefined) {
            edits[k] = cur;
          } else if (edits[k] !== cur) {
            edits[k] = cur;
            savedEdits[k] = cur;
          }
        }
      }
    }

    _origLoop();
  };

  // ============================================================
  // 7. READY
  // ============================================================
  console.log('[MiniTerra Batch 1] loaded — Esc opens pause menu.');
})();