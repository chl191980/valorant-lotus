/* ============================================================
   bots.js —— 训练 BOT（程序化精灵 + AI）
   ============================================================ */
(function (global) {
  'use strict';
  var M = global.LotusMap;

  /* ---------- 精灵生成 ---------- */
  var SW = 64, SH = 96;
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawBot(c, base, dark, accent, elite) {
    c.clearRect(0, 0, SW, SH);
    // 腿
    c.fillStyle = dark;
    roundRect(c, 18, 60, 11, 34, 4); c.fill();
    roundRect(c, 35, 60, 11, 34, 4); c.fill();
    c.fillStyle = base;
    roundRect(c, 16, 54, 15, 16, 5); c.fill();
    roundRect(c, 33, 54, 15, 16, 5); c.fill();
    // 躯干
    var g = c.createLinearGradient(0, 24, 0, 66);
    g.addColorStop(0, base); g.addColorStop(1, dark);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(17, 26); c.lineTo(47, 26); c.lineTo(50, 62); c.lineTo(14, 62); c.closePath(); c.fill();
    // 胸甲
    c.fillStyle = 'rgba(255,255,255,.10)';
    c.beginPath(); c.moveTo(20, 29); c.lineTo(44, 29); c.lineTo(46, 46); c.lineTo(18, 46); c.closePath(); c.fill();
    // 核心
    var gr = c.createRadialGradient(32, 42, 1, 32, 42, 9);
    gr.addColorStop(0, '#fff'); gr.addColorStop(.35, accent); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.beginPath(); c.arc(32, 42, 9, 0, Math.PI * 2); c.fill();
    c.strokeStyle = accent; c.lineWidth = 1.6;
    c.beginPath(); c.arc(32, 42, 6.5, 0, Math.PI * 2); c.stroke();
    // 手臂
    c.fillStyle = base;
    roundRect(c, 8, 30, 10, 30, 5); c.fill();
    roundRect(c, 46, 30, 10, 30, 5); c.fill();
    c.fillStyle = dark;
    roundRect(c, 6, 56, 12, 10, 4); c.fill();
    roundRect(c, 46, 56, 12, 10, 4); c.fill();
    // 头
    c.fillStyle = base;
    roundRect(c, 23, 8, 18, 18, 6); c.fill();
    c.fillStyle = 'rgba(0,0,0,.55)';
    roundRect(c, 24, 14, 16, 7, 3); c.fill();
    c.fillStyle = accent;
    roundRect(c, 25.5, 16, 6, 3.4, 1.6); c.fill();
    roundRect(c, 33, 16, 5.5, 3.4, 1.6); c.fill();
    // 天线
    c.strokeStyle = dark; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(32, 8); c.lineTo(32, 2); c.stroke();
    c.fillStyle = accent;
    c.beginPath(); c.arc(32, 2.5, 2, 0, Math.PI * 2); c.fill();
    if (elite) {
      c.strokeStyle = 'rgba(240,198,116,.9)'; c.lineWidth = 2;
      c.beginPath(); c.arc(32, 44, 26, 0, Math.PI * 2); c.stroke();
    }
  }

  var _texCache = {};
  function botTex(kind) {
    if (_texCache[kind]) return _texCache[kind];
    var pal = {
      range: ['#8d9aa6', '#4b565f', '#4fe3ff', false],
      red: ['#c05a58', '#5c2b2c', '#ff6b57', false],
      purple: ['#8b6fc0', '#3d2f57', '#c99cff', false],
      gold: ['#d8b25e', '#6b5324', '#ffe08a', true],
      blue: ['#5f7fae', '#2c3c58', '#63c8ff', false]
    }[kind] || ['#8d9aa6', '#4b565f', '#4fe3ff', false];
    var cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
    var c = cv.getContext('2d');
    drawBot(c, pal[0], pal[1], pal[2], pal[3]);
    var normal = texOf(cv);
    // 受击闪白
    var cv2 = document.createElement('canvas'); cv2.width = SW; cv2.height = SH;
    var c2 = cv2.getContext('2d');
    c2.drawImage(cv, 0, 0);
    c2.globalCompositeOperation = 'source-atop';
    c2.fillStyle = 'rgba(255,255,255,.88)';
    c2.fillRect(0, 0, SW, SH);
    var flash = texOf(cv2);
    _texCache[kind] = { normal: normal, flash: flash, w: SW, h: SH };
    return _texCache[kind];
  }
  function texOf(cv) {
    var c = cv.getContext('2d');
    var d = c.getImageData(0, 0, cv.width, cv.height);
    return { w: cv.width, h: cv.height, data: new Uint32Array(d.data.buffer), canvas: cv };
  }

  /* ---------- BOT 实体 ---------- */
  var UID = 1;
  function Bot(opt) {
    this.id = UID++;
    this.x = opt.x; this.y = opt.y;
    this.hp = opt.hp || 100;
    this.maxHp = this.hp;
    this.kind = opt.kind || 'range';
    this.elite = this.kind === 'gold';
    this.mode = opt.mode || 'range';       // range | dm
    this.site = opt.site || 0;
    this.patrol = (M.PATROL[this.site] || M.PATROL[0]).slice();
    this.pi = (Math.random() * this.patrol.length) | 0;
    this.angle = Math.random() * Math.PI * 2;
    this.alive = true;
    this.deadT = 0;
    this.hitT = 0;
    this.bob = Math.random() * 6.28;
    this.speed = opt.speed || 1.5;
    this.fireCd = 1 + Math.random() * 1.5;
    this.aimT = 0;
    this.state = 'patrol';
    this.lastSeen = null;
    this.scale = 0.86;
    this.tex = botTex(this.kind);
    this.strafe = Math.random() < .5 ? 1 : -1;
    this.strafeT = 1 + Math.random() * 2;
    this.spot = 0;
    this.aggro = 0;
  }

  Bot.prototype.sprite = function () {
    var t = this.tex;
    var s = this.scale;
    var sy = 1, alpha = 1, vOff = 0;
    if (!this.alive) {
      var k = Math.min(1, this.deadT / 0.75);
      sy = Math.max(0.06, 1 - k * 0.94);
      alpha = Math.max(0, 1 - k * 1.05);
      s = s * (1 + k * 0.12);
    } else {
      vOff = Math.abs(Math.sin(this.bob)) * 0.012;
    }
    return {
      x: this.x, y: this.y,
      tex: (this.hitT > 0 ? t.flash : t.normal),
      scale: s, sy: sy, sx: this.alive ? 1 : (1 + Math.min(1, this.deadT / .75) * .25),
      vOffset: vOff, alpha: alpha, bot: this
    };
  };

  /* 视线 */
  Bot.prototype.canSee = function (px, py, engine, maxD) {
    var d = Math.hypot(px - this.x, py - this.y);
    if (maxD && d > maxD) return false;
    return engine.hasLineOfSight(this.x, this.y, px, py);
  };

  /* 移动：带碰撞的转向 */
  function steer(b, tx, ty, dt, speed) {
    var dx = tx - b.x, dy = ty - b.y;
    var d = Math.hypot(dx, dy);
    if (d < 0.06) return true;
    dx /= d; dy /= d;
    var nx = b.x + dx * speed * dt, ny = b.y + dy * speed * dt;
    if (!M.hitCircle(nx, b.y, 0.34)) b.x = nx;
    else if (!M.hitCircle(b.x, ny, 0.34)) b.y = ny;
    else {
      // 卡住时沿墙滑动
      var t = b.strafe;
      var sx = b.x + dy * t * speed * dt, sy2 = b.y - dx * t * speed * dt;
      if (!M.hitCircle(sx, sy2, 0.34)) { b.x = sx; b.y = sy2; }
    }
    return false;
  }

  /* 更新
     ctx: { px, py, engine, onShoot(bot, hit), onHitPlayer(dmg, bot), playerAlive } */
  Bot.prototype.update = function (dt, ctx) {
    if (!this.alive) { this.deadT += dt; return; }
    if (this.hitT > 0) this.hitT -= dt;
    var px = ctx.px, py = ctx.py;

    if (this.mode === 'range') {
      this.bob += dt * 1.2;
      this.angle += dt * 0.25;
      return;
    }

    var dist = Math.hypot(px - this.x, py - this.y);
    var sees = ctx.playerAlive && dist < 26 && this.canSee(px, py, ctx.engine, 26);
    if (sees) { this.lastSeen = { x: px, y: py }; this.aggro = 3.2; this.spot = Math.min(1, this.spot + dt * 3); }
    else { this.aggro -= dt; this.spot = Math.max(0, this.spot - dt * 1.5); }

    if (sees) {
      this.state = 'combat';
      var want = 6.5;
      var ang = Math.atan2(py - this.y, px - this.x);
      // 平滑转向
      var diff = ((ang - this.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.angle += diff * Math.min(1, dt * 7);
      // 保持距离 + 侧移
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 1 + Math.random() * 1.8; this.strafe *= -1; }
      var mvA = ang + (dist < want - 1 ? Math.PI : 0) * (dist < want - 1 ? 1 : 0);
      var vx = Math.cos(ang), vy = Math.sin(ang);
      var speed = this.speed * (this.elite ? 1.15 : 1) * 0.85;
      var nx = this.x + (vx * (dist > want ? 1 : dist < want - 2 ? -1 : 0)) * speed * dt
        + (-vy * this.strafe) * speed * 0.7 * dt;
      var ny = this.y + (vy * (dist > want ? 1 : dist < want - 2 ? -1 : 0)) * speed * dt
        + (vx * this.strafe) * speed * 0.7 * dt;
      if (!M.hitCircle(nx, this.y, 0.34)) this.x = nx;
      if (!M.hitCircle(this.x, ny, 0.34)) this.y = ny;

      // 开火
      this.fireCd -= dt;
      if (this.fireCd <= 0 && dist < 24) {
        this.fireCd = (this.elite ? 0.55 : 0.85) + Math.random() * 0.85;
        var hitChance = Math.max(0.10, Math.min(0.66, 0.72 - dist * 0.03));
        var hit = Math.random() < hitChance;
        var dmg = hit ? (7 + Math.random() * (this.elite ? 9 : 6)) | 0 : 0;
        ctx.onShoot(this, hit, dmg);
      }
    } else if (this.aggro > 0 && this.lastSeen) {
      this.state = 'search';
      var done = steer(this, this.lastSeen.x, this.lastSeen.y, dt, this.speed * 0.9);
      this.angle = Math.atan2(this.lastSeen.y - this.y, this.lastSeen.x - this.x);
      if (done || !this.canSee(this.lastSeen.x, this.lastSeen.y, ctx.engine)) this.aggro -= dt * 0.6;
    } else {
      this.state = 'patrol';
      var tp = this.patrol[this.pi];
      if (steer(this, tp[0], tp[1], dt, this.speed)) {
        this.pi = (this.pi + 1) % this.patrol.length;
      }
      var ta = Math.atan2(tp[1] - this.y, tp[0] - this.x);
      var d2 = ((ta - this.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.angle += d2 * Math.min(1, dt * 4);
    }
    this.bob += dt * (this.state === 'combat' ? 7 : 4.5);
  };

  /* 命中判定：返回 {part, dmg} 或 null */
  Bot.prototype.hitTest = function (hitHeight) {
    // hitHeight: 世界高度 0=地面 1=2m
    var top = this.scale;              // 精灵顶部世界高度（约 0.86 → 1.72m）
    if (hitHeight > top || hitHeight < 0) return null;   // 从头顶/脚下飞过
    if (hitHeight > top * 0.87) return { part: 'head', k: 1 };
    if (hitHeight > top * 0.40) return { part: 'body', k: 2 };
    return { part: 'legs', k: 3 };
  };

  global.Bot = Bot;
  global.botTex = botTex;
  global.BOT_SPRITE_SIZE = { w: SW, h: SH };
})(window);
