/* ============================================================
   MiniTerra — BATCH 8 (final, performance-safe)
   Adds: mountains + valleys, 4 new surface biomes,
         1 new underground biome, surface structures (tower, camp),
         debug-menu spawn buttons for all 4 structure types.
   Performance: mountains use a precomputed table; biomes are
   decided per column; structures are checked once per chunk.
   ============================================================ */
(function () {
  'use strict';

  if (typeof player === 'undefined' || typeof frame === 'undefined') {
    setTimeout(arguments.callee, 50);
    return;
  }

  function section(name, fn) {
    try { fn(); } catch (e) { console.error('[Batch 8] ' + name + ' failed:', e.message); }
  }

  // ============================================================
  // 1. BLOCKS + ITEMS
  // ============================================================
  section('blocks and items', function () {
    // Jungle
    BLOCKS.jungle_grass  = BLOCKS.jungle_grass  || { color: '#2e7d32', hardness: 20, drops: 'dirt' };
    BLOCKS.jungle_wood   = BLOCKS.jungle_wood   || { color: '#4a2f1a', solid: false, hardness: 30, drops: 'wood', chop: true };
    BLOCKS.jungle_leaves = BLOCKS.jungle_leaves || { color: '#1b5e20', solid: false, hardness: 8, drops: 'apple', dropChance: 0.2, chop: true };
    BLOCKS.vine          = BLOCKS.vine          || { color: '#2e7d32', solid: false, hardness: 4, drops: null, chop: true };
    // Swamp
    BLOCKS.swamp_grass = BLOCKS.swamp_grass || { color: '#4a5d23', hardness: 20, drops: 'dirt' };
    BLOCKS.mud         = BLOCKS.mud         || { color: '#3e2723', hardness: 15, drops: 'dirt' };
    BLOCKS.dead_wood   = BLOCKS.dead_wood   || { color: '#5d4037', solid: false, hardness: 20, drops: 'wood', chop: true };
    // Badlands
    BLOCKS.red_sand       = BLOCKS.red_sand       || { color: '#c1541c', hardness: 10, drops: 'red_sand' };
    BLOCKS.red_sandstone  = BLOCKS.red_sandstone  || { color: '#a04518', hardness: 40, drops: 'red_sandstone' };
    // Savanna
    BLOCKS.dry_grass     = BLOCKS.dry_grass     || { color: '#c2a83e', hardness: 20, drops: 'dirt' };
    BLOCKS.acacia_wood   = BLOCKS.acacia_wood   || { color: '#6d4c2a', solid: false, hardness: 30, drops: 'wood', chop: true };
    BLOCKS.acacia_leaves = BLOCKS.acacia_leaves || { color: '#7a8c2e', solid: false, hardness: 8, drops: 'apple', dropChance: 0.1, chop: true };
    // Mushroom grove
    BLOCKS.glowshroom          = BLOCKS.glowshroom          || { color: '#c084fc', emit: 0.4, solid: false, hardness: 10, drops: 'glowshroom', chop: true };
    BLOCKS.giant_mushroom_stem = BLOCKS.giant_mushroom_stem || { color: '#e0d5c0', solid: false, hardness: 20, drops: 'wood', chop: true };
    BLOCKS.giant_mushroom_cap  = BLOCKS.giant_mushroom_cap  || { color: '#a03030', solid: false, hardness: 15, drops: 'fungus', chop: true };

    ITEMS.red_sand         = ITEMS.red_sand         || { block: 'red_sand' };
    ITEMS.red_sandstone    = ITEMS.red_sandstone    || { block: 'red_sandstone' };
    ITEMS.moss             = ITEMS.moss             || { block: 'moss' };
    ITEMS.glowshroom       = ITEMS.glowshroom       || { block: 'glowshroom' };
  });

  // ============================================================
  // 2. BIOME TABLES
  // ============================================================
  section('biome tables', function () {
    if (!BIOMES.jungle)   BIOMES.jungle   = { name: 'Jungle',   top: 'jungle_grass', sub: 'dirt',           wall: '#3a2110' };
    if (!BIOMES.swamp)    BIOMES.swamp    = { name: 'Swamp',    top: 'swamp_grass',  sub: 'mud',            wall: '#2a3320' };
    if (!BIOMES.badlands) BIOMES.badlands = { name: 'Badlands', top: 'red_sand',     sub: 'red_sandstone',  wall: '#7a3010' };
    if (!BIOMES.savanna)  BIOMES.savanna  = { name: 'Savanna',  top: 'dry_grass',    sub: 'dirt',           wall: '#6b5a30' };
    if (!UNDER.mushroom)  UNDER.mushroom  = { name: 'Mushroom Grove', fill: 'stone', deep: 'deepstone', patch: 'glowshroom', wall: '#2a1530', deepWall: '#1a0a20' };
  });

  // ============================================================
  // 3. TERRAIN — mountains via lookup table (cheap)
  // ============================================================
  // The base surfaceHeight() is called constantly. To keep it cheap,
  // we cache the mountain offset per integer x in a Map. First call
  // for an x computes it; subsequent calls are O(1).
  section('mountains', function () {
    const mountainCache = new Map();
    function mountainAt(x) {
      const k = x | 0;
      let v = mountainCache.get(k);
      if (v !== undefined) return v;
      const m = fbm(k * 0.006 + 777, 42) - 0.5;
      const sign = m < 0 ? -1 : 1;
      const shaped = sign * Math.pow(Math.abs(m) * 2, 1.6) * 45;
      const detail = (vnoise(k * 0.05 + 999, 12) - 0.5) * 4;
      v = Math.round(shaped + detail);
      // Cap the cache so it doesn't grow forever
      if (mountainCache.size > 20000) mountainCache.clear();
      mountainCache.set(k, v);
      return v;
    }
    const _origSurfaceHeight = surfaceHeight;
    surfaceHeight = function (x) {
      return _origSurfaceHeight(x) + mountainAt(x);
    };
  });

  // ============================================================
  // 4. BIOMES — override surfaceBiome (called once per column)
  // ============================================================
  section('surfaceBiome', function () {
    surfaceBiome = function (x) {
      if (Math.abs(x) < CONFIG.spawnForest) return 'forest';
      if (oceanDepth(x) > 0.12) return 'ocean';
      const v = vnoise(x * CONFIG.biomeScale + 500, 3) * 0.6
              + vnoise(x * CONFIG.biomeScale * 3 + 500, 3) * 0.2
              + vnoise(x * CONFIG.biomeScale * 0.5 + 200, 9) * 0.2;
      if (v < 0.20) return 'snow';
      if (v < 0.30) return 'savanna';
      if (v < 0.40) return 'forest';
      if (v < 0.52) return 'jungle';
      if (v < 0.62) return 'swamp';
      if (v < 0.76) return 'desert';
      if (v < 0.88) return 'badlands';
      return 'forest';
    };
  });

  // ============================================================
  // 5. UNDERBIOME — add mushroom grove (cheap comparison)
  // ============================================================
  section('underBiome', function () {
    const _origUnderBiome = underBiome;
    underBiome = function (x, y, depth) {
      const bio = biomeCol[x];
      if (bio === 'snow') return 'ice';
      if (bio === 'desert' || bio === 'badlands') return 'sand';
      if (depth > 20) {
        const n = fbm(x * 0.004 + 300, y * 0.004 + 300);
        if (n > 0.68) return 'fungal';
        if (n > 0.60 && n <= 0.68 && depth > 30) return 'mushroom';
        if (n < 0.32 && depth > 40) return 'crystal';
        if (n > 0.55 && n < 0.60 && depth > 60) return 'magma';
      }
      return 'stone';
    };
  });

  // ============================================================
  // 6. STRUCTURES
  // ============================================================
  function placeChest(x, y, depth) {
    if (!world[x]) return;
    world[x][y] = 'chest';
    if (typeof chests !== 'undefined') {
      const CHEST_LOOT = [
        { item: 'torch',   min: 4, max: 12, weight: 8 },
        { item: 'apple',   min: 1, max: 4, weight: 6 },
        { item: 'coal',    min: 2, max: 8, weight: 7 },
        { item: 'iron',    min: 1, max: 4, weight: 6 },
        { item: 'gold',    min: 1, max: 3, weight: 4 },
        { item: 'diamond', min: 1, max: 2, weight: 2 },
        { item: 'gel',     min: 2, max: 5, weight: 5 },
        { item: 'silk',    min: 1, max: 3, weight: 4 },
      ];
      const loot = {};
      const pool = CHEST_LOOT.filter(function (l) {
        if (l.item === 'diamond') return depth > 40;
        if (l.item === 'gold') return depth > 20;
        return true;
      });
      const totalW = pool.reduce(function (s, l) { return s + l.weight; }, 0);
      const rolls = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < rolls; i++) {
        let r = Math.random() * totalW;
        let pick = pool[0];
        for (const p of pool) { r -= p.weight; if (r <= 0) { pick = p; break; } }
        const n = pick.min + Math.floor(Math.random() * (pick.max - pick.min + 1));
        loot[pick.item] = (loot[pick.item] || 0) + n;
      }
      chests[x + ',' + y] = { loot: loot, opened: false };
    }
  }

  const STRUCTURES = {
    mine: function (x, y) {
      const len = 18 + Math.floor(Math.random() * 8);
      const h = 3;
      const dir = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < len; i++) {
        const tx = x + i * dir;
        for (let dy = 0; dy < h; dy++) if (world[tx] && world[tx][y - dy] !== undefined) world[tx][y - dy] = 'air';
        if (i % 5 === 0 && world[tx]) { world[tx][y - h] = 'wood'; world[tx][y - h + 1] = 'wood'; }
        if (world[tx] && Math.random() < 0.15) world[tx][y - h - 1] = ['coal', 'iron', 'gold'][Math.floor(Math.random() * 3)];
      }
      placeChest(x + (len - 2) * dir, y, 40);
    },
    tower: function (x, y) {
      const height = 12 + Math.floor(Math.random() * 8);
      const w = 6;
      for (let dy = 0; dy < height; dy++) {
        for (let dx = -w / 2; dx <= w / 2; dx++) {
          const tx = x + dx, ty = y - dy;
          if (!world[tx] || world[tx][ty] === undefined) continue;
          const isWall = (dx === -w / 2 || dx === w / 2 || dy === 0 || dy === height - 1);
          if (isWall) { if (dy > 4 && Math.random() < 0.25) continue; world[tx][ty] = 'stone'; }
          else world[tx][ty] = 'air';
        }
      }
      placeChest(x + 1, y - 2, 5);
    },
    shrine: function (x, y) {
      const r = 4;
      for (let dx = -r; dx <= r; dx++) for (let dy = -1; dy <= 0; dy++) {
        const tx = x + dx, ty = y + dy;
        if (world[tx] && world[tx][ty] !== undefined) world[tx][ty] = 'stone';
      }
      for (const cx of [x - r, x + r]) for (let dy = 1; dy <= 3; dy++)
        if (world[cx] && world[cx][dy + y - 1] !== undefined) world[cx][y - dy] = 'stone';
      placeChest(x, y - 1, 80);
    },
    camp: function (x, y) {
      for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy < 2; dy++) {
        const tx = x + dx, ty = y + dy;
        if (!world[tx] || world[tx][ty] === undefined) continue;
        if (Math.abs(dx) + dy >= 2) world[tx][ty] = 'planks';
      }
      if (world[x + 3] && world[x + 3][y - 1] !== undefined) {
        world[x + 3][y - 1] = 'air';
        world[x + 3][y - 2] = 'air';
        world[x + 3][y - 1] = 'torch';
      }
      placeChest(x - 3, y, 3);
    },
  };

  // ============================================================
  // 7. NATURAL SURFACE STRUCTURES — towers + camps only
  // ============================================================
  // Checked once per chunk. 12% chance a chunk gets a surface structure.
  section('natural structures', function () {
    const _origGenerateChunk = generateChunk;
    generateChunk = function (c) {
      _origGenerateChunk.call(this, c);
      // Only surface structures (tower or camp) — cheap to place.
      if (Math.random() > 0.12) return;
      const c0 = c * CH, c1 = c0 + CH - 1;
      const cx = c0 + 8 + Math.floor(Math.random() * (CH - 16));
      if (!heights[cx]) return;
      // Skip if column is ocean/swamp (structures don't spawn there)
      const bio = biomeCol[cx];
      if (bio === 'ocean' || bio === 'swamp') return;
      const surfaceY = heights[cx];
      if (surfaceY >= H - 5 || surfaceY < 5) return;
      const type = Math.random() < 0.5 ? 'tower' : 'camp';
      try { STRUCTURES[type](cx, surfaceY); } catch (e) {}
    };
  });

  // ============================================================
  // 8. BIOME TREES — lightweight pass, only 3 new biomes
  // ============================================================
  section('biome trees', function () {
    const _origGC = generateChunk;
    generateChunk = function (c) {
      _origGC.call(this, c);
      const c0 = c * CH, c1 = c0 + CH - 1;
      for (let x = c0 + 3; x <= c1 - 3; x++) {
        if (!world[x] || !biomeCol[x]) continue;
        const bio = biomeCol[x];
        if (bio !== 'jungle' && bio !== 'swamp' && bio !== 'savanna') continue;
        const h = heights[x];
        if (Math.abs((heights[x - 1] || 0) - h) >= 2) continue;
        const top = world[x][h];
        if (bio === 'jungle' && top === 'jungle_grass' && Math.random() < 0.14) {
          const th = 7 + Math.floor(Math.random() * 5);
          const tt = h - th;
          for (let y = h - 1; y >= tt; y--) world[x][y] = 'jungle_wood';
          for (let dx = -2; dx <= 2; dx++) {
            if (!world[x + dx]) continue;
            for (let dy = -2; dy <= 1; dy++)
              if (Math.abs(dx) + Math.abs(dy) < 4 && world[x + dx][tt + dy] === 'air')
                world[x + dx][tt + dy] = 'jungle_leaves';
          }
          x += 2;
        } else if (bio === 'swamp' && (top === 'swamp_grass' || top === 'mud') && Math.random() < 0.06) {
          const th = 4 + Math.floor(Math.random() * 4);
          const tt = h - th;
          for (let y = h - 1; y >= tt; y--) world[x][y] = 'dead_wood';
          x += 3;
        } else if (bio === 'savanna' && top === 'dry_grass' && Math.random() < 0.04) {
          const th = 5 + Math.floor(Math.random() * 3);
          const tt = h - th;
          for (let y = h - 1; y >= tt; y--) world[x][y] = 'acacia_wood';
          for (let dx = -2; dx <= 2; dx++) {
            if (!world[x + dx]) continue;
            for (let dy = -1; dy <= 1; dy++)
              if (world[x + dx][tt + dy] === 'air') world[x + dx][tt + dy] = 'acacia_leaves';
          }
          x += 3;
        }
      }
    };
  });

  // ============================================================
  // 9. DEBUG MENU — spawn any structure
  // ============================================================
  section('debug buttons', function () {
    function addButtons() {
      const dbg = document.getElementById('debug');
      if (!dbg) { setTimeout(addButtons, 300); return; }
      if (dbg.querySelector('#b8structs')) return;
      const holder = document.createElement('div');
      holder.id = 'b8structs';
      holder.innerHTML = '<h4>Spawn structure near player</h4>';
      const row = document.createElement('div');
      row.className = 'drow';
      ['mine', 'tower', 'shrine', 'camp'].forEach(function (t) {
        const btn = document.createElement('button');
        btn.textContent = t.charAt(0).toUpperCase() + t.slice(1);
        btn.addEventListener('click', function () {
          const px = Math.floor(player.x) + 8;
          let py;
          if (t === 'tower' || t === 'camp') {
            py = heights[px] || Math.floor(player.y);
            while (py > 0 && isSolid(px, py - 1)) py--;
          } else if (t === 'mine') py = Math.floor(player.y) + 5;
          else py = Math.floor(player.y);
          try { STRUCTURES[t](px, py); toast('Spawned ' + t); }
          catch (e) { toast('Failed: ' + e.message); }
        });
        row.appendChild(btn);
      });
      holder.appendChild(row);
      dbg.appendChild(holder);
    }
    addButtons();
  });

  console.log('[MiniTerra Batch 8] loaded — mountains, biomes, surface structures.');
})();