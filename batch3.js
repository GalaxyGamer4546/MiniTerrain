/* ============================================================
   MiniTerra — BATCH 3 (add-on file)
   Adds: armor (4 slots, 3 tiers, Minecraft-style durability),
         fishing with minigame, Wraith + Scorpion enemies,
         damage numbers, chest hover tooltip, repair recipes.
   Loads after batch1.js and batch2.js. No edits to the
   original game code required.
   ============================================================ */
(function () {
  'use strict';

  if (typeof player === 'undefined' || typeof frame === 'undefined') {
    setTimeout(arguments.callee, 50);
    return;
  }

  // ============================================================
  // 1. ARMOR — data, slots, defense
  // ============================================================
  // 4 slots: helmet, chest, legs, boots — Minecraft style.
  const ARMOR_SLOTS = ['helmet', 'chest', 'legs', 'boots'];

  // Armor pieces are tracked as items (like tools), with the slot they occupy.
  const ARMOR_DEFS = {
    leather_helmet: { slot: 'helmet', def: 1, durability: 80,  color: '#8d6e63', tier: 'leather' },
    leather_chest:  { slot: 'chest',  def: 3, durability: 120, color: '#8d6e63', tier: 'leather' },
    leather_legs:   { slot: 'legs',   def: 2, durability: 100, color: '#8d6e63', tier: 'leather' },
    leather_boots:  { slot: 'boots',  def: 1, durability: 70,  color: '#8d6e63', tier: 'leather' },
    iron_helmet:    { slot: 'helmet', def: 2, durability: 200, color: '#e8c4a0', tier: 'iron' },
    iron_chest:     { slot: 'chest',  def: 6, durability: 300, color: '#e8c4a0', tier: 'iron' },
    iron_legs:      { slot: 'legs',   def: 5, durability: 250, color: '#e8c4a0', tier: 'iron' },
    iron_boots:     { slot: 'boots',  def: 2, durability: 180, color: '#e8c4a0', tier: 'iron' },
    diamond_helmet: { slot: 'helmet', def: 3, durability: 500, color: '#40e0ff', tier: 'diamond' },
    diamond_chest:  { slot: 'chest',  def: 8, durability: 750, color: '#40e0ff', tier: 'diamond' },
    diamond_legs:   { slot: 'legs',   def: 6, durability: 600, color: '#40e0ff', tier: 'diamond' },
    diamond_boots:  { slot: 'boots',  def: 3, durability: 450, color: '#40e0ff', tier: 'diamond' },
  };

  // Register armor as items so they show up in the inventory/crafting system.
  for (const k in ARMOR_DEFS) {
    if (!ITEMS[k]) {
      ITEMS[k] = {
        color: ARMOR_DEFS[k].color,
        icon: 'armor',
        armor: ARMOR_DEFS[k].slot,
        durability: ARMOR_DEFS[k].durability,
      };
    }
  }

  // The four equipped pieces. Each is either null or { item, dur }.
  const equipped = {
    helmet: null,
    chest:  null,
    legs:   null,
    boots:  null,
  };

  // ---- Compute total defense from equipped armor ----
  function totalDefense() {
    let d = 0;
    for (const slot of ARMOR_SLOTS) {
      const eq = equipped[slot];
      if (eq && ARMOR_DEFS[eq.item]) d += ARMOR_DEFS[eq.item].def;
    }
    return d;
  }

  // ---- Damage reduction: raw * (1 - def/(def+20)) ----
  function reduceDamage(raw) {
    const def = totalDefense();
    if (def <= 0) return raw;
    return raw * (1 - def / (def + 20));
  }

  // ---- Apply damage to armor durability (each piece loses reduced/2) ----
  function wearArmor(reducedDamage) {
    if (reducedDamage <= 0) return;
    const loss = reducedDamage / 2;
    for (const slot of ARMOR_SLOTS) {
      const eq = equipped[slot];
      if (!eq) continue;
      eq.dur -= loss;
      if (eq.dur <= 0) {
        // Piece breaks
        const brokenName = eq.item.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        equipped[slot] = null;
        toast(brokenName + ' broke!');
      }
    }
  }

  // ============================================================
  // 2. HOOK damage() SO ARMOR APPLIES
  // ============================================================
  // The original damage(n) is a function declaration, reassignable.
  // We wrap it. ignoreArmor = true for lava/water/starve.
  const _origDamage = damage;
  damage = function (n, opts) {
    if (debug.creative) return;                    // god mode still bypasses everything
    if (opts && opts.ignoreArmor) {
      return _origDamage.call(this, n);
    }
    const reduced = reduceDamage(n);
    wearArmor(reduced);
    _origDamage.call(this, reduced);
  };

  // Now we need to make lava / water / starvation pass ignoreArmor.
  // We can't easily modify the original calls, so we intercept the
  // three places that use those damage types by wrapping the
  // functions that call them.

  // Starving: original is inside updateHunger(). Hard to intercept cleanly,
  // so we do a lighter fix: after updateHunger runs, if health dropped and
  // hunger is 0, refund the armor effect. But simpler: just patch the
  // specific branch by re-declaring updateHunger's behavior via a wrapper
  // that suppresses armor for that frame. Simplest: a global "bypass" flag
  // that updateHunger's damage call sets. Since updateHunger calls the
  // global damage(), and our wrapper is now in place, we wrap updateHunger
  // to set the flag right before it runs.
  let bypassArmorThisFrame = false;
  const _origUpdateHunger = updateHunger;
  updateHunger = function () {
    // Detect starving state before the original runs
    const starving = stats.hunger <= 0;
    if (starving) {
      const _saved = damage;
      // Temporarily swap damage with a version that ignores armor
      // (so this frame's starve hit bypasses armor)
      damage = function (n) { return _origDamage.call(this, n); };
      try { _origUpdateHunger.call(this); } finally { damage = _saved; }
      return;
    }
    _origUpdateHunger.call(this);
  };

  // Lava / water damage: inside updatePlayer, it calls damage(burn).
  // We patch it similarly — swap damage during updatePlayer's liquid
  // damage line by wrapping updatePlayer and checking for contact.
  const _origUpdatePlayer = updatePlayer;
  updatePlayer = function () {
    const feetB = BLOCKS[get(Math.floor(player.x), Math.floor(player.y + 1.6))];
    const bodyB = BLOCKS[get(Math.floor(player.x), Math.floor(player.y + 0.9))];
    const burn = Math.max(feetB.damage || 0, bodyB.damage || 0);
    if (burn > 0) {
      // Swap in an armor-bypassing damage for this frame
      const _saved = damage;
      damage = function (n) { return _origDamage.call(this, n); };
      try { _origUpdatePlayer.call(this); } finally { damage = _saved; }
      return;
    }
    // Drowning: also armor-bypassing
    const underwater = BLOCKS[get(Math.floor(player.x), Math.floor(player.y + 0.3))].liquid;
    if (underwater && stats.oxygen === 0) {
      const _saved = damage;
      damage = function (n) { return _origDamage.call(this, n); };
      try { _origUpdatePlayer.call(this); } finally { damage = _saved; }
      return;
    }
    _origUpdatePlayer.call(this);
  };

  // ============================================================
  // 3. RECIPES — armor pieces and repairs
  // ============================================================
  // Adding directly to RECIPES so the existing crafting UI picks them up.
  const NEW_RECIPES = [
    // Leather tier
    { makes: 'leather_helmet', amount: 1, cost: { gel: 4, silk: 2 },             cat: ['Armor'] },
    { makes: 'leather_chest',  amount: 1, cost: { gel: 8, silk: 3 },             cat: ['Armor'] },
    { makes: 'leather_legs',   amount: 1, cost: { gel: 6, silk: 2 },             cat: ['Armor'] },
    { makes: 'leather_boots',  amount: 1, cost: { gel: 4, silk: 1 },             cat: ['Armor'] },
    // Iron tier
    { makes: 'iron_helmet',    amount: 1, cost: { iron: 5 },                     cat: ['Armor'] },
    { makes: 'iron_chest',     amount: 1, cost: { iron: 8 },                     cat: ['Armor'] },
    { makes: 'iron_legs',      amount: 1, cost: { iron: 7 },                     cat: ['Armor'] },
    { makes: 'iron_boots',     amount: 1, cost: { iron: 4 },                     cat: ['Armor'] },
    // Diamond tier
    { makes: 'diamond_helmet', amount: 1, cost: { diamond: 5 },                  cat: ['Armor'] },
    { makes: 'diamond_chest',  amount: 1, cost: { diamond: 8 },                  cat: ['Armor'] },
    { makes: 'diamond_legs',   amount: 1, cost: { diamond: 7 },                  cat: ['Armor'] },
    { makes: 'diamond_boots',  amount: 1, cost: { diamond: 4 },                  cat: ['Armor'] },
    // Repairs (restore equipped piece to full) — implemented as special items
    { makes: 'repair_kit',     amount: 1, cost: { planks: 2 },                   cat: ['Armor'] },
    // Fishing rod
    { makes: 'fishing_rod',    amount: 1, cost: { planks: 3, silk: 2 },          cat: ['Tools'] },
  ];
  for (const r of NEW_RECIPES) RECIPES.push(r);

  // Fishing rod is an item with no block, no tool — just a flag
  if (!ITEMS.fishing_rod) {
    ITEMS.fishing_rod = { color: '#8d6e63', icon: 'fishingrod', fishrod: true };
  }

  // ============================================================
  // 4. TWO NEW ENEMIES: Wraith and Scorpion
  // ============================================================
  if (!ENEMIES.wraith) {
    ENEMIES.wraith = {
      name: 'Wraith', ai: 'fly', color: '#b0bec5', w: 0.9, h: 1.2,
      hp: 55, speed: 0.06, damage: 16, minDepth: 60,
      drops: { ectoplasm: [1, 2] },
      phaseWalls: true,
    };
  }
  if (!ENEMIES.scorpion) {
    ENEMIES.scorpion = {
      name: 'Scorpion', ai: 'crawl', color: '#5d4037', w: 1.0, h: 0.6,
      hp: 28, speed: 0.08, damage: 11,
      biome: 'desert', drops: { chitin: [1, 2] },
    };
  }
  if (!ITEMS.ectoplasm) ITEMS.ectoplasm = { color: '#b0bec5', icon: 'gem' };
  if (!ITEMS.chitin) ITEMS.chitin = { color: '#5d4037', icon: 'lump' };

  // Wraith needs to ignore walls. We patch moveEnemy() so that
  // phasing enemies skip collision checks.
  const _origMoveEnemy = moveEnemy;
  moveEnemy = function (e, mx, my, avoidLiquid) {
    const d = ENEMIES[e.type];
    if (d && d.phaseWalls) {
      // No collision at all — move freely
      e.hitX = e.hitY = false;
      e.x += mx;
      e.y += my;
      return;
    }
    return _origMoveEnemy.call(this, e, mx, my, avoidLiquid);
  };

  // Scorpion biome restriction — patch spawnEnemy so desert is checked.
  const _origSpawnEnemy = spawnEnemy;
  spawnEnemy = function () {
    // We let the original handle most spawns, but first try our scorpion
    // on the desert surface.
    if (Math.random() < 0.4) {
      const px = Math.floor(player.x);
      const biome = (typeof biomeCol !== 'undefined') ? biomeCol[px] : null;
      const depth = player.y - (heights[px] || 0);
      if (biome === 'desert' && depth > -3 && depth < 8) {
        for (let tries = 0; tries < 8; tries++) {
          const ang = Math.random() * 6.283, r = SPAWN.minDist + Math.random() * (SPAWN.maxDist - SPAWN.minDist);
          const x = Math.floor(player.x + Math.cos(ang) * r);
          const y = Math.floor(player.y + Math.sin(ang) * r);
          if (!world[x] || y < 2 || y > H - 3) continue;
          if (biomeCol[x] !== 'desert') continue;
          const onSurface = get(x, y) === 'air' && isSolid(x, y + 1);
          if (onSurface) {
            enemies.push(makeEnemy('scorpion', x + 0.5, y));
            return;
          }
        }
      }
    }
    return _origSpawnEnemy.call(this);
  };

  // ============================================================
  // 5. ARMOR SHOP UI — 4 slots in the inventory screen
  // ============================================================
  // Wait for invbox to exist.
  function setupArmorUI() {
    const invbox = document.querySelector('#inv .invbox');
    if (!invbox) { setTimeout(setupArmorUI, 100); return; }

    const armorRow = document.createElement('div');
    armorRow.id = 'b3armor';
    armorRow.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:100px;';
    armorRow.innerHTML = '<h3 style="margin:0 0 4px;font-size:14px;">Armor</h3>';
    const slotsWrap = document.createElement('div');
    slotsWrap.style.cssText = 'display:flex;gap:6px;';
    armorRow.appendChild(slotsWrap);
    for (const slot of ARMOR_SLOTS) {
      const s = document.createElement('div');
      s.className = 'b3armor-slot';
      s.dataset.armorSlot = slot;
      s.style.cssText = 'width:48px;height:48px;border:3px solid #555;background:rgba(0,0,0,.4);' +
                        'border-radius:4px;position:relative;cursor:pointer;display:flex;' +
                        'align-items:center;justify-content:center;color:#888;font-size:10px;';
      s.textContent = slot.charAt(0).toUpperCase();
      slotsWrap.appendChild(s);
    }
    // Insert after the inventory grid block
    const left = invbox.querySelector('.invleft');
    if (left) left.appendChild(armorRow);
    else invbox.appendChild(armorRow);

    // Click handler for equipping / unequipping
    slotsWrap.addEventListener('click', function (e) {
      const el = e.target.closest('.b3armor-slot');
      if (!el) return;
      const slot = el.dataset.armorSlot;
      const eq = equipped[slot];

      // If a slot is picked from inventory and it matches this slot, equip it.
      // Otherwise, unequip whatever is here back into inventory.
      if (pickSlot >= 0 && slots[pickSlot]) {
        const item = slots[pickSlot];
        const def = ARMOR_DEFS[item];
        if (def && def.slot === slot) {
          // Swap: current equipped goes back to inventory slot
          const oldEq = equipped[slot];
          if (oldEq) {
            inv[oldEq.item] = (inv[oldEq.item] || 0) + 1;
            dur[oldEq.item] = oldEq.dur;
          }
          equipped[slot] = { item: item, dur: dur[item] || def.durability };
          inv[item] = (inv[item] || 0) - 1;
          if (inv[item] <= 0) delete inv[item];
          delete dur[item];
          pickSlot = -1;
          refreshUI();
          refreshArmorUI();
          return;
        }
      }
      // Otherwise, unequip
      if (eq) {
        inv[eq.item] = (inv[eq.item] || 0) + 1;
        dur[eq.item] = eq.dur;
        equipped[slot] = null;
        refreshUI();
        refreshArmorUI();
      }
    });
  }

  function refreshArmorUI() {
    const wrap = document.querySelector('#b3armor');
    if (!wrap) return;
    const els = wrap.querySelectorAll('.b3armor-slot');
    for (const el of els) {
      const slot = el.dataset.armorSlot;
      const eq = equipped[slot];
      el.innerHTML = '';
      if (eq) {
        const def = ARMOR_DEFS[eq.item];
        const col = def ? def.color : '#fff';
        el.style.borderColor = col;
        const icon = document.createElement('div');
        icon.style.cssText = 'width:32px;height:32px;background:' + col + ';border-radius:4px;';
        el.appendChild(icon);
        // Durability bar
        const bar = document.createElement('div');
        const pct = Math.max(0, Math.min(1, eq.dur / def.durability));
        bar.style.cssText = 'position:absolute;bottom:2px;left:4px;right:4px;height:3px;background:#333;border-radius:2px;';
        const fill = document.createElement('div');
        fill.style.cssText = 'height:100%;width:' + (pct * 100) + '%;background:' + (pct > 0.3 ? '#7ee787' : '#ff7b72') + ';border-radius:2px;';
        bar.appendChild(fill);
        el.appendChild(bar);
      } else {
        el.style.borderColor = '#555';
        el.textContent = slot.charAt(0).toUpperCase();
        el.style.color = '#888';
      }
    }
    // Show total defense somewhere
    const h3 = wrap.querySelector('h3');
    if (h3) h3.textContent = 'Armor  (def ' + totalDefense() + ')';
  }

  setupArmorUI();

  // Refresh armor UI whenever the inventory refreshes
  const _origRefreshUI = refreshUI;
  refreshUI = function () {
    _origRefreshUI.call(this);
    refreshArmorUI();
  };

  // ============================================================
  // 6. FISHING
  // ============================================================
  const fishing = {
    active: false,          // bobber is out
    x: 0, y: 0,             // bobber position (world coords)
    castTime: 0,
    biteTime: 0,            // when the bite happens
    hasBite: false,
    minigame: false,
    markerPos: 0,           // 0..1
    markerDir: 1,
    markerSpeed: 0.012,
    greenLo: 0.42, greenHi: 0.58,
    yellowLo: 0.25, yellowHi: 0.75,
    result: null,           // 'perfect' | 'normal' | 'miss'
    resultTime: 0,
  };

  function startFishing() {
    // Cast toward the mouse cursor
    const mx = (mouse.x + camX()) / TS, my = (mouse.y + camY()) / TS;
    const dist = Math.hypot(mx - player.x, my - player.y);
    if (dist > 12) return;   // too far
    // Find the water surface: the first water tile along the ray
    const steps = 24;
    let wx = player.x, wy = player.y + 0.9;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const tx = player.x + (mx - player.x) * t;
      const ty = (player.y + 0.9) + (my - (player.y + 0.9)) * t;
      if (get(Math.floor(tx), Math.floor(ty)) === 'water') {
        wx = tx; wy = ty; break;
      }
    }
    if (get(Math.floor(wx), Math.floor(wy)) !== 'water') return;   // no water hit
    fishing.active = true;
    fishing.x = wx; fishing.y = wy;
    fishing.castTime = frame;
    fishing.biteTime = frame + 180 + Math.random() * 300;   // 3-8 seconds
    fishing.hasBite = false;
    fishing.minigame = false;
    fishing.result = null;
  }

  function reelIn() {
    if (!fishing.active) return;
    if (fishing.minigame) {
      // Player clicked during minigame — evaluate
      const m = fishing.markerPos;
      let result;
      if (m >= fishing.greenLo && m <= fishing.greenHi) result = 'perfect';
      else if (m >= fishing.yellowLo && m <= fishing.yellowHi) result = 'normal';
      else result = 'miss';
      fishing.minigame = false;
      fishing.result = result;
      fishing.resultTime = frame;
      // Give loot
      if (result === 'perfect') {
        const r = Math.random();
        if (r < 0.08) { add('diamond', 1); toast('Fishing: Diamond!'); }
        else if (r < 0.20) { add('gold', 1 + Math.floor(Math.random() * 2)); toast('Fishing: Gold!'); }
        else if (r < 0.35) { add('iron', 1 + Math.floor(Math.random() * 2)); toast('Fishing: Iron'); }
        else if (r < 0.6) { add('raw_fish', 2); toast('Fishing: 2 Raw Fish'); }
        else { add('raw_fish', 1); add('jelly', 1); toast('Fishing: Raw Fish + Jelly'); }
      } else if (result === 'normal') {
        if (Math.random() < 0.7) { add('raw_fish', 1); toast('Fishing: Raw Fish'); }
        else { add('jelly', 1); toast('Fishing: Jelly'); }
      } else {
        toast('The fish got away!');
      }
      fishing.active = false;
    } else if (fishing.hasBite) {
      // Started the minigame
      fishing.minigame = true;
      fishing.markerPos = 0;
      fishing.markerDir = 1;
      fishing.hasBite = false;
    } else {
      // Reel in early — cancel
      fishing.active = false;
    }
  }

  // Right-click while holding rod = cast or reel
  const _origPlaceB3 = place;
  place = function () {
    const held = heldItem();
    if (held === 'fishing_rod') {
      if (!fishing.active) startFishing();
      else if (fishing.hasBite || fishing.minigame) reelIn();
      else reelIn();   // cancel
      return;
    }
    _origPlaceB3();
  };

  // Also allow left-click on the minigame bar (handled via mousedown below).
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (fishing.minigame) {
      reelIn();
    }
  });

  // Tick fishing state each frame
  function updateFishing() {
    if (!fishing.active) return;
    if (!fishing.hasBite && !fishing.minigame && frame >= fishing.biteTime) {
      fishing.hasBite = true;
    }
    if (fishing.minigame) {
      fishing.markerPos += fishing.markerDir * fishing.markerSpeed;
      if (fishing.markerPos >= 1) { fishing.markerPos = 1; fishing.markerDir = -1; }
      if (fishing.markerPos <= 0) { fishing.markerPos = 0; fishing.markerDir = 1; }
      // Timeout: if the player never clicks, after 3 sec it's a miss
      if (frame - fishing.castTime > 3000) { reelIn(); }
    }
  }

  // Draw the bobber
  const _origDrawB3 = draw;
  draw = function () {
    _origDrawB3.call(this);
    if (!fishing.active) return;
    const cx = camX(), cy = camY();
    const px = fishing.x * TS - cx, py = fishing.y * TS - cy;
    // Bobber
    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py, 6, Math.PI, 0);
    ctx.fill();
    // Line to player
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(player.x * TS - cx, player.y * TS - cy + TS * 0.9);
    ctx.lineTo(px, py);
    ctx.stroke();
    // Bite indicator
    if (fishing.hasBite) {
      ctx.fillStyle = '#ffd54a';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', px, py - 12);
    }
    // Minigame bar (bottom-center)
    if (fishing.minigame) {
      const barW = 400, barH = 40;
      const bx = (canvas.width - barW) / 2, by = canvas.height - 160;
      // Background
      ctx.fillStyle = 'rgba(0,0,0,.85)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.strokeStyle = '#555c6e';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, barW, barH);
      // Yellow zone
      ctx.fillStyle = 'rgba(255,214,74,.25)';
      ctx.fillRect(bx + fishing.yellowLo * barW, by, (fishing.yellowHi - fishing.yellowLo) * barW, barH);
      // Green zone
      ctx.fillStyle = 'rgba(76,175,80,.55)';
      ctx.fillRect(bx + fishing.greenLo * barW, by, (fishing.greenHi - fishing.greenLo) * barW, barH);
      // Marker
      const mx = bx + fishing.markerPos * barW;
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx - 2, by - 4, 4, barH + 8);
      // Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click when the marker is in the green!', canvas.width / 2, by - 12);
    }
    // Result flash
    if (fishing.result && frame - fishing.resultTime < 90) {
      const t = 1 - (frame - fishing.resultTime) / 90;
      ctx.globalAlpha = t;
      ctx.fillStyle = fishing.result === 'perfect' ? '#4caf50' : fishing.result === 'normal' ? '#ffd54a' : '#f44';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const txt = fishing.result === 'perfect' ? 'PERFECT!' : fishing.result === 'normal' ? 'Caught!' : 'Missed!';
      ctx.fillText(txt, canvas.width / 2, canvas.height / 2);
      ctx.globalAlpha = 1;
    }
  };

  // Hook into the game loop for fishing updates
  const _origLoopB3 = loop;
  loop = function () {
    if (!invOpen && !(typeof paused !== 'undefined' && paused)) {
      updateFishing();
    }
    _origLoopB3.call(this);
  };

  // ============================================================
  // 7. DAMAGE NUMBERS
  // ============================================================
  const dmgNumbers = [];   // { x, y, vy, text, color, life }
  function spawnDmgNumber(worldX, worldY, amount, color) {
    dmgNumbers.push({
      x: worldX, y: worldY,
      vy: -0.045,
      text: Math.round(amount).toString(),
      color: color || '#fff',
      life: 50, max: 50,
    });
  }
  function updateDmgNumbers() {
    for (let i = dmgNumbers.length - 1; i >= 0; i--) {
      const n = dmgNumbers[i];
      n.y += n.vy;
      n.vy += 0.001;
      n.life--;
      if (n.life <= 0) dmgNumbers.splice(i, 1);
    }
  }
  function drawDmgNumbers() {
    const cx = camX(), cy = camY();
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const n of dmgNumbers) {
      const a = n.life / n.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#000';
      ctx.fillText(n.text, n.x * TS - cx + 1, n.y * TS - cy + 1);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x * TS - cx, n.y * TS - cy);
    }
    ctx.globalAlpha = 1;
  }

  // Hook attack() to spawn damage numbers
  const _origAttack = attack;
  attack = function () {
    const result = _origAttack.call(this);
    return result;
  };

  // Simpler approach: watch enemies for HP drops via a per-frame snapshot.
  const prevHp = new WeakMap();
  function trackEnemyDamage() {
    if (typeof enemies === 'undefined') return;
    for (const e of enemies) {
      const prev = prevHp.get(e);
      if (prev !== undefined && prev > e.hp) {
        const dmg = prev - e.hp;
        spawnDmgNumber(e.x, e.y - 0.3, dmg, e.elite ? '#ffd54a' : '#ff7b72');
      }
      prevHp.set(e, e.hp);
    }
  }

  const _origLoopB3b = loop;
  loop = function () {
    trackEnemyDamage();
    updateDmgNumbers();
    _origLoopB3b.call(this);
  };

  const _origDrawB3b = draw;
  draw = function () {
    _origDrawB3b.call(this);
    drawDmgNumbers();
  };

  // ============================================================
  // 8. CHEST HOVER TOOLTIP
  // ============================================================
  const _origDrawB3c = draw;
  draw = function () {
    _origDrawB3c.call(this);
    // Check if the cursor is over a chest
    const t = target();
    if (get(t.x, t.y) === 'chest' && inReach(t)) {
      const cx = camX(), cy = camY();
      const px = t.x * TS - cx, py = t.y * TS - cy - 24;
      const text = 'Chest — right-click to open';
      ctx.font = '12px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 12;
      ctx.fillStyle = 'rgba(0,0,0,.8)';
      ctx.fillRect(px + TS / 2 - w / 2, py - 14, w, 18);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(text, px + TS / 2, py);
    }
  };

  // ============================================================
  // 9. REPAIR SYSTEM
  // ============================================================
  // Right-clicking a repair_kit repairs your lowest-durability armor piece.
  // We intercept place() when the held item is a repair_kit.
  const _origPlaceB3b = place;
  place = function () {
    const held = heldItem();
    if (held === 'repair_kit') {
      // Find the equipped piece with the lowest durability fraction
      let worst = null, worstFrac = 1.1;
      for (const slot of ARMOR_SLOTS) {
        const eq = equipped[slot];
        if (!eq) continue;
        const def = ARMOR_DEFS[eq.item];
        const frac = eq.dur / def.durability;
        if (frac < worstFrac) { worstFrac = frac; worst = slot; }
      }
      if (!worst) { toast('Nothing to repair'); return; }
      const eq = equipped[worst];
      const def = ARMOR_DEFS[eq.item];
      eq.dur = def.durability;
      if (!debug.creative) inv['repair_kit']--;
      if (inv['repair_kit'] <= 0) delete inv['repair_kit'];
      toast('Repaired ' + eq.item.replace(/_/g, ' '));
      refreshUI();
      refreshArmorUI();
      return;
    }
    _origPlaceB3b.call(this);
  };

  // ============================================================
  // 10. CLEAN UP NEW RECIPES CATEGORY
  // ============================================================
  if (typeof GROUP_ORDER !== 'undefined' && GROUP_ORDER.indexOf('Armor') < 0) {
    GROUP_ORDER.push('Armor');
  }

  console.log('[MiniTerra Batch 3] loaded — armor, fishing, wraith, scorpion.');
})();