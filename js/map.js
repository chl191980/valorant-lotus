/* ============================================================
   map.js —— 莲花古城 LOTUS 地图 + 程序化贴图
   贴图数据统一为 Uint32Array（与 canvas ImageData 的 ABGR 小端一致）
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 伪随机 ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(20240610);

  /* ---------- 贴图生成：先铺底色像素，再用 canvas 叠加花纹，最后一次性读回 ---------- */
  var TS = 64;                       // 贴图尺寸
  function rgb(r, g, b) {
    r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
    g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
    b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    return (255 << 24) | (b << 16) | (g << 8) | r;
  }
  function shade(c, k) {
    var r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
    return rgb(r * k, g * k, b * k);
  }
  function noise(k) { return 1 - k / 2 + rnd() * k; }

  function makeTex(baseFn, drawFn) {
    var cv = document.createElement('canvas');
    cv.width = TS; cv.height = TS;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(TS, TS);
    var data = new Uint32Array(img.data.buffer);
    if (baseFn) baseFn(data);
    ctx.putImageData(img, 0, 0);
    if (drawFn) { ctx.save(); drawFn(ctx); ctx.restore(); }
    var back = ctx.getImageData(0, 0, TS, TS);
    var out = new Uint32Array(back.data.length);
    out.set(new Uint32Array(back.data.buffer));
    return { w: TS, h: TS, data: out, canvas: cv };
  }

  /* ---- 砂岩砖 ---- */
  function baseSandstone(base, mortar, rows, cols) {
    return function (data) {
      for (var y = 0; y < TS; y++) {
        for (var x = 0; x < TS; x++) {
          var bh = TS / rows, bw = TS / cols;
          var ry = Math.floor(y / bh);
          var off = (ry % 2) * bw / 2;
          var inMortar = (y % bh < 1.6) || (((x + off) % bw) < 1.6);
          var c = inMortar ? mortar : base;
          data[y * TS + x] = shade(c, noise(0.13) * (1 - ry * 0.01));
        }
      }
    };
  }
  function drawLotus(gold) {
    return function (c) {
      c.strokeStyle = gold; c.fillStyle = 'rgba(240,198,116,.30)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(32, 30, 13, 0, Math.PI * 2); c.fill(); c.stroke();
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * Math.PI * 2;
        c.beginPath();
        c.ellipse(32 + Math.cos(a) * 7, 30 + Math.sin(a) * 7, 4.5, 7.5, a, 0, Math.PI * 2);
        c.stroke();
      }
      c.beginPath(); c.moveTo(6, 56); c.lineTo(58, 56); c.stroke();
    };
  }

  /* ---- 木墙（青绿漆 + 金线） ---- */
  function baseWood(base) {
    return function (data) {
      for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
        var plank = Math.floor(x / 8) % 2;
        var k = noise(0.09) * (plank ? 0.93 : 1.03);
        var c = (x % 8 < 1) ? shade(base, 0.6) : base;
        data[y * TS + x] = shade(c, k);
      }
    };
  }
  function drawWoodTrim(c) {
    c.strokeStyle = 'rgba(240,198,116,.6)'; c.lineWidth = 1.4;
    c.strokeRect(4.5, 4.5, 55, 55);
    c.beginPath(); c.arc(32, 32, 10, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    for (var i = 0; i <= 8; i++) { var a = i / 8 * Math.PI * 2; c[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * 10, 32 + Math.sin(a) * 10); }
    c.stroke();
  }

  /* ---- 木箱 ---- */
  function baseCrate(data) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
      var c = rgb(122, 88, 52);
      if (x % 16 < 1 || y % 16 < 1) c = rgb(70, 48, 28);
      data[y * TS + x] = shade(c, noise(0.15));
    }
  }
  function drawCrate(c) {
    c.strokeStyle = 'rgba(40,26,14,.9)'; c.lineWidth = 3;
    c.strokeRect(2, 2, 60, 60);
    c.strokeStyle = 'rgba(206,176,116,.35)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(4, 4); c.lineTo(60, 60); c.moveTo(60, 4); c.lineTo(4, 60); c.stroke();
  }

  /* ---- 石柱 ---- */
  function basePillar(data) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
      var fl = Math.abs(Math.sin(x / TS * Math.PI * 5));
      var c = shade(rgb(196, 172, 132), 0.72 + fl * 0.34);
      data[y * TS + x] = shade(c, noise(0.1));
    }
  }
  function drawPillar(c) {
    c.fillStyle = 'rgba(240,198,116,.55)';
    c.fillRect(0, 8, 64, 3); c.fillRect(0, 52, 64, 3);
    c.fillStyle = 'rgba(0,0,0,.18)';
    c.fillRect(0, 11, 64, 2);
  }

  /* ---- 神像 ---- */
  function baseStone(data) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) data[y * TS + x] = shade(rgb(104, 96, 88), noise(0.18));
  }
  function drawStatue(c) {
    // 神像：光环 + 头冠 + 披肩 + 盘坐底座
    c.fillStyle = 'rgba(38,34,32,.95)';
    // 光环
    c.strokeStyle = 'rgba(240,198,116,.55)'; c.lineWidth = 2;
    c.beginPath(); c.arc(32, 20, 15, 0, Math.PI * 2); c.stroke();
    // 头 + 头冠
    c.beginPath(); c.arc(32, 20, 8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(32, 6); c.lineTo(37, 13); c.lineTo(27, 13); c.closePath(); c.fill();
    // 眼
    c.fillStyle = 'rgba(255,196,90,.95)';
    c.beginPath(); c.arc(29, 19, 1.6, 0, Math.PI * 2); c.arc(35, 19, 1.6, 0, Math.PI * 2); c.fill();
    // 身/披肩
    c.fillStyle = 'rgba(38,34,32,.95)';
    c.beginPath();
    c.moveTo(32, 28); c.lineTo(46, 38); c.lineTo(43, 52); c.lineTo(21, 52); c.lineTo(18, 38); c.closePath(); c.fill();
    // 盘坐底座
    c.beginPath(); c.ellipse(32, 54, 20, 6, 0, 0, Math.PI * 2); c.fill();
    // 金饰
    c.strokeStyle = 'rgba(240,198,116,.75)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(24, 40); c.quadraticCurveTo(32, 48, 40, 40); c.stroke();
    c.beginPath(); c.moveTo(22, 50); c.lineTo(42, 50); c.stroke();
    c.fillStyle = 'rgba(240,198,116,.55)';
    c.beginPath(); c.arc(32, 44, 2, 0, Math.PI * 2); c.fill();
  }

  /* ---- 植物（绿篱） ---- */
  function basePlant(data) {
    // 多层“叶片”圆斑叠加，越靠上越亮，底部压暗
    var leaves = [];
    for (var i = 0; i < 26; i++) {
      leaves.push({ x: rnd() * TS, y: 18 + rnd() * 46, r: 5 + rnd() * 9, k: 0.7 + rnd() * 0.5 });
    }
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
      var base = rgb(26, 62, 44);
      if (y < 10) base = shade(base, 0.72);
      var c = base;
      for (var j = 0; j < leaves.length; j++) {
        var L = leaves[j];
        if (Math.hypot(x - L.x, y - L.y) < L.r) {
          var light = 0.75 + (1 - y / TS) * 0.5;
          c = shade(rgb(52, 116, 66), light * L.k);
        }
      }
      data[y * TS + x] = shade(c, noise(0.14));
    }
  }

  /* ---- 金门（旋转门） ---- */
  function baseDoor(data) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
      var c = rgb(178, 132, 52);
      if (x < 3 || x > 60 || y < 3 || y > 60) c = rgb(96, 68, 26);
      data[y * TS + x] = shade(c, noise(0.11));
    }
  }
  function drawDoor(c) {
    c.strokeStyle = 'rgba(255,232,170,.85)'; c.lineWidth = 2;
    c.beginPath(); c.arc(32, 32, 16, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(32, 32, 8, 0, Math.PI * 2); c.stroke();
    for (var i = 0; i < 4; i++) {
      var a = i / 4 * Math.PI * 2 + 0.4;
      c.beginPath(); c.moveTo(32, 32); c.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28); c.stroke();
    }
  }

  /* ---- 地面 ---- */
  function baseFloorStone(base, tile) {
    return function (data) {
      for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
        var gx = Math.floor(x / tile), gy = Math.floor(y / tile);
        var edge = (x % tile < 1.5) || (y % tile < 1.5);
        var c = edge ? shade(base, 0.66) : shade(base, 0.9 + ((gx + gy) % 2) * 0.16);
        data[y * TS + x] = shade(c, noise(0.11));
      }
    };
  }
  function baseWater(data) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
      var w = Math.sin(x * 0.22 + y * 0.13) + Math.sin(y * 0.31 - x * 0.09) + Math.sin((x + y) * 0.07);
      var c = rgb(26 + w * 14, 96 + w * 30, 110 + w * 34);
      data[y * TS + x] = shade(c, noise(0.09));
    }
  }
  function drawWaterRipples(c) {
    c.strokeStyle = 'rgba(190,245,255,.35)'; c.lineWidth = 1.2;
    for (var i = 0; i < 5; i++) {
      c.beginPath();
      c.ellipse(6 + i * 13, 16 + (i % 3) * 16, 10, 3.4, 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
  function baseFloorSite(data) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
      var gx = Math.floor(x / 32), gy = Math.floor(y / 32);
      var edge = (x % 32 < 1.5) || (y % 32 < 1.5);
      var c = edge ? rgb(56, 50, 48) : shade(rgb(84, 78, 76), 0.94 + ((gx + gy) % 2) * 0.1);
      data[y * TS + x] = shade(c, noise(0.1));
    }
  }
  function drawSiteTrim(c) {   // 低调的金色包边
    c.strokeStyle = 'rgba(240,198,116,.55)'; c.lineWidth = 1.6;
    c.strokeRect(3, 3, 58, 58);
    c.fillStyle = 'rgba(240,198,116,.5)';
    c.beginPath(); c.moveTo(32, 6); c.lineTo(36, 12); c.lineTo(32, 18); c.lineTo(28, 12); c.closePath(); c.fill();
  }
  function drawSiteMotif(c) {   // 包点中心：大莲花金纹
    c.save();
    c.translate(32, 32);
    c.strokeStyle = 'rgba(240,198,116,.9)'; c.lineWidth = 2.4;
    c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(240,198,116,.20)';
    c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.fill();
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2;
      c.beginPath();
      c.ellipse(Math.cos(a) * 11, Math.sin(a) * 11, 4, 8, a + Math.PI / 2, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }
  function baseFloorSand(data) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
      data[y * TS + x] = shade(rgb(178, 154, 118), noise(0.2));
    }
  }
  function drawSandSpecks(c) {
    c.fillStyle = 'rgba(120,96,64,.35)';
    for (var i = 0; i < 60; i++) c.fillRect(rnd() * 64, rnd() * 64, 1 + rnd() * 2, 1);
  }

  /* ---------- 贴图表 ---------- */
  var TEX = {
    sand: makeTex(baseSandstone(rgb(198, 170, 126), rgb(150, 124, 88), 5, 4)),
    sandLotus: makeTex(baseSandstone(rgb(206, 178, 132), rgb(154, 128, 92), 5, 4), drawLotus('rgba(240,198,116,.85)')),
    wood: makeTex(baseWood(rgb(30, 74, 78)), drawWoodTrim),
    woodDark: makeTex(baseWood(rgb(46, 40, 34)), drawWoodTrim),
    crate: makeTex(baseCrate, drawCrate),
    pillar: makeTex(basePillar, drawPillar),
    statue: makeTex(baseStone, drawStatue),
    plant: makeTex(basePlant),
    door: makeTex(baseDoor, drawDoor),
    fStone: makeTex(baseFloorStone(rgb(122, 116, 108), 16)),
    fDark: makeTex(baseFloorStone(rgb(82, 78, 82), 8)),
    fSand: makeTex(baseFloorSand, drawSandSpecks),
    fSite: makeTex(baseFloorSite, drawSiteTrim),
    fSiteCenter: makeTex(baseFloorSite, drawSiteMotif),
    fWater: makeTex(baseWater, drawWaterRipples)
  };

  // 墙体编号 -> 贴图（1砂岩 2木墙 3木箱 5石柱 7神像 8植物 9金门 10金纹墙 11深木）
  var WALL_TEX = [null, TEX.sand, TEX.wood, TEX.crate, null, TEX.pillar, null, TEX.statue, TEX.plant, TEX.door, TEX.sandLotus, TEX.woodDark];
  // 地面编号 -> 贴图（0石砖 1水 2深石 3沙 4包点金纹）
  var FLOOR_TEX = [TEX.fStone, TEX.fWater, TEX.fDark, TEX.fSand, TEX.fSite, TEX.fSiteCenter];
  var BLOCK = { 1: 1, 2: 1, 3: 1, 5: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1 };

  /* ============================================================
     莲花古城布局：A / B / C 三包点 + 中路水池 + 旋转门
     ============================================================ */
  var MW = 54, MH = 54;

  function buildLotus() {
    var grid = new Uint8Array(MW * MH);   // 0=空 其它=墙
    var floor = new Uint8Array(MW * MH);  // 0石 1水 2深石 3沙 4包点
    grid.fill(1);                          // 先填满岩体

    function carve(x0, y0, x1, y1, f) {
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        grid[y * MW + x] = 0;
        floor[y * MW + x] = f || 0;
      }
    }
    function set(x, y, t) { if (x >= 0 && y >= 0 && x < MW && y < MH) grid[y * MW + x] = t; }
    function setFloor(x, y, f) { if (x >= 0 && y >= 0 && x < MW && y < MH) floor[y * MW + x] = f; }

    /* ---- 主结构（矩形区域） ---- */
    carve(19, 44, 34, 51, 3);        // 进攻方出生地
    carve(22, 36, 31, 44, 3);        // 出生通道
    carve(17, 20, 36, 37, 0);        // 中路大厅
    carve(21, 22, 32, 31, 1);        // 中路水池
    carve(5, 4, 17, 19, 4);          // A 包点
    carve(13, 14, 20, 26, 0);        // A 连接（旋转门）
    carve(21, 4, 32, 17, 4);         // B 包点
    carve(24, 14, 29, 22, 2);        // B 连接
    carve(36, 4, 48, 19, 4);         // C 包点
    carve(33, 14, 40, 26, 0);        // C 连接（旋转门）
    carve(4, 26, 12, 46, 2);         // A 大道
    carve(7, 16, 15, 30, 0);         // A 大道 -> A 连接
    carve(41, 26, 49, 46, 2);        // C 大道
    carve(38, 16, 46, 30, 0);        // C 大道 -> C 连接
    carve(6, 44, 47, 51, 3);         // 出生地横向通道
    carve(12, 38, 39, 44, 3);        // 出生地平台

    /* ---- 包点装饰 & 掩体 ---- */
    // A 包点：地面圆台 + 石柱 + 木箱
    for (var i = 0; i < 3; i++) {
      set(8, 8 + i * 4, 5); set(14, 8 + i * 4, 5);
    }
    set(6, 6, 3); set(7, 6, 3); set(16, 6, 3); set(16, 15, 3); set(6, 17, 3);
    set(11, 4, 10); set(11, 5, 10);                     // 金纹墙
    set(11, 12, 7);                                      // 神像
    // B 包点
    set(26, 8, 5); set(26, 12, 5);
    set(22, 6, 3); set(31, 6, 3); set(31, 15, 3); set(22, 15, 3);
    set(26, 3, 10); set(27, 3, 10);
    set(26, 16, 7);
    // C 包点
    set(39, 7, 5); set(45, 7, 5); set(42, 12, 5);
    set(37, 5, 3); set(47, 5, 3); set(47, 16, 3); set(37, 16, 3);
    set(42, 4, 10); set(43, 4, 10);
    set(42, 14, 7);

    /* ---- 中路 ---- */
    set(20, 24, 5); set(33, 24, 5); set(20, 33, 5); set(33, 33, 5);
    set(24, 19, 8); set(29, 19, 8); set(24, 38, 8); set(29, 38, 8);
    set(19, 29, 3); set(34, 28, 3);
    // 水池四周护栏（矮墙→用木箱代替）
    set(21, 21, 3); set(32, 21, 3); set(21, 32, 3); set(32, 32, 3);

    /* ---- 旋转门（9 = 门）：A 连接 & C 连接 ---- */
    set(16, 20, 9); set(17, 20, 9);
    set(37, 20, 9); set(38, 20, 9);

    /* ---- 大道掩体 ---- */
    set(8, 30, 3); set(8, 36, 3); set(5, 40, 5); set(11, 42, 5);
    set(45, 30, 3); set(45, 36, 3); set(48, 40, 5); set(42, 42, 5);

    /* ---- 出生地 ---- */
    set(19, 47, 5); set(34, 47, 5); set(24, 50, 3); set(29, 50, 3);

    // 包点地面中心做金纹
    [[11, 11], [26, 10], [42, 10]].forEach(function (p) {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var x = p[0] + dx, y = p[1] + dy;
        if (!grid[y * MW + x]) floor[y * MW + x] = (dx === 0 && dy === 0) ? 5 : 4;
      }
    });

    return { w: MW, h: MH, grid: grid, floor: floor };
  }

  var map = buildLotus();

  /* ---------- 查询接口 ---------- */
  function idx(x, y) {
    var ix = x | 0, iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= MW || iy >= MH) return -1;
    return iy * MW + ix;
  }
  function tileAt(x, y) { var i = idx(x, y); return i < 0 ? 1 : map.grid[i]; }
  function floorAt(x, y) { var i = idx(x, y); return i < 0 ? 0 : map.floor[i]; }
  function isBlocked(x, y) { return !!BLOCK[tileAt(x, y)]; }
  function isBlockedPx(px, py) { return isBlocked(px | 0, py | 0); }

  // 圆形碰撞：返回修正后的位置
  function moveWithCollision(px, py, dx, dy, r) {
    r = r || 0.28;
    var nx = px + dx, ny = py + dy;
    if (!hitCircle(nx, py, r)) px = nx;
    if (!hitCircle(px, ny, r)) py = ny;
    return [px, py];
  }
  function hitCircle(x, y, r) {
    for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
      var cx = (x | 0) + ox, cy = (y | 0) + oy;
      if (!isBlocked(cx, cy)) continue;
      var nx = Math.max(cx, Math.min(x, cx + 1));
      var ny = Math.max(cy, Math.min(y, cy + 1));
      if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return true;
    }
    return false;
  }

  /* ---------- 出生点 / 包点 / BOT 出生点 ---------- */
  var SPAWN = { x: 26.5, y: 48.5, a: -Math.PI / 2 };  // 朝北
  var SITES = {
    A: { x: 11.5, y: 11.5, r: 4, name: 'A 包点' },
    B: { x: 26.5, y: 10.5, r: 4, name: 'B 包点' },
    C: { x: 42.5, y: 10.5, r: 4, name: 'C 包点' }
  };
  var BOT_SPAWNS = [
    // A
    [9.5, 8.5], [15.5, 10.5], [8.5, 15.5], [16.5, 17.5], [11.5, 6.5], [11.5, 17.5],
    // B
    [23.5, 7.5], [29.5, 7.5], [23.5, 14.5], [29.5, 14.5], [26.5, 5.5], [26.5, 15.5],
    // C
    [39.5, 8.5], [45.5, 8.5], [39.5, 15.5], [45.5, 15.5], [42.5, 5.5], [42.5, 17.5],
    // 中路
    [20.5, 22.5], [33.5, 22.5], [20.5, 34.5], [33.5, 34.5], [26.5, 20.5], [26.5, 35.5],
    // 大道
    [8.5, 33.5], [45.5, 33.5], [8.5, 40.5], [45.5, 40.5]
  ];
  var PATROL = [
    [[9.5, 9.5], [15.5, 16.5], [15.5, 6.5], [8.5, 6.5], [8.5, 15.5]],
    [[26.5, 10.5], [23.5, 6.5], [30.5, 6.5], [30.5, 15.5], [23.5, 15.5]],
    [[42.5, 10.5], [39.5, 6.5], [46.5, 6.5], [46.5, 16.5], [39.5, 16.5]]
  ];

  global.LotusMap = {
    MW: MW, MH: MH, grid: map.grid, floor: map.floor,
    TEX: TEX, WALL_TEX: WALL_TEX, FLOOR_TEX: FLOOR_TEX, TS: TS,
    tileAt: tileAt, floorAt: floorAt, isBlocked: isBlocked, isBlockedPx: isBlockedPx,
    moveWithCollision: moveWithCollision, hitCircle: hitCircle,
    SPAWN: SPAWN, SITES: SITES, BOT_SPAWNS: BOT_SPAWNS, PATROL: PATROL,
    // 供小地图 / 视线检测使用
    blocksSight: function (x, y) { return isBlocked(x, y); }
  };
})(window);
