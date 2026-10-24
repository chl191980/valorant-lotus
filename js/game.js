/* ============================================================
   game.js —— 玩法：射击 / 打 BOT / 死斗 / HUD / 移动端操作
   ============================================================ */
(function (global) {
  'use strict';
  var M = global.LotusMap;

  /* 武器参数（伤害取自官方数据） */
  var WSTAT = {
    vandal: { rate: 9.75, mag: 25, reserve: 75, reload: 2.5, spread: 0.006, spreadMax: 0.045, perShot: 0.0045, recV: 12, recH: 4.2, adsSpread: 0.55, adsRate: 0.85, runSpeed: 1 },
    phantom: { rate: 11, mag: 30, reserve: 90, reload: 2.5, spread: 0.005, spreadMax: 0.04, perShot: 0.004, recV: 10, recH: 3.4, adsSpread: 0.5, adsRate: 0.85, runSpeed: 1 }
  };

  var G = {
    running: false, paused: false,
    mode: 'range',
    settings: { sens: 1, adsSens: 0.8, fov: 75, vol: 0.7, quality: 0.8, chColor: '#34f5a8', chGap: 4, chLen: 6, chDot: true, dmgNum: true, showFps: false, minimap: true, rotate: false, autoFire: false, fireAnywhere: true, lefty: true },
    weapon: 'vandal',
    skins: { vandal: null, phantom: null },     // 当前装备皮肤
    variants: { vandal: 0, phantom: 0 },
    ammo: { vandal: { mag: 25, reserve: 75 }, phantom: { mag: 30, reserve: 90 } },
    player: { x: 0, y: 0, ang: 0, pitch: 0, z: 0.81, hp: 100, armor: 0, crouch: false, bobT: 0, vy: 0, jump: 0, speed: 2.95 },
    bots: [], impacts: [], tracers: [], botFlashes: [],
    stats: { shots: 0, hits: 0, kills: 0, hs: 0, dmg: 0, streak: 0, best: 0 },
    time: 0, wave: 1, spread: 0, recAcc: 0, fireT: 0, reloadT: 0, swapping: 0,
    ads: 0, adsHeld: false, firing: false, shotIdx: 0,
    lastHitAt: 0,
    keys: {}, joy: { x: 0, y: 0, active: false },
    el: {}, eng: null, mini: null, gun: null,
    fpsT: 0, fpsN: 0, fps: 60, lookId: null
  };

  /* ============================================================
     初始化
     ============================================================ */
  G.init = function (opts) {
    G.el = opts.el;
    G.eng = new global.VEngine(opts.viewCanvas);
    G.mini = new global.MiniMap(opts.mmCanvas);
    G.gun = new global.GunView(opts.gunCanvas);
    G.gunCanvas = opts.gunCanvas;
    G.viewCanvas = opts.viewCanvas;
    G.mmCanvas = opts.mmCanvas;
    bindInput();
    applyCrosshair();
    window.addEventListener('resize', function () { onResize(); });
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 250); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G.running && !G.paused) G.pause();
    });
  };

  function onResize() {
    if (!G.eng) return;
    G.eng.resize();
    G.gun.resize();
    if (G.inspector) G.inspector.resize();
  }
  G.onResize = onResize;

  G.applySettings = function (s) {
    for (var k in s) if (s.hasOwnProperty(k)) G.settings[k] = s[k];
    if (G.eng) { G.eng.scale = G.settings.quality; G.eng.fov = G.settings.fov; G.eng.resize(); }
    global.Sfx.setVol(G.settings.vol);
    applyCrosshair();
    if (G.el.fps) G.el.fps.style.display = G.settings.showFps ? 'block' : 'none';
    if (G.el.minimap) G.el.minimap.style.display = G.settings.minimap ? 'block' : 'none';
  };
  function applyCrosshair() {
    var s = G.settings, box = G.el.crosshair;
    if (!box) return;
    box.style.setProperty('--ch-color', s.chColor);
    box.style.setProperty('--ch-gap', s.chGap + 'px');
    box.style.setProperty('--ch-len', s.chLen + 'px');
    box.querySelector('.ch-dot').style.display = s.chDot ? 'block' : 'none';
  }

  /* ============================================================
     开始 / 结束
     ============================================================ */
  G.start = function (mode, weaponKey) {
    G.mode = mode || 'range';
    if (weaponKey) G.weapon = weaponKey;
    G.player.x = M.SPAWN.x; G.player.y = M.SPAWN.y; G.player.ang = M.SPAWN.a;
    G.player.pitch = 0; G.player.hp = 100; G.player.armor = G.mode === 'dm' ? 50 : 0;
    G.player.z = 0.81; G.player.crouch = false; G.player.vy = 0; G.player.jump = 0;
    G.ammo.vandal = { mag: WSTAT.vandal.mag, reserve: WSTAT.vandal.reserve };
    G.ammo.phantom = { mag: WSTAT.phantom.mag, reserve: WSTAT.phantom.reserve };
    G.stats = { shots: 0, hits: 0, kills: 0, hs: 0, dmg: 0, streak: 0, best: 0 };
    G.time = 0; G.wave = 1; G.spread = 0; G.reloadT = 0; G.fireT = 0; G.swapping = 0;
    G.impacts = []; G.tracers = []; G.botFlashes = [];
    G.lastHitAt = -99;
    G.paused = false;
    spawnWave();
    equipWeapon(G.weapon, true);
    G.running = true;
    global.Sfx.init(); global.Sfx.resume(); global.Sfx.startAmbient();
    G.el.pause.classList.add('hidden');
    G.el.result.classList.add('hidden');
    toast(G.mode === 'range' ? '靶 场 练 枪' : '莲 花 古 城', G.mode === 'range' ? '静止 BOT · 自由试枪' : '清空 A / B / C 三包点');
    G.last = performance.now();
    requestAnimationFrame(loop);
  };

  G.stop = function () {
    G.running = false;
    global.Sfx.stopAmbient();
  };
  G.pause = function () {
    if (!G.running) return;
    G.paused = true;
    G.el.pause.classList.remove('hidden');
    updatePauseStats();
  };
  G.resume = function () {
    if (!G.running) return;
    G.paused = false;
    G.el.pause.classList.add('hidden');
    G.last = performance.now();
  };

  function updatePauseStats() {
    var s = G.stats;
    G.el.pKills.textContent = s.kills;
    G.el.pHS.textContent = s.kills ? Math.round(s.hs / s.kills * 100) + '%' : '0%';
    G.el.pAcc.textContent = s.shots ? Math.round(s.hits / s.shots * 100) + '%' : '0%';
  }

  function finish(win) {
    G.running = false;
    var s = G.stats;
    G.el.rKills.textContent = s.kills;
    G.el.rHS.textContent = s.hs;
    G.el.rHSP.textContent = s.kills ? Math.round(s.hs / s.kills * 100) + '%' : '0%';
    G.el.rAcc.textContent = s.shots ? Math.round(s.hits / s.shots * 100) + '%' : '0%';
    G.el.rDmg.textContent = s.dmg;
    G.el.rTime.textContent = fmtTime(G.time);
    G.el.rTitle.textContent = win ? '清 场 完 成' : '被 击 倒';
    G.el.rTitle.className = win ? 'win' : 'lose';
    G.el.rSub.textContent = '莲花古城 · ' + (G.mode === 'range' ? '靶场' : '第 ' + G.wave + ' 波');
    G.el.result.classList.remove('hidden');
    global.Sfx.stopAmbient();
    try { saveStats(); } catch (e) { }
  }
  function saveStats() {
    var h = JSON.parse(localStorage.getItem('vl_stats') || '{}');
    h.kills = (h.kills || 0) + G.stats.kills;
    h.hs = (h.hs || 0) + G.stats.hs;
    h.games = (h.games || 0) + 1;
    localStorage.setItem('vl_stats', JSON.stringify(h));
  }

  /* ============================================================
     BOT 生成
     ============================================================ */
  function freeSpawn() {
    for (var i = 0; i < 60; i++) {
      var p = M.BOT_SPAWNS[(Math.random() * M.BOT_SPAWNS.length) | 0];
      var d = Math.hypot(p[0] - G.player.x, p[1] - G.player.y);
      if (d < 8) continue;
      var taken = G.bots.some(function (b) { return b.alive && Math.hypot(b.x - p[0], b.y - p[1]) < 1.2; });
      if (!taken) return { x: p[0], y: p[1] };
    }
    return { x: M.SPAWN.x, y: M.SPAWN.y - 6 };
  }

  function spawnWave() {
    G.bots = [];
    if (G.mode === 'range') {
      var kinds = ['range', 'range', 'range', 'blue', 'red', 'purple', 'gold'];
      var jitter = function () { return (Math.random() - .5) * 0.7; };
      // 出生点正前方先放 3 个靶，保证一进来就有目标可打
      var near = [[24.5, 43.5], [29.5, 43.5], [26.5, 39.5]];
      for (var n0 = 0; n0 < near.length; n0++) {
        G.bots.push(new global.Bot({
          x: near[n0][0] + jitter() * 0.5, y: near[n0][1] + jitter() * 0.5,
          hp: 100, kind: kinds[n0 % kinds.length], mode: 'range', site: 0, speed: 1.3
        }));
      }
      // 其余靶子打散到全图
      var pool = M.BOT_SPAWNS.slice();
      for (var si = pool.length - 1; si > 0; si--) { var r = (Math.random() * (si + 1)) | 0; var t = pool[si]; pool[si] = pool[r]; pool[r] = t; }
      for (var i = 0; i < 12 && i < pool.length; i++) {
        var p = pool[i];
        G.bots.push(new global.Bot({
          x: p[0] + jitter(), y: p[1] + jitter(),
          hp: 100, kind: kinds[(i + 3) % kinds.length], mode: 'range', site: i % 3, speed: 1.3
        }));
      }
    } else {
      var n = Math.min(20, 6 + G.wave * 2);
      for (var i2 = 0; i2 < n; i2++) {
        var p2 = M.BOT_SPAWNS[(Math.random() * M.BOT_SPAWNS.length) | 0];
        var elite = Math.random() < Math.min(0.3, 0.05 * G.wave);
        G.bots.push(new global.Bot({
          x: p2[0] + (Math.random() - .5) * 1.4, y: p2[1] + (Math.random() - .5) * 1.4,
          hp: elite ? 125 : 100, kind: elite ? 'gold' : (Math.random() < .5 ? 'red' : 'purple'),
          mode: 'dm', site: (Math.random() * 3) | 0, speed: 1.35 + G.wave * 0.06
        }));
      }
    }
    updateObjText();
  }
  function updateObjText() {
    var alive = G.bots.filter(function (b) { return b.alive; }).length;
    if (G.el.obj) G.el.obj.textContent = G.mode === 'range' ? '靶场 · 剩余 ' + alive : '剩余 BOT ' + alive;
  }

  /* ============================================================
     武器 / 皮肤
     ============================================================ */
  function weaponStats(key) {
    var db = global.SKIN_DB && global.SKIN_DB.weapons[key];
    return db ? db.stats : null;
  }
  function equipWeapon(key, immediate) {
    G.weapon = key;
    var skin = G.skins[key];
    G.gun.setWeapon(key, skin, G.variants[key]);
    if (!immediate) { G.swapping = 0.35; global.Sfx.swap(); }
    var db = global.SKIN_DB && global.SKIN_DB.weapons[key];
    G.el.hudWpn.textContent = (db ? db.cn : key) + ' ' + key.toUpperCase();
    G.el.hudSkin.textContent = (skin ? skin.full : '默认 · ' + (key === 'vandal' ? '暴徒' : '幻影'));
    updateAmmoHud();
  }
  G.equipWeapon = equipWeapon;
  G.setWeapon = function (key) {
    if (G.reloadT > 0) return;
    if (key === G.weapon) return;
    equipWeapon(key, false);
  };
  G.toggleWeapon = function () { G.setWeapon(G.weapon === 'vandal' ? 'phantom' : 'vandal'); };
  G.equipSkin = function (wpn, skin, variant) {
    G.skins[wpn] = skin;
    G.variants[wpn] = variant || 0;
    if (wpn === G.weapon) G.equipWeapon(wpn, true);
  };

  function updateAmmoHud() {
    var a = G.ammo[G.weapon];
    G.el.ammo.textContent = a.mag;
    G.el.ammoMax.textContent = '/ ' + a.reserve;
  }

  /* ============================================================
     射击
     ============================================================ */
  function damageFor(wpn, dist, part) {
    var st = weaponStats(wpn);
    var ranges = st ? st.ranges : [{ s: 0, e: 50, head: wpn === 'vandal' ? 160 : 156, body: wpn === 'vandal' ? 40 : 39, leg: wpn === 'vandal' ? 34 : 29 }];
    var r = ranges[0];
    for (var i = 0; i < ranges.length; i++) { if (dist >= ranges[i].s && dist < ranges[i].e) { r = ranges[i]; break; } }
    if (part === 'head') return Math.round(r.head);
    if (part === 'legs') return Math.round(r.leg);
    return Math.round(r.body);
  }

  function rayWallDist(x, y, dx, dy, maxD) {
    // DDA 求墙距离
    var mapX = x | 0, mapY = y | 0;
    var deltaX = dx === 0 ? 1e30 : Math.abs(1 / dx);
    var deltaY = dy === 0 ? 1e30 : Math.abs(1 / dy);
    var stepX, stepY, sideX, sideY, side = 0;
    if (dx < 0) { stepX = -1; sideX = (x - mapX) * deltaX; } else { stepX = 1; sideX = (mapX + 1 - x) * deltaX; }
    if (dy < 0) { stepY = -1; sideY = (y - mapY) * deltaY; } else { stepY = 1; sideY = (mapY + 1 - y) * deltaY; }
    var guard = 0;
    while (guard++ < 300) {
      if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
      else { sideY += deltaY; mapY += stepY; side = 1; }
      var d = side === 0 ? sideX - deltaX : sideY - deltaY;
      if (d > maxD) return maxD;
      if (mapX < 0 || mapY < 0 || mapX >= M.MW || mapY >= M.MH) return d;
      if (M.grid[mapY * M.MW + mapX]) return d;
    }
    return maxD;
  }

  function fire() {
    if (!G.running || G.paused) return;
    if (G.reloadT > 0 || G.swapping > 0) return;
    var a = G.ammo[G.weapon];
    if (G.fireT > 0) return;
    if (a.mag <= 0) { global.Sfx.dryFire(); startReload(); return; }
    var st = WSTAT[G.weapon];
    G.fireT = 1 / (st.rate * (G.ads ? st.adsRate : 1));
    a.mag--;
    G.stats.shots++;
    G.gun.triggerFire();
    global.Sfx.shot(G.weapon, 0);
    // 散步（先按当前状态算，第一发最准）
    var spread = Math.min(st.spreadMax, G.spread + st.spread) * (G.ads ? st.adsSpread : 1) * (G.player.crouch ? .8 : 1);
    var moving = Math.hypot(G.joy.x, G.joy.y) > 0.1 || G.keys['w'] || G.keys['a'] || G.keys['s'] || G.keys['d'];
    if (moving) spread *= 2.1;

    // 射线（含散步 + 后坐偏移）
    var ang = G.player.ang + G.recAcc * 0.004 + (Math.random() - .5) * spread * 2;
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var slope = G.player.pitch / G.eng.h + (Math.random() - .5) * spread * 2;
    var wallD = rayWallDist(G.player.x, G.player.y, dx, dy, 70);

    // 命中 BOT（最近）
    var best = null, bestT = 1e9, bestPart = null;
    for (var i = 0; i < G.bots.length; i++) {
      var b = G.bots[i];
      if (!b.alive) continue;
      var ox = b.x - G.player.x, oy = b.y - G.player.y;
      var t = ox * dx + oy * dy;
      if (t <= 0.2 || t > Math.min(wallD, 60)) continue;
      var perp = Math.abs(ox * dy - oy * dx);
      var rad = 0.30;
      if (perp > rad) continue;
      var z = G.player.z + slope * t;
      var hit = b.hitTest(z);
      if (!hit) continue;
      if (t < bestT) { bestT = t; best = b; bestPart = hit; }
    }

    if (best) {
      var dmg = damageFor(G.weapon, bestT, bestPart.part);
      best.hp -= dmg;
      best.hitT = 0.06;
      G.stats.hits++;
      G.stats.dmg += Math.min(dmg, dmg);
      hitFeedback(best, dmg, bestPart.part, bestT);
      G.tracers.push({ x: best.x, y: best.y, z: G.player.z + slope * bestT, t: 0.09, hit: true });
      if (best.hp <= 0) killBot(best, bestPart.part === 'head');
    } else {
      // 打到墙
      var ix = G.player.x + dx * (wallD - 0.06), iy = G.player.y + dy * (wallD - 0.06);
      var iz = G.player.z + slope * wallD;
      G.impacts.push({ x: ix, y: iy, z: Math.max(0.2, Math.min(1.9, iz)), t: 0.4, max: 0.4, kind: 'smoke' });
      G.tracers.push({ x: ix, y: iy, z: iz, t: 0.07 });
      global.Sfx.hitWall();
    }
    // 后坐力（结算之后抬枪：垂直递增 + 水平抖动，贴合暴徒/幻影弹道）
    G.shotIdx = Math.min(30, G.shotIdx + 1);
    var recV = (st.recV * 0.12 + Math.min(4.2, G.shotIdx * 0.34)) * (G.ads ? 0.6 : 1) * (G.player.crouch ? 0.72 : 1);
    G.player.pitch += recV * (0.75 + Math.random() * 0.5);
    if (G.player.pitch > G.eng.h * 0.5) G.player.pitch = G.eng.h * 0.5;
    if (!G.recDir) G.recDir = Math.random() < .5 ? -1 : 1;
    if (Math.random() < 0.1) G.recDir *= -1;
    G.recAcc += st.recH * 0.3 * G.recDir * (0.4 + Math.random());
    G.spread = Math.min(st.spreadMax, G.spread + st.perShot);

    updateAmmoHud();
    if (a.mag === 0) startReload();
  }

  function hitFeedback(bot, dmg, part, dist) {
    var hs = part === 'head';
    if (hs) { G.stats.hs++; global.Sfx.hitHead(); }
    else global.Sfx.hitBody();
    // 命中标记
    var hm = G.el.hitmark;
    hm.classList.remove('show');
    void hm.offsetWidth;
    hm.classList.add('show');
    // 伤害数字
    if (G.settings.dmgNum && G.el.dmgwrap) {
      var d = document.createElement('div');
      d.className = 'dmgnum' + (hs ? ' hs' : '');
      d.textContent = (hs ? '💀 ' : '') + dmg;
      d.style.setProperty('--dx', ((Math.random() - .5) * 60).toFixed(0) + 'px');
      d.style.left = ((Math.random() - .5) * 30).toFixed(0) + 'px';
      d.style.top = ((Math.random() - .5) * 20).toFixed(0) + 'px';
      G.el.dmgwrap.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 750);
    }
  }

  function killBot(bot, headshot) {
    bot.alive = false;
    bot.deadT = 0;
    G.stats.kills++;
    G.stats.streak++;
    if (G.stats.streak > G.stats.best) G.stats.best = G.stats.streak;
    global.Sfx.kill();
    addKill(headshot, bot.elite);
    // 连杀播报
    var st2 = G.stats.streak;
    if (st2 === 2) toast('双 杀', 'KILL ' + G.stats.kills);
    else if (st2 === 3) toast('三 杀', 'TRIPLE KILL');
    else if (st2 === 4) toast('四 杀', 'QUADRA KILL');
    else if (st2 >= 5) toast('无 双', 'ACE · 连杀 ' + st2);
    updateObjText();
    // 击杀换肤
    if (G.settings.rotate) {
      var list = global.SKIN_DB.skins.filter(function (s) { return s.wpn === G.weapon; });
      if (list.length) {
        var s = list[(Math.random() * list.length) | 0];
        G.equipSkin(G.weapon, s, 0);
      }
    }
    if (G.mode === 'dm') {
      var alive = G.bots.filter(function (b) { return b.alive; }).length;
      if (alive === 0) {
        setTimeout(function () {
          if (!G.running) return;
          G.wave++;
          spawnWave();
          G.player.hp = Math.min(100, G.player.hp + 30);
          G.player.armor = Math.min(50, G.player.armor + 25);
          toast('第 ' + G.wave + ' 波', 'BOT 增多，小心');
          if (G.mode === 'dm' && G.wave > 4) { /* 无限波，最终由死亡结算 */ }
        }, 1200);
      }
    } else {
      // 靶场：2 秒后重生
      setTimeout(function () {
        if (!G.running) return;
        var p = freeSpawn();
        var kinds = ['range', 'blue', 'red', 'purple', 'gold'];
        G.bots.push(new global.Bot({
          x: p.x, y: p.y, hp: 100, kind: kinds[(Math.random() * kinds.length) | 0], mode: 'range',
          site: (Math.random() * 3) | 0, speed: 1.3
        }));
        // 清理已死很久的
        G.bots = G.bots.filter(function (b) { return b.alive || b.deadT < 1.2; });
        updateObjText();
      }, 1800);
    }
  }

  function addKill(headshot, elite) {
    var kf = document.createElement('div');
    kf.className = 'kf' + (headshot ? ' hs' : '');
    kf.innerHTML = '<span class="who">你</span><span class="ico">' + (headshot ? '🎯' : '🔫') + '</span><span class="vic">' + (elite ? '精英 BOT' : '训练 BOT') + '</span>';
    G.el.killfeed.appendChild(kf);
    if (G.el.killfeed.children.length > 5) G.el.killfeed.removeChild(G.el.killfeed.firstChild);
    setTimeout(function () { if (kf.parentNode) kf.parentNode.removeChild(kf); }, 3600);
  }

  function startReload() {
    var a = G.ammo[G.weapon];
    if (G.reloadT > 0 || a.mag >= WSTAT[G.weapon].mag || a.reserve <= 0) return;
    G.reloadT = WSTAT[G.weapon].reload;
    G.gun.triggerReload(G.reloadT);
    G.el.reloading.classList.remove('hidden');
    global.Sfx.reloadIn();
    setTimeout(function () { global.Sfx.reloadOut(); }, 500);
  }
  function finishReload() {
    var a = G.ammo[G.weapon];
    var need = WSTAT[G.weapon].mag - a.mag;
    var take = Math.min(need, a.reserve);
    a.mag += take; a.reserve -= take;
    G.reloadT = 0;
    G.el.reloading.classList.add('hidden');
    global.Sfx.reloadDone();
    updateAmmoHud();
  }

  /* ============================================================
     主循环
     ============================================================ */
  function loop(now) {
    if (!G.running) return;
    requestAnimationFrame(loop);
    var dt = (now - (G.last || now)) / 1000;
    if (!isFinite(dt) || dt < 0) dt = 0.016;
    if (dt > 0.05) dt = 0.05;
    G.last = now;
    if (G.paused) return;
    G.time += dt;

    updatePlayer(dt);
    updateBots(dt);
    updateEffects(dt);
    G.gun.update(dt, Math.hypot(G.joy.x, G.joy.y) > 0.1 || !!G.keys['w'] || !!G.keys['a'], false);
    if (G.reloadT > 0) {
      G.reloadT -= dt;
      if (G.reloadT <= 0) finishReload();
    }
    if (G.swapping > 0) G.swapping -= dt;
    G.spread = Math.max(0, G.spread - dt * 0.05);
    G.recAcc *= Math.pow(0.06, dt);
    if (G.fireT > 0) G.fireT -= dt;
    if (!G.firing) G.shotIdx = Math.max(0, G.shotIdx - dt * 12);
    if (G.firing && G.fireT <= 0) fire();

    // 渲染
    var cam = { x: G.player.x, y: G.player.y, ang: G.player.ang, pitch: G.player.pitch, fov: G.settings.fov, z: G.player.z, bobY: 0 };
    var sprites = [];
    for (var i = 0; i < G.bots.length; i++) sprites.push(G.bots[i].sprite());
    for (var j = 0; j < G.impacts.length; j++) {
      var im = G.impacts[j];
      sprites.push({
        x: im.x, y: im.y, tex: global.ImpactTex.get(im.kind), scale: 0.22 * (1 + (1 - im.t / im.max) * 0.6),
        vOffset: im.z - 0.11, alpha: Math.max(0, im.t / im.max)
      });
    }
    for (var k = 0; k < G.botFlashes.length; k++) {
      var bf = G.botFlashes[k];
      sprites.push({ x: bf.x, y: bf.y, tex: global.ImpactTex.get('blood'), scale: 0.3, vOffset: bf.z, alpha: bf.t / bf.max });
    }
    G.eng.render(cam, sprites, G.time);
    G.gun.draw();
    drawTracers(cam);
    updateHud(dt);
  }

  /* 弹道拖尾（画在 gun 画布上） */
  function drawTracers(cam) {
    if (!G.tracers.length) return;
    var ctx = G.gun.ctx, W = G.gunCanvas.width, H = G.gunCanvas.height;
    var sc = W / G.eng.w, scY = H / G.eng.h;
    var m = G.gun.muzzleScreen();
    var dirX = Math.cos(cam.ang), dirY = Math.sin(cam.ang);
    var fovRad = cam.fov * Math.PI / 180;
    var aspect = G.eng.aspect || 1.7;
    var planeLen = Math.tan(fovRad / 2);
    var planeX = -dirY * planeLen * aspect / (16 / 9), planeY = dirX * planeLen * aspect / (16 / 9);
    var cz = cam.z, horizon = G.eng.h * 0.5 + cam.pitch;
    var invDet = 1 / (planeX * dirY - dirX * planeY);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < G.tracers.length; i++) {
      var tr = G.tracers[i];
      var fromBot = tr.from === 'bot';
      var spx = tr.x - cam.x, spy = tr.y - cam.y;
      var tX = invDet * (dirY * spx - dirX * spy);
      var tY = invDet * (-planeY * spx + planeX * spy);
      if (tY <= 0.2) continue;
      var sx = (W / 2) * (1 + tX / tY);
      var unitPx = G.eng.h / tY;
      var sy = (horizon - (tr.z - cz) * unitPx) * scY;
      var a = Math.max(0, Math.min(1, tr.t / (fromBot ? 0.08 : 0.09)));
      var x0 = fromBot ? sx : m.x, y0 = fromBot ? sy : m.y;
      var x1 = fromBot ? W / 2 : sx, y1 = fromBot ? H * 0.54 : sy;
      var g = ctx.createLinearGradient(x0, y0, x1, y1);
      if (fromBot) {
        g.addColorStop(0, 'rgba(255,90,80,' + (0.7 * a).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,90,80,0)');
      } else {
        g.addColorStop(0, 'rgba(255,236,180,' + (0.75 * a).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,180,90,0)');
      }
      ctx.strokeStyle = g;
      ctx.lineWidth = (fromBot ? 1.6 : 2.2) * (G.gun.dpr || 1);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 玩家 ---------- */
  function updatePlayer(dt) {
    var p = G.player;
    var speed = p.speed * (p.crouch ? 0.5 : 1);
    var mx = 0, my = 0;
    if (G.keys['w']) my -= 1; if (G.keys['s']) my += 1;
    if (G.keys['a']) mx -= 1; if (G.keys['d']) mx += 1;
    mx += G.joy.x; my += G.joy.y;
    var len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    var dirX = Math.cos(p.ang), dirY = Math.sin(p.ang);
    var vx = (dirX * -my + -dirY * mx) * speed;
    var vy = (dirY * -my + dirX * mx) * speed;

    var res = M.moveWithCollision(p.x, p.y, vx * dt, vy * dt, 0.26);
    var moved = Math.hypot(res[0] - p.x, res[1] - p.y);
    p.x = res[0]; p.y = res[1];
    p.moving = moved > 0.001;

    // 水中减速
    if (M.floorAt(p.x | 0, p.y | 0) === 1 && p.moving) { /* 水面阻力：视觉上已足够 */ }

    // 跳跃（摄像机高度）
    if (p.jump > 0) {
      p.jump -= dt;
      var jt = Math.max(0, p.jump) / 0.34;
      p.z = 0.81 + Math.sin((1 - jt) * Math.PI) * 0.26;
    } else {
      var target = p.crouch ? 0.58 : 0.81;
      p.z += (target - p.z) * Math.min(1, dt * 12);
    }
    // 后坐力回落
    p.pitch *= Math.pow(0.2, dt);
    if (Math.abs(p.pitch) < 0.02) p.pitch = 0;

    // 脚步
    if (p.moving) {
      p.bobT += dt * (p.crouch ? 5 : 8);
      if (p.bobT - (p.lastStep || 0) > 0.42) { p.lastStep = p.bobT; global.Sfx.step(); }
    }
    // 瞄准（ADS）
    var wantAds = G.adsHeld && !p.moving;
    G.ads += ((wantAds ? 1 : 0) - G.ads) * Math.min(1, dt * 9);
    G.gun.ads = G.ads;
    if (G.el.scope) G.el.scope.style.opacity = (G.ads * 0.9).toFixed(2);

    // 受伤后回血（死斗）
    if (G.mode === 'dm' && G.time - G.lastHitAt > 6 && p.hp < 100) {
      p.hp = Math.min(100, p.hp + dt * 12);
    }
    // 死亡
    if (p.hp <= 0 && G.running) {
      global.Sfx.death();
      finish(false);
    }
  }

  /* ---------- BOT ---------- */
  function updateBots(dt) {
    var ctx = {
      px: G.player.x, py: G.player.y, engine: G.eng,
      playerAlive: G.player.hp > 0,
      onShoot: function (bot, hit, dmg) {
        // BOT 枪口闪光
        G.botFlashes.push({ x: bot.x, y: bot.y, z: 0.55, t: 0.09, max: 0.09 });
        global.Sfx.shot(bot.elite ? 'vandal' : 'phantom', Math.hypot(bot.x - G.player.x, bot.y - G.player.y));
        G.tracers.push({ x: bot.x, y: bot.y, z: 0.55, t: 0.08, from: 'bot' });
        if (hit) {
          var armor = G.player.armor;
          var real = dmg;
          if (armor > 0) {
            var absorbed = Math.min(armor, real * 0.66);
            armor -= absorbed; real -= absorbed;
            G.player.armor = Math.max(0, armor);
          }
          G.player.hp -= real;
          G.lastHitAt = G.time;
          global.Sfx.hurt();
          hurtScreen();
          if (G.player.hp <= 0) {
            G.player.hp = 0;
            G.stats.streak = 0;
          }
        }
      }
    };
    for (var i = 0; i < G.bots.length; i++) {
      G.bots[i].update(dt, ctx);
    }
    // 清理
    if (G.bots.length > 60) G.bots = G.bots.filter(function (b) { return b.alive || b.deadT < 1.5; });
  }

  function hurtScreen() {
    var h = G.el.hurt;
    h.style.opacity = Math.min(1, 0.45 + (100 - G.player.hp) / 200);
    clearTimeout(G._hurtT);
    G._hurtT = setTimeout(function () { h.style.opacity = 0; }, 260);
  }

  function updateEffects(dt) {
    for (var i = G.impacts.length - 1; i >= 0; i--) { G.impacts[i].t -= dt; if (G.impacts[i].t <= 0) G.impacts.splice(i, 1); }
    for (var j = G.botFlashes.length - 1; j >= 0; j--) { G.botFlashes[j].t -= dt; if (G.botFlashes[j].t <= 0) G.botFlashes.splice(j, 1); }
    for (var k = G.tracers.length - 1; k >= 0; k--) { G.tracers[k].t -= dt; if (G.tracers[k].t <= 0) G.tracers.splice(k, 1); }
    G.bots = G.bots.filter(function (b) { return b.alive || b.deadT < 3; });
  }

  /* ---------- HUD ---------- */
  var mmT = 0;
  function updateHud(dt) {
    // 生命
    G.el.hp.textContent = Math.max(0, Math.round(G.player.hp));
    G.el.armor.textContent = Math.round(G.player.armor);
    var hb = G.el.hpbar.querySelector('i');
    hb.style.width = Math.max(0, G.player.hp) + '%';
    G.el.hpbar.className = 'hpbar' + (G.player.hp < 35 ? ' low' : '');
    // 计时
    G.el.timerText.textContent = fmtTime(G.time);
    G.el.timerText.className = (G.mode === 'dm' && G.player.hp < 35) ? 'warn' : '';
    G.el.score.textContent = G.stats.kills * 100 + G.stats.hs * 50;
    G.el.kills.textContent = G.stats.kills;
    // 小地图
    mmT += dt;
    if (G.settings.minimap && mmT > 0.12) {
      mmT = 0;
      G.mini.draw(G.player, G.bots);
    }
    // FPS
    G.fpsN++;
    G.fpsT += dt;
    if (G.fpsT >= 0.5) {
      G.fps = Math.round(G.fpsN / G.fpsT);
      G.fpsN = 0; G.fpsT = 0;
      if (G.settings.showFps) G.el.fps.textContent = G.fps + ' FPS';
    }
  }
  function fmtTime(t) {
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  var toastT = null;
  function toast(main, sub) {
    var el = G.el.toast;
    el.innerHTML = main + (sub ? '<span class="sub">' + sub + '</span>' : '');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  G.toast = toast;

  /* ============================================================
     输入
     ============================================================ */
  function bindInput() {
    // 键盘
    window.addEventListener('keydown', function (e) {
      if (!G.running) return;
      var k = e.key.toLowerCase();
      G.keys[k] = true;
      if (k === 'r') startReload();
      if (k === '1') G.setWeapon('vandal');
      if (k === '2') G.setWeapon('phantom');
      if (k === ' ') { G.player.jump = 0.34; e.preventDefault(); }
      if (k === 'c' || k === 'control') G.player.crouch = true;
      if (k === 'escape') { G.paused ? G.resume() : G.pause(); }
      if (k === 'q') G.toggleWeapon();
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key.toLowerCase();
      G.keys[k] = false;
      if (k === 'c' || k === 'control') G.player.crouch = false;
    });

    var vc = G.viewCanvas;
    // 桌面：鼠标视角 + 开火
    vc.addEventListener('mousedown', function (e) {
      if (e.button === 0) { G.firing = true; fire(); }
      if (e.button === 2) G.adsHeld = true;
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) G.firing = false;
      if (e.button === 2) G.adsHeld = false;
    });
    vc.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // 指针锁定（桌面）
    vc.addEventListener('click', function () {
      if (!('ontouchstart' in window) && G.running && document.pointerLockElement !== vc) {
        vc.requestPointerLock && vc.requestPointerLock();
      }
    });
    document.addEventListener('mousemove', function (e) {
      if (document.pointerLockElement === vc && G.running && !G.paused) {
        G.player.ang += e.movementX * 0.0022 * G.settings.sens;
        G.player.pitch -= e.movementY * 0.9 * G.settings.sens;
        clampPitch();
      }
    });
    document.addEventListener('pointerlockchange', function () {
      if (G.running && document.pointerLockElement !== vc) G.pause();
    });

    /* ---- 触屏：摇杆 ---- */
    var base = document.getElementById('joybase'), knob = document.getElementById('joyknob');
    var joyR = 48, joyId = null, joyCx = 0, joyCy = 0;
    function joyStart(e) {
      var t = e.changedTouches[0];
      var r = base.getBoundingClientRect();
      joyCx = r.left + r.width / 2; joyCy = r.top + r.height / 2;
      joyId = t.identifier;
      joyMove(e);
    }
    function joyMove(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier !== joyId) continue;
        var dx = t.clientX - joyCx, dy = t.clientY - joyCy;
        var d = Math.hypot(dx, dy);
        var k = d > joyR ? joyR / d : 1;
        knob.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px)';
        G.joy.x = (dx * k) / joyR;
        G.joy.y = (dy * k) / joyR;
        if (!G.settings.lefty) { G.joy.x *= -1; G.joy.y *= -1; }
      }
      e.preventDefault();
    }
    function joyEnd(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joyId) {
          joyId = null; G.joy.x = 0; G.joy.y = 0;
          knob.style.transform = 'translate(0,0)';
        }
      }
    }
    base.addEventListener('touchstart', joyStart, { passive: false });
    base.addEventListener('touchmove', joyMove, { passive: false });
    base.addEventListener('touchend', joyEnd);
    base.addEventListener('touchcancel', joyEnd);

    /* ---- 触屏：转视角 ---- */
    var look = document.getElementById('lookzone');
    var lookId = null, lx = 0, ly = 0, lT = 0;
    look.addEventListener('touchstart', function (e) {
      var t = e.changedTouches[0];
      lookId = t.identifier; lx = t.clientX; ly = t.clientY; lT = performance.now();
      // 双指射击？
      e.preventDefault();
    }, { passive: false });
    look.addEventListener('touchmove', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier !== lookId) continue;
        var dx = t.clientX - lx, dy = t.clientY - ly;
        lx = t.clientX; ly = t.clientY;
        var sens = 0.0055 * G.settings.sens * (1 - G.ads * 0.5) * (G.settings.adsSens + (1 - G.settings.adsSens) * (1 - G.ads));
        G.player.ang += dx * sens;
        G.player.pitch -= dy * sens * 170;
        clampPitch();
      }
      e.preventDefault();
    }, { passive: false });
    function lookEnd(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookId) lookId = null;
      }
    }
    look.addEventListener('touchend', lookEnd);
    look.addEventListener('touchcancel', lookEnd);
    // 触屏时：右侧区域按住也能开火（可关）
    look.addEventListener('touchstart', function (e) {
      if (G.settings.fireAnywhere && !G.settings.autoFire) { G.firing = true; }
    }, { passive: true });
    look.addEventListener('touchend', function () { G.firing = false; }, { passive: true });
    look.addEventListener('touchcancel', function () { G.firing = false; }, { passive: true });

    function hold(el, on, off) {
      el.addEventListener('touchstart', function (e) { e.preventDefault(); el.classList.add('on'); on(); }, { passive: false });
      el.addEventListener('touchend', function (e) { e.preventDefault(); el.classList.remove('on'); off && off(); }, { passive: false });
      el.addEventListener('touchcancel', function () { el.classList.remove('on'); off && off(); });
      el.addEventListener('mousedown', function (e) { e.preventDefault(); on(); });
      el.addEventListener('mouseup', function () { off && off(); });
    }
    hold(document.getElementById('btnFire'), function () { G.firing = true; fire(); }, function () { G.firing = false; });
    hold(document.getElementById('btnADS'), function () { G.adsHeld = true; }, function () { G.adsHeld = false; });
    hold(document.getElementById('btnCrouch'), function () { G.player.crouch = true; }, function () { G.player.crouch = false; });
    document.getElementById('btnJump').addEventListener('touchstart', function (e) { e.preventDefault(); G.player.jump = 0.34; }, { passive: false });
    document.getElementById('btnJump').addEventListener('mousedown', function () { G.player.jump = 0.34; });
    document.getElementById('btnReload').addEventListener('touchstart', function (e) { e.preventDefault(); startReload(); }, { passive: false });
    document.getElementById('btnReload').addEventListener('mousedown', startReload);
    document.getElementById('btnSwap').addEventListener('touchstart', function (e) { e.preventDefault(); G.toggleWeapon(); }, { passive: false });
    document.getElementById('btnSwap').addEventListener('mousedown', G.toggleWeapon);
  }
  function clampPitch() {
    var lim = G.eng.h * 0.5;
    if (G.player.pitch > lim) G.player.pitch = lim;
    if (G.player.pitch < -lim) G.player.pitch = -lim;
  }

  G.startReload = startReload;
  G.finish = finish;
  G.onResize = onResize;
  global.Game = G;
})(window);
