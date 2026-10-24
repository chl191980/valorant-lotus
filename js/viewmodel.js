/* ============================================================
   viewmodel.js —— 第一人称武器视图模型（真实枪皮渲染图 + 程序化后坐力/枪口焰）
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 图片缓存 ---------- */
  var cache = {};
  var Images = {
    get: function (url) {
      if (!url) return null;
      var e = cache[url];
      if (!e) {
        e = cache[url] = { img: new Image(), ok: false, err: false };
        e.img.onload = function () { e.ok = true; };
        e.img.onerror = function () { e.err = true; };
        e.img.src = url;
      }
      return e.ok ? e.img : null;
    },
    status: function (url) {
      var e = cache[url];
      return !e ? 'none' : e.ok ? 'ok' : e.err ? 'err' : 'loading';
    },
    raw: function (url) {
      if (!url) return null;
      var e = cache[url];
      if (!e) { Images.get(url); return null; }
      return e.img;
    }
  };

  /* ---------- 程序化贴图：枪口焰 / 弹着烟尘 ---------- */
  function makeFlash() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 128;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(.25, 'rgba(255,214,120,.92)');
    g.addColorStop(.55, 'rgba(255,150,40,.42)');
    g.addColorStop(1, 'rgba(255,120,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    c.strokeStyle = 'rgba(255,240,200,.85)'; c.lineWidth = 3;
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2 + .3;
      c.beginPath(); c.moveTo(64, 64);
      c.lineTo(64 + Math.cos(a) * (30 + Math.random() * 30), 64 + Math.sin(a) * (30 + Math.random() * 30));
      c.stroke();
    }
    return cv;
  }
  function makeSmoke() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 32;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,240,210,.9)');
    g.addColorStop(.4, 'rgba(210,190,160,.5)');
    g.addColorStop(1, 'rgba(180,160,130,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
    return cv;
  }
  function makeBlood() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 32;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,236,120,.95)');
    g.addColorStop(.35, 'rgba(255,120,60,.55)');
    g.addColorStop(1, 'rgba(255,80,40,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
    return cv;
  }

  var flashCv = null, smokeCv = null, bloodCv = null;
  function texFromCanvas(cv) {
    var c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    var x = c2.getContext('2d');
    x.drawImage(cv, 0, 0);
    var d = x.getImageData(0, 0, cv.width, cv.height);
    return { w: cv.width, h: cv.height, data: new Uint32Array(d.data.buffer), canvas: c2 };
  }
  var ImpactTex = {
    smoke: null, blood: null,
    get: function (kind) {
      if (!smokeCv) { smokeCv = makeSmoke(); bloodCv = makeBlood(); }
      if (kind === 'blood') { if (!ImpactTex.blood) ImpactTex.blood = texFromCanvas(bloodCv); return ImpactTex.blood; }
      if (!ImpactTex.smoke) ImpactTex.smoke = texFromCanvas(smokeCv);
      return ImpactTex.smoke;
    }
  };

  /* ---------- 视图模型 ---------- */
  function GunView(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wpn = 'vandal';
    this.skin = null;         // {ic, name, ...}
    this.variant = 0;
    this.recoil = 0;          // 0..1
    this.kick = 0;
    this.bobT = 0;
    this.reloadT = 0;         // 剩余换弹时间
    this.reloadDur = 2.5;
    this.ads = 0;             // 0..1
    this.flash = 0;
    this.swapT = 0;
    this.mirror = false;
    this.reserveImg = null;
    this.resize();
  }

  GunView.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round((this.canvas.clientWidth || window.innerWidth) * dpr);
    this.canvas.height = Math.round((this.canvas.clientHeight || window.innerHeight) * dpr);
    this.dpr = dpr;
  };

  GunView.prototype.setWeapon = function (wpn, skin, variant) {
    this.wpn = wpn;
    this.skin = skin || null;
    this.variant = variant || 0;
    this.equipT = 0.42;
    var url = skin ? (skin.ic || skin.icr) : null;
    this.reserveImg = url ? Images.raw(url) : null;
    if (skin && skin.icr && skin.ic !== skin.icr) Images.get(skin.icr);   // 远程兜底预取
  };

  GunView.prototype.triggerFire = function () {
    this.kick = Math.min(1, this.kick + 0.55);
    this.flash = 1;
  };
  GunView.prototype.triggerReload = function (dur) {
    this.reloadDur = dur || 2.5;
    this.reloadT = this.reloadDur;
  };

  /* 枪口在世界中的屏幕位置（用于弹道拖尾起点） */
  GunView.prototype.muzzleScreen = function () {
    var W = this.canvas.width, H = this.canvas.height;
    var base = this.layout();
    return { x: base.mx, y: base.my };
  };

  // 枪口在图片里的相对位置（枪皮渲染图 512x148，枪管朝左）
  var MUZZLE_U = -0.455, MUZZLE_V = -0.175;

  GunView.prototype.layout = function () {
    var W = this.canvas.width, H = this.canvas.height;
    var adsK = this.ads;
    // 按“屏宽”定尺寸：枪身横向约占 46% 屏宽，高度按图片比例
    var w = W * (0.50 - 0.13 * adsK);
    var gunH = w * (148 / 512);
    var cx = W * (0.70 - 0.18 * adsK);
    var cy = H * (0.93 - 0.05 * adsK);
    // 后坐力
    var rec = this.kick;
    cx += W * 0.014 * rec;
    cy += H * 0.05 * rec;
    // 走动摆动
    var bob = Math.sin(this.bobT) * (1 - adsK);
    var bob2 = Math.cos(this.bobT * 2) * (1 - adsK);
    cx += W * 0.013 * bob;
    cy += H * 0.016 * Math.abs(bob2);
    var rot = 0.13 + 0.10 * rec + 0.02 * bob;
    // 换弹：下沉 + 旋转
    var rp = 0;
    if (this.reloadT > 0) {
      var t = 1 - this.reloadT / this.reloadDur;
      rp = Math.sin(Math.min(1, t * 1.15) * Math.PI);
      cy += H * 0.26 * rp;
      rot -= 0.55 * rp;
      cx -= W * 0.045 * rp;
    }
    // 换枪
    if (this.equipT > 0) {
      var e = 1 - this.equipT / 0.42;
      cy += H * 0.45 * (1 - e);
      rot -= 0.7 * (1 - e);
    }
    // 枪口世界坐标（含透视 skew + 旋转）
    var px = MUZZLE_U * w, py = MUZZLE_V * gunH;
    var sx = px + 0.10 * py, sy = 0.06 * px + py;
    var mx = cx + sx * Math.cos(rot) - sy * Math.sin(rot);
    var my = cy + sx * Math.sin(rot) + sy * Math.cos(rot);
    return { W: W, H: H, w: w, h: gunH, cx: cx, cy: cy, rot: rot, mx: mx, my: my };
  };

  GunView.prototype.update = function (dt, moving, sprint) {
    this.kick = Math.max(0, this.kick - dt * 6.5);
    this.flash = Math.max(0, this.flash - dt * 14);
    if (this.equipT > 0) this.equipT = Math.max(0, this.equipT - dt);
    if (this.reloadT > 0) {
      this.reloadT = Math.max(0, this.reloadT - dt);
      if (this.reloadT === 0 && this.onReloadDone) { var f = this.onReloadDone; this.onReloadDone = null; f(); }
    }
    var speed = moving ? (sprint ? 9.5 : 6.6) : 2.2;
    this.bobT += dt * speed * (moving ? 1 : 0.35);
  };

  GunView.prototype.currentImg = function () {
    var sk = this.skin;
    if (!sk) return null;
    if (sk.ic && Images.status(sk.ic) === 'err' && sk.icr) return Images.raw(sk.icr);
    return Images.raw(sk.ic || sk.icr);
  };

  GunView.prototype.draw = function () {
    var ctx = this.ctx, L = this.layout();
    ctx.clearRect(0, 0, L.W, L.H);

    var img = this.currentImg();
    ctx.save();
    ctx.translate(L.cx, L.cy);
    ctx.rotate(L.rot);
    // 伪透视
    ctx.transform(1, 0.06, 0.10, 1, 0, 0);
    if (this.mirror) ctx.scale(-1, 1);
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, -L.w / 2, -L.h / 2, L.w, L.h);
    } else {
      // 兜底：程序化枪身高光块
      var g = ctx.createLinearGradient(0, -L.h / 2, 0, L.h / 2);
      g.addColorStop(0, '#4a5560'); g.addColorStop(1, '#161c22');
      ctx.fillStyle = g;
      ctx.fillRect(-L.w / 2, -L.h / 2, L.w, L.h);
      ctx.fillStyle = 'rgba(240,198,116,.6)';
      ctx.fillRect(-L.w / 2, -L.h / 2 + L.h * 0.42, L.w, 3);
    }
    // 枪口焰
    if (this.flash > 0.02) {
      if (!flashCv) flashCv = makeFlash();
      ctx.save();
      ctx.translate(MUZZLE_U * L.w, MUZZLE_V * L.h);
      var s = L.h * (0.7 + Math.random() * 0.35) * (0.55 + this.flash * 0.75);
      ctx.globalAlpha = Math.min(1, this.flash * 1.3);
      ctx.globalCompositeOperation = 'lighter';
      ctx.rotate(Math.random() * 0.6 - 0.3);
      ctx.drawImage(flashCv, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.restore();

    // 底部阴影 / 光晕，让枪更“贴”在画面里
    var vg = ctx.createLinearGradient(0, L.H * 0.55, 0, L.H);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, L.H * 0.55, L.W, L.H * 0.45);
  };

  /* ============================================================
     皮肤检视（展示）画面：旋转展台 + 光效
     ============================================================ */
  function Inspector(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.skin = null;
    this.variant = 0;
    this.effect = true;
    this.parts = [];
    for (var i = 0; i < 26; i++) {
      this.parts.push({ x: Math.random(), y: Math.random(), s: 0.2 + Math.random(), v: 0.02 + Math.random() * 0.05 });
    }
  }
  Inspector.prototype.setSkin = function (skin, variant) { this.skin = skin; this.variant = variant || 0; };
  Inspector.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.c.width = Math.round((this.c.clientWidth || 320) * dpr);
    this.c.height = Math.round((this.c.clientHeight || 260) * dpr);
    this.dpr = dpr;
  };
  Inspector.prototype.update = function (dt) {
    this.t += dt;
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      p.y -= p.v * dt;
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
    }
  };
  Inspector.prototype.draw = function () {
    var ctx = this.ctx, W = this.c.width, H = this.c.height;
    ctx.clearRect(0, 0, W, H);
    var t = this.t;
    // 背景光
    var g = ctx.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,.14)');
    g.addColorStop(.5, 'rgba(60,90,120,.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 粒子
    if (this.effect) {
      ctx.fillStyle = 'rgba(255,220,150,.5)';
      for (var i = 0; i < this.parts.length; i++) {
        var p = this.parts[i];
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, p.s * this.dpr * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 展台
    ctx.save();
    ctx.translate(W / 2, H * 0.66);
    var rw = W * 0.34;
    ctx.strokeStyle = 'rgba(240,198,116,.5)'; ctx.lineWidth = 2 * this.dpr;
    for (var k = 0; k < 3; k++) {
      var rr = rw * (0.6 + k * 0.2);
      ctx.beginPath();
      ctx.ellipse(0, 0, rr, rr * 0.17, 0, 0, Math.PI * 2);
      ctx.globalAlpha = 0.6 - k * 0.15;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    var s = (1 + Math.sin(t * 0.9) * 0.03) * this.dpr;
    ctx.scale(s, s);
    var sk = this.skin;
    var img = sk ? ((sk.ic && Images.status(sk.ic) === 'err' && sk.icr) ? Images.raw(sk.icr) : Images.raw(sk.ic || sk.icr)) : null;
    var gw = W * 0.78, gh = gw * 0.25;
    if (img && img.complete && img.naturalWidth) {
      // 轻微 3D 旋转感：水平缩放 + 上下浮动
      var rot = Math.sin(t * 0.55) * 0.12;
      ctx.rotate(rot * 0.3);
      ctx.drawImage(img, -gw / 2, -gh / 2 - gh * 0.7, gw, gh);
    } else {
      ctx.fillStyle = '#39434d';
      ctx.fillRect(-gw / 2, -gh * 1.2, gw, gh);
    }
    ctx.restore();
    if (this.effect) {
      // 呼吸光
      var pulse = 0.5 + Math.sin(t * 2.2) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var rg = ctx.createRadialGradient(W / 2, H * 0.5, 4, W / 2, H * 0.5, W * 0.42);
      rg.addColorStop(0, 'rgba(255,180,90,' + (0.05 + pulse * 0.06).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,180,90,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  };

  global.GunView = GunView;
  global.Inspector = Inspector;
  global.VMImages = Images;
  global.ImpactTex = ImpactTex;
})(window);
