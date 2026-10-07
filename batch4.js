/* ============================================================
   MiniTerra — BATCH 4 (add-on file)
   Adds: global 100-stack cap, creative item palette, auto-sort,
         Sleeping Bag, sprint toggle, shift-click quick-move,
         minimap spawn/chest markers, Well-Fed + On Fire buffs.
   Loads after batch1.js, batch2.js, batch3.js.
   ============================================================ */
(function () {
  'use strict';

  if (typeof player === 'undefined' || typeof frame === 'undefined') {
    setTimeout(arguments.callee, 50);
    return;
  }

  // ============================================================
  // 1. GLOBAL STACK CAP OF 100
  // ============================================================
  // We patch syncSlots() so overflow spills into the next free slot
  // instead of piling up unbounded in a single slot.
  const STACK_MAX = 100;

  function distributeOverflow() {
    // For each item, if it exceeds STACK_MAX total, we just cap the
    // count stored in `inv` and let it overflow to additional slots.
    // But `inv` tracks a single total. To do this properly we track
    // per-slot counts via the `slots` array and a parallel `slotCounts`.
    // Simpler: keep `inv` as the total, and on refresh we render each
    // slot's portion based on how many of that item are visible.
    // We store per-slot counts here:
  }
  // Per-slot counts. `slotCounts[i]` = how many items are in slots[i].
  // Total for an item = sum of slotCounts across all slots showing it.
  const slotCounts = Array(36).fill(0);

  // Patch syncSlots: assign items into slots, respecting STACK_MAX,
  // and spill into additional slots when needed.
  const _origSyncSlots = syncSlots;
  syncSlots = function () {
    // Remove slots whose item is no longer owned
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] && !(inv[slots[i]] > 0)) { slots[i] = null; slotCounts[i] = 0; }
    }
    // Make sure total per item matches inv[item]. If inv has more than
    // the sum of slotCounts, top up existing slots first, then open new
    // slots. If inv has less (item was consumed), drain slots.
    for (const item in inv) {
      let total = inv[item] || 0;
      if (total <= 0) {
        // Drop all slots holding this item
        for (let i = 0; i < slots.length; i++) if (slots[i] === item) { slots[i] = null; slotCounts[i] = 0; }
        continue;
      }
      // Sum existing counts for this item
      let existing = 0;
      for (let i = 0; i < slots.length; i++) if (slots[i] === item) existing += slotCounts[i];
      if (existing === total) continue;

      if (existing > total) {
        // Drain from the last slot backwards
        let toRemove = existing - total;
        for (let i = slots.length - 1; i >= 0 && toRemove > 0; i--) {
          if (slots[i] !== item) continue;
          const take = Math.min(slotCounts[i], toRemove);
          slotCounts[i] -= take; toRemove -= take;
          if (slotCounts[i] <= 0) { slots[i] = null; slotCounts[i] = 0; }
        }
      } else {
        // Top up and spill
        let toAdd = total - existing;
        for (let i = 0; i < slots.length && toAdd > 0; i++) {
          if (slots[i] === item && slotCounts[i] < STACK_MAX) {
            const add = Math.min(STACK_MAX - slotCounts[i], toAdd);
            slotCounts[i] += add; toAdd -= add;
          }
        }
        while (toAdd > 0) {
          // Find first empty slot
          let emptyIdx = -1;
          for (let i = 0; i < slots.length; i++) if (!slots[i]) { emptyIdx = i; break; }
          if (emptyIdx < 0) { slots.push(null); slotCounts.push(0); emptyIdx = slots.length - 1; }
          const add = Math.min(STACK_MAX, toAdd);
          slots[emptyIdx] = item; slotCounts[emptyIdx] = add; toAdd -= add;
        }
      }
    }
  };

  // Patch slotHTML to render slotCounts instead of inv[k]
  const _origSlotHTML = slotHTML;
  slotHTML = function (i) {
    const k = slots[i];
    if (!k) {
      return '<div class="slot' + (i === sel ? ' sel' : '') + (i === pickSlot ? ' pick' : '') + '" data-slot="' + i + '">' +
             (i < 9 ? '<em>' + (i + 1) + '</em>' : '') + '</div>';
    }
    const d = ITEMS[k].durability;
    const left = d ? (dur[k] != null ? dur[k] : d) : 0;
    const n = slotCounts[i] != null ? slotCounts[i] : inv[k];
    return '<div class="slot' + (i === sel ? ' sel' : '') + (i === pickSlot ? ' pick' : '') + '" data-slot="' + i + '">' +
           (i < 9 ? '<em>' + (i + 1) + '</em>' : '') +
           icon(k) + '<b>' + n + '</b>' +
           (d && left < d ? '<u style="width:' + (40 * left / d) + 'px"></u>' : '') +
           '</div>';
  };

  // Patch add() to enforce the 100-cap distribution
  const _origAddB4 = add;
  add = function (item, n) {
    n = (n === undefined) ? 1 : n;
    _origAddB4.call(this, item, n);
    syncSlots();
  };

  // Patch slot click handler so moving items between slots moves counts too
  const _origSlotClick = slotClick;
  slotClick = function (e) {
    const el = e.target.closest('[data-slot]');
    if (!el) return;
    const i = +el.dataset.slot;
    if (!invOpen) { sel = i; refreshUI(); return; }
    if (e.shiftKey) {
      // Shift-click quick move: hotbar <-> inventory
      const isHotbar = i < 9;
      const src = slots[i];
      if (!src) return;
      const count = slotCounts[i] || 0;
      // Find destination
      let dest = -1;
      if (isHotbar) {
        for (let j = 9; j < slots.length; j++) if (slots[j] === src && slotCounts[j] < STACK_MAX) { dest = j; break; }
        if (dest < 0) for (let j = 9; j < slots.length; j++) if (!slots[j]) { dest = j; break; }
      } else {
        for (let j = 0; j < 9; j++) if (slots[j] === src && slotCounts[j] < STACK_MAX) { dest = j; break; }
        if (dest < 0) for (let j = 0; j < 9; j++) if (!slots[j]) { dest = j; break; }
      }
      if (dest < 0) return;
      if (slots[dest] === src) {
        const move = Math.min(count, STACK_MAX - slotCounts[dest]);
        slotCounts[dest] += move;
        slotCounts[i] -= move;
        if (slotCounts[i] <= 0) { slots[i] = null; slotCounts[i] = 0; }
      } else {
        // Swap
        const tmpItem = slots[dest], tmpCount = slotCounts[dest];
        slots[dest] = src; slotCounts[dest] = count;
        slots[i] = tmpItem; slotCounts[i] = tmpCount;
      }
      refreshUI();
      return;
    }
    // Normal click behavior (fall through to original)
    _origSlotClick.call(this, e);
    // Sync counts when a swap happened
    if (pickSlot < 0) {
      // After a move completed, reconcile slotCounts with inv
      syncSlots();
      // Make sure counts match: for each slot, cap by remaining inv
      const used = {};
      for (let j = 0; j < slots.length; j++) {
        const s = slots[j];
        if (!s) { slotCounts[j] = 0; continue; }
        used[s] = (used[s] || 0) + (slotCounts[j] || 0);
      }
      // If a swap moved an item, counts might be off; reset to a clean distribution
      for (const s in inv) {
        if ((used[s] || 0) !== inv[s]) {
          // Wipe this item's slots and redistribute
          for (let j = 0; j < slots.length; j++) if (slots[j] === s) { slots[j] = null; slotCounts[j] = 0; }
        }
      }
      syncSlots();
      refreshUI();
    }
  };

  // ============================================================
  // 2. CREATIVE PALETTE
  // ============================================================
  // A. Inventory-screen Creative tab (visible only when debug.creative)
  function ensureCreativeTab() {
    const invbox = document.querySelector('#inv .invbox');
    if (!invbox) { setTimeout(ensureCreativeTab, 100); return; }
    if (invbox.querySelector('#b4creative')) return;

    const wrap = document.createElement('div');
    wrap.id = 'b4creative';
    wrap.style.cssText = 'display:none;flex-direction:column;gap:6px;max-height:70vh;overflow:auto;min-width:340px;';
    wrap.innerHTML = '<h3 style="margin:0;">Creative — click 100, shift 1, right 50</h3>';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(9,48px);gap:4px;';
    wrap.appendChild(grid);

    for (const itemKey of Object.keys(ITEMS)) {
      const cell = document.createElement('div');
      cell.className = 'slot';
      cell.dataset.creative = itemKey;
      cell.title = nice(itemKey);
      cell.style.cursor = 'pointer';
      cell.innerHTML = icon(itemKey);
      cell.addEventListener('mousedown', function (e) {
        e.preventDefault();
        const amount = e.shiftKey ? 1 : (e.button === 2 ? 50 : 100);
        add(itemKey, amount);
      });
      cell.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      grid.appendChild(cell);
    }
    invbox.appendChild(wrap);
  }
  ensureCreativeTab();

  // Show/hide based on creative state
  function updateCreativeTabVisibility() {
    const el = document.getElementById('b4creative');
    if (!el) return;
    el.style.display = debug.creative ? 'flex' : 'none';
  }

  // B. Debug-menu quick-give grid
  function augmentDebugMenu() {
    const dbg = document.getElementById('debug');
    if (!dbg) { setTimeout(augmentDebugMenu, 200); return; }
    if (dbg.querySelector('#b4dbggrid')) return;
    const holder = document.createElement('div');
    holder.id = 'b4dbggrid';
    holder.innerHTML = '<h4>Quick give (click 100, shift 1, right 50)</h4>';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,32px);gap:3px;max-height:200px;overflow:auto;padding:4px 0;';
    for (const itemKey of Object.keys(ITEMS)) {
      const cell = document.createElement('div');
      cell.dataset.creative = itemKey;
      cell.title = nice(itemKey);
      cell.style.cssText = 'width:32px;height:32px;background:rgba(0,0,0,.4);border:1px solid #555;' +
                           'border-radius:3px;cursor:pointer;position:relative;';
      cell.innerHTML = icon(itemKey);
      cell.addEventListener('mousedown', function (e) {
        e.preventDefault();
        const amount = e.shiftKey ? 1 : (e.button === 2 ? 50 : 100);
        add(itemKey, amount);
      });
      cell.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      grid.appendChild(cell);
    }
    holder.appendChild(grid);
    dbg.appendChild(holder);
  }
  augmentDebugMenu();

  // Watch debug.creative changes and toggle the tab
  let lastCreative = debug.creative;
  setInterval(function () {
    if (debug.creative !== lastCreative) {
      lastCreative = debug.creative;
      updateCreativeTabVisibility();
      if (debug.creative && !debug.fly) {
        // Minecraft: creative implies flight
        debug.fly = true;
      }
    }
  }, 200);

  // Creative reach bonus
  const _origCanReach = canReach;
  canReach = function (t) {
    if (debug.creative) {
      const saved = CONFIG.reach;
      CONFIG.reach = Math.max(saved, 10);
      try { return _origCanReach.call(this, t); }
      finally { CONFIG.reach = saved; }
    }
    return _origCanReach.call(this, t);
  };

  // Creative: no fall damage
  const _origDamageB4 = damage;
  damage = function (n, opts) {
    if (debug.creative) return;   // already covered but belt and braces
    return _origDamageB4.call(this, n, opts);
  };

  // ============================================================
  // 3. AUTO-SORT BUTTON
  // ============================================================
  function sortKey(item) {
    const it = ITEMS[item] || {};
    if (it.armor) return '2-armor-' + it.armor;
    if (it.tool) return '3-tool-pick';
    if (it.axe) return '3-tool-axe';
    if (it.weapon) return '3-weapon';
    if (it.fishrod) return '3-fishing';
    if (it.food) return '4-food';
    if (it.block) return '1-block';
    return '5-material';
  }
  function autoSort() {
    // Gather all items with counts from all slots
    const totals = {};
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) continue;
      totals[slots[i]] = (totals[slots[i]] || 0) + (slotCounts[i] || 0);
    }
    // Wipe slots
    for (let i = 0; i < slots.length; i++) { slots[i] = null; slotCounts[i] = 0; }
    // Reinsert sorted: hotbar gets first 9, then inventory
    const sorted = Object.keys(totals).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    // Hotbar (0-8): one slot per item, respect STACK_MAX
    let hotbarSlots = 9;
    let writeIdx = 0;
    for (const item of sorted) {
      let remaining = totals[item];
      while (remaining > 0 && writeIdx < hotbarSlots) {
        const take = Math.min(STACK_MAX, remaining);
        slots[writeIdx] = item; slotCounts[writeIdx] = take;
        remaining -= take; writeIdx++;
      }
      if (remaining > 0) {
        // Spill into inventory
        for (let i = 9; i < slots.length && remaining > 0; i++) {
          if (slots[i]) continue;
          const take = Math.min(STACK_MAX, remaining);
          slots[i] = item; slotCounts[i] = take;
          remaining -= take;
        }
      }
    }
    refreshUI();
  }

  function ensureSortButton() {
    const invbox = document.querySelector('#inv .invbox');
    if (!invbox) { setTimeout(ensureSortButton, 100); return; }
    if (invbox.querySelector('#b4sort')) return;
    const btn = document.createElement('button');
    btn.id = 'b4sort';
    btn.textContent = 'Auto-Sort';
    btn.style.cssText = 'margin-top:10px;padding:8px 14px;cursor:pointer;background:#3a3f4d;color:#fff;border:2px solid #555c6e;border-radius:6px;font-size:14px;';
    btn.addEventListener('click', autoSort);
    const left = invbox.querySelector('.invleft');
    if (left) left.appendChild(btn);
  }
  ensureSortButton();

  // ============================================================
  // 4. SLEEPING BAG
  // ============================================================
  if (!ITEMS.sleeping_bag) ITEMS.sleeping_bag = { color: '#5d4037', icon: 'lump', placeableSleep: true };
  if (!RECIPES.find(function (r) { return r.makes === 'sleeping_bag'; })) {
    RECIPES.push({ makes: 'sleeping_bag', amount: 1, cost: { silk: 4, planks: 2 }, cat: ['Tools'] });
  }

  let sleepingFade = 0;      // 0 = not sleeping, else counts down

  const _origPlaceB4 = place;
  place = function () {
    const held = heldItem();
    if (held === 'sleeping_bag') {
      if (!CONFIG.dayNightCycle) { toast('Time never changes here'); return; }
      const day = 0.5 + 0.8 * Math.cos((time / CONFIG.dayLength) * Math.PI * 2);
      const isNight = day < 0.3;
      if (!isNight) { toast('You can only sleep at night'); return; }
      sleepingFade = 60;   // 1 second at 60fps
      return;
    }
    _origPlaceB4.call(this);
  };

  // Handle fade and time-skip
  const _origLoopB4 = loop;
  loop = function () {
    if (sleepingFade > 0) {
      sleepingFade--;
      if (sleepingFade === 30) {
        // Midpoint: skip time to dawn
        // day() formula: 0.5 + 0.8*cos(...) — day peaks at noon when cos = 1.
        // We want to jump to just after dawn, where day is rising.
        const cur = time % CONFIG.dayLength;
        const dayTarget = CONFIG.dayLength * 0.75;   // dawn-ish
        timeOffset += (dayTarget - cur);
        // Consume the bag
        const bag = heldItem();
        if (bag === 'sleeping_bag' && !debug.creative) {
          // Decrement one from inventory
          const before = inv.sleeping_bag;
          inv.sleeping_bag -= 1;
          if (inv.sleeping_bag <= 0) delete inv.sleeping_bag;
          if (before !== inv.sleeping_bag) refreshUI();
        }
      }
    }
    _origLoopB4.call(this);
  };

  // Draw the fade overlay
  const _origDrawB4 = draw;
  draw = function () {
    _origDrawB4.call(this);
    if (sleepingFade > 0) {
      const a = sleepingFade > 30 ? (60 - sleepingFade) / 30 : sleepingFade / 30;
      ctx.fillStyle = 'rgba(0,0,0,' + a + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Sleeping bag right-click while already in hand also disallow at surface
  // (handled above). Prevent falling damage during fade:
  const _origPlayerDamageDuringSleep = damage;
  damage = function (n, opts) {
    if (sleepingFade > 0) return;
    return _origPlayerDamageDuringSleep.call(this, n, opts);
  };

  // ============================================================
  // 5. SPRINT TOGGLE
  // ============================================================
  let sprintToggled = false;
  let idleTime = 0;

  // Override the shift key behavior: toggle instead of hold.
  // Easiest is to watch keys.shift changes.
  let shiftWasDown = false;
  addEventListener('keydown', function (e) {
    if (e.key !== 'Shift') return;
    if (shiftWasDown) return;   // ignore repeat
    shiftWasDown = true;
    sprintToggled = !sprintToggled;
  });
  addEventListener('keyup', function (e) {
    if (e.key === 'Shift') shiftWasDown = false;
  });

  // Patch updatePlayer to inject sprintToggled in place of keys.shift
  const _origUpdatePlayerB4 = updatePlayer;
  updatePlayer = function () {
    const savedShift = keys.shift;
    // Determine if we should sprint
    const dir = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    if (dir === 0) {
      idleTime++;
      if (idleTime > 18) sprintToggled = false;   // cancel after ~0.3s idle
    } else idleTime = 0;
    if (stats.stamina <= 0 || stats.exhausted) sprintToggled = false;
    if (invOpen) sprintToggled = false;
    keys.shift = sprintToggled;
    try { _origUpdatePlayerB4.call(this); }
    finally { keys.shift = savedShift; }
  };

  // ============================================================
  // 6. MINIMAP SPAWN + CHEST MARKERS
  // ============================================================
  // We hook drawMinimap() by wrapping the canvas element's draw... 
  // Easier: wrap `draw` on the main loop, then after the original
  // draw the minimap markers on top of the minimap canvas directly.
  function drawMinimapExtras() {
    if (typeof mmCtx === 'undefined') return;
    // We can't access mmCtx from batch2's closure, so we redraw on
    // the main canvas minimap element if we can find it.
    // Batch 2's minimap is a canvas with id-less styling; find by class.
    // Simplest: expose the minimap canvas via a global we set ourselves.
  }
  // Since batch2's minimap canvas isn't exposed, we draw extras into
  // a second overlay canvas positioned exactly over it.
  let overlay = document.getElementById('b4mmoverlay');
  if (!overlay) {
    overlay = document.createElement('canvas');
    overlay.id = 'b4mmoverlay';
    overlay.width = 200;
    overlay.height = 120;
    overlay.style.cssText = 'position:fixed;top:10px;right:10px;width:200px;height:120px;' +
                            'pointer-events:none;z-index:8;image-rendering:pixelated;';
    document.body.appendChild(overlay);
  }
  const ovCtx = overlay.getContext('2d');
  const MM_SCALE = 2;
  const MM_RANGE_X = 200 / MM_SCALE;
  const MM_RANGE_Y = 120 / MM_SCALE;

  function drawOverlayMarkers() {
    ovCtx.clearRect(0, 0, 200, 120);
    const px = Math.floor(player.x), py = Math.floor(player.y + 0.9);
    const left = px - Math.floor(MM_RANGE_X / 2);
    const top = py - Math.floor(MM_RANGE_Y / 2);

    // Spawn marker (green)
    const sx = Math.floor(spawn.x) - left, sy = Math.floor(spawn.y) - top;
    if (sx >= 0 && sy >= 0 && sx < MM_RANGE_X && sy < MM_RANGE_Y) {
      ovCtx.fillStyle = '#4caf50';
      ovCtx.beginPath();
      ovCtx.arc(sx * MM_SCALE, sy * MM_SCALE, 3, 0, Math.PI * 2);
      ovCtx.fill();
      ovCtx.strokeStyle = '#000';
      ovCtx.lineWidth = 1;
      ovCtx.stroke();
    }

    // Nearest unopened chest within 200 blocks
    if (typeof chests !== 'undefined') {
      let best = null, bestD = 200 * 200;
      for (const k in chests) {
        const parts = k.split(',');
        const cx = +parts[0], cy = +parts[1];
        if (chests[k].opened) continue;
        const dx = cx - px, dy = cy - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = { x: cx, y: cy }; }
      }
      if (best) {
        const bx = best.x - left, by = best.y - top;
        // If the chest is on-screen on the minimap, just outline it.
        if (bx >= 0 && by >= 0 && bx < MM_RANGE_X && by < MM_RANGE_Y) {
          ovCtx.strokeStyle = '#ffd54a';
          ovCtx.lineWidth = 2;
          ovCtx.strokeRect(bx * MM_SCALE - 2, by * MM_SCALE - 2, 5, 5);
        } else {
          // Otherwise draw an "N" marker at the edge pointing toward it
          const dx = best.x - px, dy = best.y - py;
          const ang = Math.atan2(dy, dx);
          const r = Math.min(MM_RANGE_X, MM_RANGE_Y) * 0.45;
          const nx = Math.floor(MM_RANGE_X / 2) + Math.cos(ang) * r;
          const ny = Math.floor(MM_RANGE_Y / 2) + Math.sin(ang) * r;
          ovCtx.fillStyle = '#ffd54a';
          ovCtx.font = 'bold 11px system-ui';
          ovCtx.textAlign = 'center';
          ovCtx.fillText('N', nx * MM_SCALE, ny * MM_SCALE + 4);
        }
      }
    }
  }

  // Tick overlay once per second
  setInterval(drawOverlayMarkers, 500);

  // ============================================================
  // 7. BUFFS / DEBUFFS
  // ============================================================
  const buffs = {
    wellFed: { time: 0, maxTime: 3600 },   // 60 sec
    onFire: { time: 0, maxTime: 240 },     // 4 sec
  };

  // Eating apples and cooked fish triggers well-fed
  // We hook eat() to add the buff after any successful eat.
  const _origEat = eat;
  eat = function (item) {
    const had = stats.hunger >= CONFIG.maxHunger;
    _origEat.call(this, item);
    if (!had) {
      buffs.wellFed.time = buffs.wellFed.maxTime;
    }
  };

  // Lava contact sets on-fire
  const _origUpdatePlayerFire = updatePlayer;
  updatePlayer = function () {
    const feetB = BLOCKS[get(Math.floor(player.x), Math.floor(player.y + 1.6))];
    const bodyB = BLOCKS[get(Math.floor(player.x), Math.floor(player.y + 0.9))];
    const burn = Math.max(feetB.damage || 0, bodyB.damage || 0);
    if (burn > 0) {
      buffs.onFire.time = buffs.onFire.maxTime;
    }
    _origUpdatePlayerFire.call(this);
  };

  // Buff tick
  const _origLoopB4b = loop;
  loop = function () {
    if (buffs.wellFed.time > 0) {
      buffs.wellFed.time--;
      if (stats.health < CONFIG.maxHealth && frame % 5 === 0) {
        stats.health = Math.min(CONFIG.maxHealth, stats.health + 0.2);
      }
    }
    if (buffs.onFire.time > 0) {
      buffs.onFire.time--;
      if (frame % 30 === 0) {
        // Burn damage (armor-ignoring)
        const _saved = damage;
        damage = function (n) { const _d = _origDamageB4; return _d.call(this, n); };
        try { damage(2); } finally { damage = _saved; }
      }
    }
    _origLoopB4b.call(this);
  };

  // Draw buff icons BELOW the minimap
  function drawBuffs() {
    const activeBuffs = [];
    if (buffs.wellFed.time > 0) activeBuffs.push({ name: 'Well-Fed', color: '#ffd54a', t: buffs.wellFed.time, max: buffs.wellFed.maxTime });
    if (buffs.onFire.time > 0) activeBuffs.push({ name: 'On Fire', color: '#ff5a14', t: buffs.onFire.time, max: buffs.onFire.maxTime });
    if (activeBuffs.length === 0) return;

    // Position: below minimap. Minimap is 200x120 at (right:10, top:10).
    // So buffs start at top = 10 + 120 + 30 (compass) + 8 = 168
    const startY = 168;
    const startX = canvas.width - 10 - 200;
    for (let i = 0; i < activeBuffs.length; i++) {
      const b = activeBuffs[i];
      const y = startY + i * 26;
      // Icon box
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      ctx.fillRect(startX, y, 22, 22);
      ctx.fillStyle = b.color;
      ctx.fillRect(startX + 3, y + 3, 16, 16);
      // Timer bar
      const pct = b.t / b.max;
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      ctx.fillRect(startX + 26, y + 4, 80, 14);
      ctx.fillStyle = b.color;
      ctx.fillRect(startX + 28, y + 6, 76 * pct, 10);
      // Label
      ctx.fillStyle = '#fff';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(b.name, startX + 110, y + 15);
    }
  }

  const _origDrawB4b = draw;
  draw = function () {
    _origDrawB4b.call(this);
    drawBuffs();
    // On-fire tint
    if (buffs.onFire.time > 0) {
      const a = 0.15 * Math.min(1, buffs.onFire.time / 60);
      ctx.fillStyle = 'rgba(255,90,20,' + a + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  };

  // ============================================================
  // 8. GROUP ORDER — add 'Armor' if missing (already done in batch3,
  //    harmless to repeat).
  // ============================================================
  if (typeof GROUP_ORDER !== 'undefined' && GROUP_ORDER.indexOf('Armor') < 0) {
    GROUP_ORDER.push('Armor');
  }

  console.log('[MiniTerra Batch 4] loaded — stack cap, creative, sort, bag, sprint, buffs.');
})();