/* ============================================================
   MiniTerra — BATCH 7 (v2 — crash fix)
   Adds: sound effects, ambient drone, 2 new enemies,
         The Molten Wyrm boss, Molten Bait, merchant NPC,
         inventory tooltips, master volume slider.
   Loads after batch1–6.
   ============================================================ */
(function () {
  'use strict';

  if (typeof player === 'undefined' || typeof frame === 'undefined') {
    setTimeout(arguments.callee, 50);
    return;
  }

  // Small helper: run a section, log failures, keep going.
  function section(name, fn) {
    try { fn(); } catch (e) { console.error('[Batch 7] ' + name + ' failed:', e.message); }
  }

  // ============================================================
  // 1. AUDIO ENGINE
  // ============================================================
  let audioCtx = null;
  let masterGain = null;
  let ambientOsc = null;
  let ambientGain = null;
  let ambientFilter = null;
  let crackleGain = null;
  let unlocked = false;

  const VOLUME_KEY = 'miniterra.volume.v1';
  let masterVolume = 0.6;
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY));
    if (!isNaN(v) && v >= 0 && v <= 1) masterVolume = v;
  } catch (e) {}

  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = masterVolume;
      masterGain.connect(audioCtx.destination);

      ambientOsc = audioCtx.createOscillator();
      ambientOsc.type = 'sine';
      ambientOsc.frequency.value = 55;
      ambientFilter = audioCtx.createBiquadFilter();
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.value = 300;
      ambientGain = audioCtx.createGain();
      ambientGain.gain.value = 0.04;
      ambientOsc.connect(ambientFilter);
      ambientFilter.connect(ambientGain);
      ambientGain.connect(masterGain);
      ambientOsc.start();

      crackleGain = audioCtx.createGain();
      crackleGain.gain.value = 0;
      crackleGain.connect(masterGain);
      console.log('[Batch 7] Audio initialized, state =', audioCtx.state);
    } catch (e) {
      console.warn('[Batch 7] Audio init failed:', e.message);
    }
  }

  function unlockAudio() {
    if (unlocked && audioCtx && audioCtx.state === 'running') return;
    unlocked = true;
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(function () {
        console.log('[Batch 7] Audio resumed, state =', audioCtx.state);
      });
    }
  }
  // Attach to multiple events — some are swallowed by the canvas
  addEventListener('keydown', unlockAudio);
  addEventListener('keyup', unlockAudio);
  addEventListener('mousedown', unlockAudio);
  addEventListener('mouseup', unlockAudio);
  addEventListener('click', unlockAudio);
  addEventListener('touchstart', unlockAudio);
  addEventListener('pointerdown', unlockAudio);

  function playTone(freq, dur, type, vol, sweepTo) {
    if (!audioCtx || !masterGain) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, now);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), now + dur);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol != null ? vol : 0.15, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(masterGain);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  function playNoise(dur, vol, lowpassHz) {
    if (!audioCtx || !masterGain) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const bufSize = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lowpassHz || 1200;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(vol != null ? vol : 0.12, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filt); filt.connect(g); g.connect(masterGain);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  const SFX = {
    mine:   function () { playNoise(0.06, 0.10, 900); playTone(120, 0.05, 'square', 0.04); },
    place:  function () { playTone(220, 0.08, 'square', 0.10, 160); playNoise(0.05, 0.06, 900); },
    breakB: function () { playNoise(0.14, 0.16, 600); playTone(90, 0.12, 'sawtooth', 0.07, 60); },
    hit:    function () { playNoise(0.09, 0.18, 2200); playTone(300, 0.06, 'square', 0.06, 180); },
    hurt:   function () { playTone(440, 0.20, 'sawtooth', 0.16, 180); },
    jump:   function () { playTone(280, 0.09, 'square', 0.07, 420); },
    land:   function () { playTone(160, 0.06, 'square', 0.06, 120); },
    pickup: function () { playTone(880, 0.07, 'sine', 0.10, 1400); },
    eat:    function () { playNoise(0.10, 0.08, 500); playTone(180, 0.08, 'triangle', 0.05); },
    chest:  function () { playTone(400, 0.10, 'triangle', 0.10, 600); setTimeout(function () { playTone(600, 0.12, 'triangle', 0.08, 900); }, 80); },
    roar:   function () { playTone(60, 0.9, 'sawtooth', 0.20, 40); playNoise(0.9, 0.10, 400); },
  };

  function updateAmbient() {
    if (!ambientOsc || !audioCtx) return;
    const px = Math.floor(player.x), py = Math.floor(player.y + 0.9);
    const depth = py - (heights[px] || 0);
    let targetFreq, targetFilter, targetGain;
    if (depth < -20) { targetFreq = 80; targetFilter = 500; targetGain = 0.05; }
    else if (depth < 20) { targetFreq = 65; targetFilter = 400; targetGain = 0.045; }
    else if (depth < 100) { targetFreq = 50; targetFilter = 250; targetGain = 0.05; }
    else if (depth < 200) { targetFreq = 40; targetFilter = 180; targetGain = 0.06; }
    else { targetFreq = 30; targetFilter = 120; targetGain = 0.07; }
    const t = audioCtx.currentTime;
    ambientOsc.frequency.linearRampToValueAtTime(targetFreq, t + 1.0);
    ambientFilter.frequency.linearRampToValueAtTime(targetFilter, t + 1.0);
    ambientGain.gain.linearRampToValueAtTime(targetGain, t + 1.0);
    let lavaNear = false;
    const r = 10;
    for (let x = px - r; x <= px + r && !lavaNear; x++) {
      if (!world[x]) continue;
      for (let y = py - r; y <= py + r; y++) {
        if (world[x][y] === 'lava') { lavaNear = true; break; }
      }
    }
    if (crackleGain) crackleGain.gain.linearRampToValueAtTime(lavaNear ? 0.03 : 0, t + 0.8);
  }
  function lavaCrackleTick() {
    if (!audioCtx || !crackleGain || crackleGain.gain.value < 0.005) return;
    if (Math.random() < 0.15) playNoise(0.05, 0.04, 600);
  }
  setInterval(lavaCrackleTick, 200);

  // ---- Volume slider — find the pause menu robustly ----
  section('volume slider', function () {
    function findPauseBox() {
      // batch1's pause menu is #b1pause; its inner box is the first div child.
      let pause = document.getElementById('b1pause') || document.getElementById('pause');
      if (!pause) return null;
      // Try .pbox first, then first inner div
      let box = pause.querySelector('.pbox');
      if (!box) box = pause.querySelector('div');
      return box;
    }
    function addVolumeSlider() {
      const box = findPauseBox();
      if (!box) { setTimeout(addVolumeSlider, 300); return; }
      if (box.querySelector('#b7vol')) return;
      const wrap = document.createElement('div');
      wrap.id = 'b7vol';
      wrap.style.cssText = 'margin-top:14px;font-size:12px;color:#bbb;';
      wrap.innerHTML = 'Volume: <b id="b7volval">' + Math.round(masterVolume * 100) + '%</b><br>' +
                      '<input type="range" id="b7volslider" min="0" max="100" step="1" value="' + Math.round(masterVolume * 100) + '" style="width:100%;margin-top:4px;">';
      box.appendChild(wrap);
      wrap.querySelector('#b7volslider').addEventListener('input', function (e) {
        masterVolume = (+e.target.value) / 100;
        if (masterGain) masterGain.gain.value = masterVolume;
        document.getElementById('b7volval').textContent = e.target.value + '%';
        try { localStorage.setItem(VOLUME_KEY, String(masterVolume)); } catch (err) {}
      });
    }
    addVolumeSlider();
  });

  // ============================================================
  // 2. HOOK SOUNDS
  // ============================================================
  section('sound hooks', function () {
    let lastMiningT = 0;
    let lastTargetBlock = null;

    const _origLoop7 = loop;
    loop = function () {
      if (typeof mining !== 'undefined' && mining.t > lastMiningT + 0.5) SFX.mine();
      lastMiningT = (typeof mining !== 'undefined') ? mining.t : 0;
      const t = (typeof target === 'function') ? target() : null;
      if (t) {
        const cur = get(t.x, t.y);
        if (lastTargetBlock && lastTargetBlock.name !== 'air' && cur === 'air' &&
            lastTargetBlock.x === t.x && lastTargetBlock.y === t.y) SFX.breakB();
        lastTargetBlock = { x: t.x, y: t.y, name: cur };
      }
      updateAmbient();
      _origLoop7.call(this);
    };

    const _origPlace7 = place;
    place = function () {
      const t = target();
      const before = get(t.x, t.y);
      _origPlace7.call(this);
      const after = get(t.x, t.y);
      if (before !== after && after !== 'air') SFX.place();
    };

    let lastHurtFrame = -9999;
    const _origDamage7 = damage;
    damage = function (n, opts) {
      if (frame - lastHurtFrame > 5 && n > 0) { SFX.hurt(); lastHurtFrame = frame; }
      return _origDamage7.call(this, n, opts);
    };

    const _origUpdatePlayer7 = updatePlayer;
    updatePlayer = function () {
      const before = player.ground;
      const beforeVy = player.vy;
      _origUpdatePlayer7.call(this);
      if (before && player.vy < -0.1) SFX.jump();
      if (!before && player.ground && beforeVy > 0.1) SFX.land();
    };

    let lastChestFrame = -9999;
    let addBurst = 0, addBurstReset = 0;
    const _origAdd7 = add;
    add = function (item, n) {
      addBurst++;
      if (addBurstReset === 0) addBurstReset = frame + 5;
      if (frame > addBurstReset) { addBurst = 1; addBurstReset = frame + 5; }
      if (addBurst === 3) { SFX.chest(); lastChestFrame = frame; }
      else if (frame - lastChestFrame > 8) SFX.pickup();
      return _origAdd7.call(this, item, n);
    };

    const _origEat7 = eat;
    eat = function (item) {
      SFX.eat();
      return _origEat7.call(this, item);
    };
  });

  // ============================================================
  // 3. NEW ENEMIES
  // ============================================================
  section('new enemies', function () {
    if (!ENEMIES.stalker) {
      ENEMIES.stalker = {
        name: 'Stalker', ai: 'crawl', color: '#37474f',
        w: 1.2, h: 1.6, hp: 80, speed: 0.10, damage: 20, minDepth: 40,
        drops: { obsidian: [0, 1], silk: [1, 2] },
      };
    }
    if (!ENEMIES.wyvern) {
      ENEMIES.wyvern = {
        name: 'Wyvern', ai: 'fly', color: '#7e57c2',
        w: 1.6, h: 1.0, hp: 60, speed: 0.11, damage: 16, sky: true,
        drops: { wyvern_scale: [1, 2] },
      };
    }
    if (!ITEMS.wyvern_scale) ITEMS.wyvern_scale = { color: '#7e57c2', icon: 'gem' };
  });

  // ============================================================
  // 4. BOSS — THE MOLTEN WYRM
  // ============================================================
  section('molten wyrm', function () {
    if (!ENEMIES.molten_wyrm) {
      ENEMIES.molten_wyrm = {
        name: 'The Molten Wyrm', ai: 'crawl', color: '#d84315',
        w: 3.0, h: 3.6, hp: 600, speed: 0.06, damage: 24,
        minDepth: 100, boss: true, lavaAura: true,
        drops: { molten_core: [1, 1], obsidian: [8, 15], gold: [4, 8] },
      };
    }
    if (!ITEMS.molten_core) ITEMS.molten_core = { color: '#d84315', icon: 'gem' };
    if (!ITEMS.molten_bait) ITEMS.molten_bait = { color: '#bf360c', icon: 'lump', bait: true };
    if (!RECIPES.find(function (r) { return r.makes === 'molten_bait'; })) {
      RECIPES.push({ makes: 'molten_bait', amount: 1, cost: { obsidian: 3, gold: 1 }, cat: ['Bosses'] });
    }

    const _origPlace7b = place;
    place = function () {
      const held = heldItem();
      if (held === 'molten_bait') {
        const depth = player.y - (heights[Math.floor(player.x)] || 0);
        if (depth < 100) { toast('The bait must be used below depth 100'); return; }
        const sx = Math.floor(player.x) + 6;
        const sy = Math.floor(player.y);
        toast('You feel a rumble...');
        setTimeout(function () {
          enemies.push(makeEnemy('molten_wyrm', sx + 0.5, sy));
          SFX.roar();
        }, 800);
        if (!debug.creative) {
          inv.molten_bait -= 1;
          if (inv.molten_bait <= 0) delete inv.molten_bait;
          refreshUI();
        }
        return;
      }
      _origPlace7b.call(this);
    };

    const _origSpawnEnemy7 = spawnEnemy;
    spawnEnemy = function () {
      if (Math.random() < 0.03) {
        const px = Math.floor(player.x);
        const depth = player.y - (heights[px] || 0);
        if (depth > 100 && depth < 200) {
          const hasWyrm = enemies.some(function (e) { return e.type === 'molten_wyrm'; });
          if (!hasWyrm) {
            for (let tries = 0; tries < 8; tries++) {
              const ang = Math.random() * 6.283, r = 20 + Math.random() * 15;
              const x = Math.floor(player.x + Math.cos(ang) * r);
              const y = Math.floor(player.y + Math.sin(ang) * r);
              if (!world[x] || y < 2 || y > H - 4) continue;
              if (isSolid(x, y) || isSolid(x, y + 1) || isSolid(x, y + 2)) continue;
              enemies.push(makeEnemy('molten_wyrm', x + 0.5, y));
              SFX.roar();
              toast('The Molten Wyrm awakens!');
              return;
            }
          }
        }
      }
      return _origSpawnEnemy7.call(this);
    };

    const _origUpdateEnemies7 = updateEnemies;
    updateEnemies = function () {
      for (const e of enemies) {
        const d = ENEMIES[e.type];
        if (!d || !d.lavaAura) continue;
        const dx = player.x - e.x, dy = (player.y + 0.9) - (e.y + e.h / 2);
        if (Math.hypot(dx, dy) < 3 && frame % 30 === 0) {
          const _saved = damage;
          damage = function (n) { return _origDamage7(n); };
          try { damage(1.5); } finally { damage = _saved; }
        }
      }
      _origUpdateEnemies7.call(this);
    };

    const _origMakeEnemy7 = makeEnemy;
    makeEnemy = function (type, x, y, forceElite) {
      const e = _origMakeEnemy7.call(this, type, x, y, forceElite);
      if (ENEMIES[type] && ENEMIES[type].boss) { e.boss = true; e.elite = false; }
      return e;
    };
  });

  // ============================================================
  // 5. MERCHANT NPC
  // ============================================================
  section('merchant', function () {
    const MERCHANT_KEY = 'miniterra.merchant.v1';
    let merchant = null;
    try { merchant = JSON.parse(localStorage.getItem(MERCHANT_KEY) || 'null'); } catch (e) { merchant = null; }
    if (!merchant) {
      const mx = Math.floor(spawn.x) + 4;
      let my = heights[mx] || CONFIG.surfaceLevel;
      while (my > 0 && isSolid(mx, my - 1)) my--;
      merchant = { x: mx + 0.5, y: my - 2 };
      try { localStorage.setItem(MERCHANT_KEY, JSON.stringify(merchant)); } catch (e) {}
    }

    const TRADES = [
      { give: { coal: 20 },    get: { iron: 1 } },
      { give: { iron: 20 },    get: { gold: 1 } },
      { give: { gold: 20 },    get: { diamond: 1 } },
      { give: { apple: 5 },    get: { cooked_fish: 1 } },
      { give: { gel: 10 },     get: { silk: 5 } },
      { give: { diamond: 3 },  get: { ruby: 1 } },
      { give: { warden_core: 1 }, get: { mythril: 5 } },
      { give: { dirt: 5 },     get: { coal: 1 } },
    ];

    function openMerchant() {
      let el = document.getElementById('b7merchant');
      if (!el) {
        el = document.createElement('div');
        el.id = 'b7merchant';
        el.style.cssText = 'position:fixed;inset:0;background:rgba(8,10,16,.82);display:flex;align-items:center;justify-content:center;z-index:18;font-family:system-ui,sans-serif;';
        document.body.appendChild(el);
      }
      el.style.display = 'flex';
      el.innerHTML = '<div style="background:#2b2f3a;border:3px solid #555c6e;border-radius:12px;padding:20px;color:#fff;max-width:520px;max-height:80vh;overflow:auto;">' +
        '<h2 style="margin:0 0 10px;">Merchant</h2>' +
        '<div id="b7trades"></div>' +
        '<button id="b7mclose" style="margin-top:14px;padding:8px 16px;cursor:pointer;background:#3a3f4d;color:#fff;border:2px solid #555c6e;border-radius:6px;">Close</button>' +
        '</div>';
      const trades = el.querySelector('#b7trades');
      TRADES.forEach(function (tr) {
        const can = Object.keys(tr.give).every(function (k) { return (inv[k] || 0) >= tr.give[k]; });
        const giveStr = Object.keys(tr.give).map(function (k) { return tr.give[k] + ' ' + k.replace(/_/g, ' '); }).join(' + ');
        const getStr = Object.keys(tr.get).map(function (k) { return tr.get[k] + ' ' + k.replace(/_/g, ' '); }).join(' + ');
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 6px;border-bottom:1px solid #444;' + (can ? '' : 'opacity:.6;');
        row.innerHTML = '<div style="font-size:13px;">' + giveStr + ' <b style="color:#ffd54a;">→</b> ' + getStr + '</div>';
        const btn = document.createElement('button');
        btn.textContent = 'Trade';
        btn.disabled = !can;
        btn.style.cssText = 'padding:6px 12px;cursor:' + (can ? 'pointer' : 'default') + ';background:' + (can ? '#3f6b4a' : '#333') + ';color:#fff;border:2px solid ' + (can ? '#6bbf7e' : '#555') + ';border-radius:6px;';
        btn.addEventListener('click', function () {
          if (!can) return;
          for (const k in tr.give) { inv[k] -= tr.give[k]; if (inv[k] <= 0) delete inv[k]; }
          for (const k in tr.get) { inv[k] = (inv[k] || 0) + tr.get[k]; }
          SFX.pickup();
          refreshUI();
          openMerchant();
        });
        row.appendChild(btn);
        trades.appendChild(row);
      });
      el.querySelector('#b7mclose').addEventListener('click', function () { el.style.display = 'none'; });
    }

    const _origPlace7c = place;
    place = function () {
      const mx = player.x, my = player.y + 0.9;
      if (Math.hypot(merchant.x - mx, merchant.y - my) < 3) { openMerchant(); return; }
      _origPlace7c.call(this);
    };

    const _origDraw7 = draw;
    draw = function () {
      _origDraw7.call(this);
      const cx = camX(), cy = camY();
      const px = merchant.x * TS - cx, py = merchant.y * TS - cy;
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(px - TS * 0.4, py, TS * 0.8, TS * 1.6);
      ctx.fillStyle = '#ffcc99';
      ctx.fillRect(px - TS * 0.35, py - TS * 0.6, TS * 0.7, TS * 0.6);
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(px - TS * 0.5, py - TS * 0.75, TS, TS * 0.2);
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      const w = 90;
      ctx.fillRect(px - w / 2, py - TS * 1.4, w, 18);
      ctx.fillStyle = '#fff';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Merchant', px, py - TS * 1.4 + 13);
    };
  });

  // ============================================================
  // 6. INVENTORY TOOLTIPS
  // ============================================================
  section('tooltips', function () {
    let tooltipEl = document.createElement('div');
    tooltipEl.id = 'b7tooltip';
    tooltipEl.style.cssText = 'position:fixed;background:rgba(0,0,0,.92);color:#fff;font:12px system-ui,sans-serif;' +
      'padding:8px 10px;border-radius:6px;pointer-events:none;z-index:30;display:none;max-width:240px;line-height:1.5;' +
      'border:1px solid #555c6e;box-shadow:0 4px 12px rgba(0,0,0,.6);';
    document.body.appendChild(tooltipEl);

    function buildTooltipText(itemKey) {
      const it = ITEMS[itemKey];
      if (!it) return '';
      let html = '<b style="color:#ffd54a;">' + nice(itemKey) + '</b><br>';
      const lines = [];
      if (it.block) lines.push('Type: Block');
      if (it.tool) lines.push('Pickaxe — Mining x' + it.tool);
      if (it.axe) lines.push('Axe — Chopping x' + it.axe);
      if (it.weapon) lines.push('Weapon — Damage ' + it.weapon.damage);
      if (it.armor) lines.push('Armor — Slot ' + it.armor);
      if (it.food) lines.push('Food — +' + it.food + ' hunger');
      if (it.durability) lines.push('Durability: ' + (typeof dur !== 'undefined' && dur[itemKey] != null ? dur[itemKey] : it.durability));
      if (it.heldLight) lines.push('Lights your way while held');
      if (it.bait) lines.push('Use below depth 100 to summon the Molten Wyrm');
      if (lines.length) html += lines.join('<br>');
      return html;
    }

    document.addEventListener('mouseover', function (e) {
      const el = e.target.closest('[data-slot], [data-creative]');
      if (!el) { tooltipEl.style.display = 'none'; return; }
      let key = null;
      if (el.dataset.creative) key = el.dataset.creative;
      else {
        const i = +el.dataset.slot;
        if (!isNaN(i) && slots[i]) key = slots[i];
      }
      if (!key) { tooltipEl.style.display = 'none'; return; }
      tooltipEl.innerHTML = buildTooltipText(key);
      tooltipEl.style.display = 'block';
    });
    document.addEventListener('mousemove', function (e) {
      if (tooltipEl.style.display === 'block') {
        const x = Math.min(e.clientX + 14, window.innerWidth - 250);
        const y = Math.min(e.clientY + 14, window.innerHeight - 100);
        tooltipEl.style.left = x + 'px';
        tooltipEl.style.top = y + 'px';
      }
    });
    document.addEventListener('mouseout', function (e) {
      const el = e.target.closest('[data-slot], [data-creative]');
      if (el) tooltipEl.style.display = 'none';
    });
  });

  console.log('[MiniTerra Batch 7 v2] loaded — SFX, ambient, enemies, bosses, merchant, tooltips.');
})();