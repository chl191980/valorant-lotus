/* ============================================================
   engine.js —— 第一人称光线投射渲染器（莲花古城）
   · 贴图墙体 + 地面投射 + 天空 + 距离雾
   · 精灵（BOT/道具）带 z-buffer 遮挡
   ============================================================ */
(function (global) {
  'use strict';
  var M = global.LotusMap;
  var TS = M.TS;

  function VEngine(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bufCanvas = document.createElement('canvas');
    this.bctx = this.bufCanvas.getContext('2d');
    this.scale = 0.8;            // 画质（相对 640 宽基准）
    this.fov = 75;
    this.img = null; this.buf32 = null; this.z = null;
    this.w = 0; this.h = 0;
    this.fog = { near: 6, far: 30, r: 132, g: 118, b: 96 };
    this.skyTop = [26, 52, 74];
    this.skyBot = [232, 206, 152];
    this.brightness = 1.0;
    this.resize();
  }

  VEngine.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var cssW = this.canvas.clientWidth || window.innerWidth;
    var cssH = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.dispW = this.canvas.width; this.dispH = this.canvas.height;

    var base = 560 * this.scale;                       // 渲染宽度基准
    var aspect = cssH / Math.max(1, cssW);
    var w = Math.max(220, Math.round(base));
    var h = Math.max(140, Math.round(w * aspect));
    // 限制总像素，保证手机帧率
    var maxPix = 560 * 340;
    if (w * h > maxPix) { var k = Math.sqrt(maxPix / (w * h)); w = Math.round(w * k); h = Math.round(h * k); }
    this.w = w; this.h = h;
    this.bufCanvas.width = w; this.bufCanvas.height = h;
    this.img = this.bctx.createImageData(w, h);
    this.buf32 = new Uint32Array(this.img.data.buffer);
    this.z = new Float32Array(w);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.msImageSmoothingEnabled = true;

    // 天空渐变预计算（每行颜色）
    this.skyRow = new Uint32Array(h);
    var horizon = h / 2;
    for (var y = 0; y < h; y++) {
      var t = Math.max(0, Math.min(1, 1 - y / horizon));
      var r = this.skyTop[0] + (this.skyBot[0] - this.skyTop[0]) * (1 - t);
      var g = this.skyTop[1] + (this.skyBot[1] - this.skyTop[1]) * (1 - t);
      var b = this.skyTop[2] + (this.skyBot[2] - this.skyTop[2]) * (1 - t);
      // 顶部略微压暗
      var k2 = 0.85 + 0.15 * (1 - t);
      this.skyRow[y] = pack(r * k2, g * k2, b * k2);
    }
    this.aspect = cssW / cssH;
  };

  function pack(r, g, b) {
    r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
    g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
    b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    return (255 << 24) | (b << 16) | (g << 8) | r;
  }
  function mix(c, r, g, b, t) {
    var cr = c & 255, cg = (c >> 8) & 255, cb = (c >> 16) & 255;
    return pack(cr + (r - cr) * t, cg + (g - cg) * t, cb + (b - cb) * t);
  }

  /* ---------- 主渲染 ----------
     cam: {x, y, ang, pitch, fov, bob}
     sprites: [{x, y, tex, scale, vOffset, alpha}]
  */
  VEngine.prototype.render = function (cam, sprites, time) {
    var w = this.w, h = this.h, buf = this.buf32, z = this.z;
    var dirX = Math.cos(cam.ang), dirY = Math.sin(cam.ang);
    var fovRad = (cam.fov || this.fov) * Math.PI / 180;
    var planeLen = Math.tan(fovRad / 2);
    var planeX = -dirY * planeLen * (this.aspect || 1.7) / (16 / 9);
    var planeY = dirX * planeLen * (this.aspect || 1.7) / (16 / 9);
    var horizon = (h * 0.5 + (cam.pitch || 0) + (cam.bobY || 0)) | 0;
    var fogNear = this.fog.near, fogFar = this.fog.far;
    var fr = this.fog.r, fg = this.fog.g, fb = this.fog.b;

    /* ---- 天空 ---- */
    var skyRow = this.skyRow;
    for (var y = 0; y < h; y++) {
      var sky = skyRow[y < 0 ? 0 : y >= h ? h - 1 : y];
      var rowOff = y * w;
      var upper = y < horizon;
      if (!upper) break;
      for (var x = 0; x < w; x++) buf[rowOff + x] = sky;
    }

    /* ---- 地面投射 ---- */
    var cz = cam.z === undefined ? 0.81 : cam.z;
    var posZ = cz * h;    // 摄像机高度（世界单位）对应的像素
    for (var yy = horizon + 1; yy < h; yy++) {
      var p = yy - horizon;
      var rowDistance = posZ / p;
      if (rowDistance > 60) rowDistance = 60;
      var fogT = (rowDistance - fogNear) / (fogFar - fogNear);
      if (fogT < 0) fogT = 0; else if (fogT > 1) fogT = 1;
      fogT *= 0.92;
      var stepX = rowDistance * (planeX * 2) / w;
      var stepY = rowDistance * (planeY * 2) / w;
      var fx = cam.x + rowDistance * (dirX - planeX);
      var fy = cam.y + rowDistance * (dirY - planeY);
      var rowOff2 = yy * w;
      var lightK = 1.15 - rowDistance * 0.012;
      if (lightK < 0.55) lightK = 0.55;
      for (var xx = 0; xx < w; xx++) {
        var cx = fx | 0, cy = fy | 0;
        if (cx < 0 || cy < 0 || cx >= M.MW || cy >= M.MH) { buf[rowOff2 + xx] = pack(fr, fg, fb); fx += stepX; fy += stepY; continue; }
        var fid = M.floor[cy * M.MW + cx];
        var tex = M.FLOOR_TEX[fid] || M.FLOOR_TEX[0];
        var tu = ((fx - cx) * TS) | 0, tv = ((fy - cy) * TS) | 0;
        if (fid === 1) { tv = (tv + (time * 26 | 0)) & (TS - 1); tu = (tu + (time * 10 | 0)) & (TS - 1); }
        var c = tex.data[tv * TS + tu];
        var r = (c & 255) * lightK, g = ((c >> 8) & 255) * lightK, b2 = ((c >> 16) & 255) * lightK;
        if (fogT > 0) { r += (fr - r) * fogT; g += (fg - g) * fogT; b2 += (fb - b2) * fogT; }
        buf[rowOff2 + xx] = pack(r, g, b2);
        fx += stepX; fy += stepY;
      }
    }

    /* ---- 墙体（DDA） ---- */
    for (var sx = 0; sx < w; sx++) {
      var camX = 2 * sx / w - 1;
      var rayX = dirX + planeX * camX;
      var rayY = dirY + planeY * camX;
      var mapX = cam.x | 0, mapY = cam.y | 0;
      var deltaX = rayX === 0 ? 1e30 : Math.abs(1 / rayX);
      var deltaY = rayY === 0 ? 1e30 : Math.abs(1 / rayY);
      var stepX2, stepY2, sideX, sideY;
      if (rayX < 0) { stepX2 = -1; sideX = (cam.x - mapX) * deltaX; } else { stepX2 = 1; sideX = (mapX + 1 - cam.x) * deltaX; }
      if (rayY < 0) { stepY2 = -1; sideY = (cam.y - mapY) * deltaY; } else { stepY2 = 1; sideY = (mapY + 1 - cam.y) * deltaY; }
      var hit = 0, tile = 0, guard = 0, side = 0;
      while (!hit && guard++ < 160) {
        if (sideX < sideY) { sideX += deltaX; mapX += stepX2; side = 0; }
        else { sideY += deltaY; mapY += stepY2; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= M.MW || mapY >= M.MH) { hit = 1; tile = 1; break; }
        tile = M.grid[mapY * M.MW + mapX];
        if (tile) hit = 1;
      }
      var perp = side === 0 ? (sideX - deltaX) : (sideY - deltaY);
      if (perp < 0.02) perp = 0.02;
      z[sx] = perp;

      var lineH = h / perp;
      var yTop = horizon - (1 - cz) * lineH;        // 墙顶（z=1）
      var yBot = horizon + cz * lineH;              // 墙底（z=0）
      var drawStart = Math.round(yTop);
      var drawEnd = Math.round(yBot);
      var tex = M.WALL_TEX[tile] || M.WALL_TEX[1];
      var wallX = side === 0 ? cam.y + perp * rayY : cam.x + perp * rayX;
      wallX -= Math.floor(wallX);
      var texX = (wallX * TS) | 0;
      if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) texX = TS - texX - 1;
      if (texX < 0) texX = 0; else if (texX >= TS) texX = TS - 1;

      var fogTw = (perp - fogNear) / (fogFar - fogNear);
      if (fogTw < 0) fogTw = 0; else if (fogTw > 1) fogTw = 1;
      var lightW = (side === 1 ? 0.74 : 0.96) * (1.1 - perp * 0.01);
      if (lightW < 0.42) lightW = 0.42;
      var stepT = TS / lineH;
      var texPos = (drawStart - yTop) * stepT;
      var y0 = drawStart < 0 ? 0 : drawStart;
      var y1 = drawEnd > h ? h : drawEnd;
      for (var wy = y0; wy < y1; wy++) {
        var ty = texPos & (TS - 1);
        texPos += stepT;
        var cc = tex.data[(ty | 0) * TS + texX];
        var rr = (cc & 255) * lightW, gg = ((cc >> 8) & 255) * lightW, bb = ((cc >> 16) & 255) * lightW;
        if (fogTw > 0) { rr += (fr - rr) * fogTw; gg += (fg - gg) * fogTw; bb += (fb - bb) * fogTw; }
        buf[wy * w + sx] = pack(rr, gg, bb);
      }
    }

    /* ---- 精灵 ---- */
    var order = [];
    for (var i = 0; i < sprites.length; i++) {
      var sp = sprites[i];
      var ddx = sp.x - cam.x, ddy = sp.y - cam.y;
      sp._d = ddx * ddx + ddy * ddy;
      order.push(sp);
    }
    order.sort(function (a, b) { return b._d - a._d; });

    var invDet = 1.0 / (planeX * dirY - dirX * planeY);
    for (var s2 = 0; s2 < order.length; s2++) {
      var s = order[s2];
      var spx = s.x - cam.x, spy = s.y - cam.y;
      var transX = invDet * (dirY * spx - dirX * spy);
      var transY = invDet * (-planeY * spx + planeX * spy);
      if (transY <= 0.12) continue;
      var nearK = 1;
      if (transY < 0.85) {
        nearK = (transY - 0.35) / 0.5;
        if (nearK <= 0.05) continue;
      }
      var screenX = ((w / 2) * (1 + transX / transY)) | 0;
      var unitPx = h / transY;                       // 距离 transY 处 1 世界单位 = unitPx 像素
      var baseH = unitPx * (s.scale || 1);
      var sh = Math.abs(baseH * (s.sy === undefined ? 1 : s.sy)) | 0;
      var sw = Math.abs(baseH * (s.sx === undefined ? (s.tex.w / s.tex.h) : s.sx)) | 0;
      if (sh < 1 || sw < 1) continue;
      var bottom = horizon + cz * unitPx - (s.vOffset || 0) * unitPx;
      var startY = (bottom - sh) | 0;
      var endY = startY + sh;
      var startX = screenX - (sw >> 1);
      var endX = startX + sw;
      var fogS = (Math.sqrt(s._d) - fogNear) / (fogFar - fogNear);
      if (fogS < 0) fogS = 0; else if (fogS > 1) fogS = 1;
      var lightS = 1.2 - Math.sqrt(s._d) * 0.014;
      if (lightS < 0.5) lightS = 0.5;
      var alpha = (s.alpha === undefined ? 1 : s.alpha) * nearK;
      var y0s = startY < 0 ? 0 : startY, y1s = endY > h ? h : endY;
      var x0s = startX < 0 ? 0 : startX, x1s = endX > w ? w : endX;
      for (var xx2 = x0s; xx2 < x1s; xx2++) {
        if (transY >= z[xx2]) continue;
        var tx = (((xx2 - startX) * s.tex.w / sw) | 0);
        if (tx < 0) tx = 0; else if (tx >= s.tex.w) tx = s.tex.w - 1;
        for (var yy2 = y0s; yy2 < y1s; yy2++) {
          var tyy = (((yy2 - startY) * s.tex.h / sh) | 0);
          if (tyy < 0) tyy = 0; else if (tyy >= s.tex.h) tyy = s.tex.h - 1;
          var sc = s.tex.data[tyy * s.tex.w + tx];
          var sa = (sc >>> 24) / 255;
          if (sa < 0.03) continue;
          var sr = (sc & 255) * lightS, sg = ((sc >> 8) & 255) * lightS, sb = ((sc >> 16) & 255) * lightS;
          if (fogS > 0) { sr += (fr - sr) * fogS; sg += (fg - sg) * fogS; sb += (fb - sb) * fogS; }
          var a2 = sa * alpha;
          var di = yy2 * w + xx2;
          if (a2 >= 0.985) { buf[di] = pack(sr, sg, sb); continue; }
          var dv = buf[di];
          var ia = 1 - a2;
          buf[di] = pack(sr * a2 + (dv & 255) * ia,
                         sg * a2 + ((dv >> 8) & 255) * ia,
                         sb * a2 + ((dv >> 16) & 255) * ia);
        }
      }
    }

    /* ---- 输出 ---- */
    this.bctx.putImageData(this.img, 0, 0);
    this.ctx.drawImage(this.bufCanvas, 0, 0, this.dispW, this.dispH);
    this.lastDir = { dirX: dirX, dirY: dirY, planeX: planeX, planeY: planeY, horizon: horizon };
  };

  /* ---------- 视线检测（BOT 用） ---------- */
  VEngine.prototype.hasLineOfSight = function (x0, y0, x1, y1, maxDist) {
    var dx = x1 - x0, dy = y1 - y0;
    var dist = Math.hypot(dx, dy);
    if (maxDist && dist > maxDist) return false;
    var steps = Math.ceil(dist * 6);
    var sx = dx / steps, sy = dy / steps, x = x0, y = y0;
    for (var i = 0; i < steps; i++) {
      x += sx; y += sy;
      if (M.isBlocked(x | 0, y | 0)) return false;
    }
    return true;
  };

  /* ---------- 小地图 ---------- */
  function MiniMap(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = canvas.width / M.MW;
    this.base = document.createElement('canvas');
    this.base.width = canvas.width; this.base.height = canvas.height;
    this.drawBase();
  }
  MiniMap.prototype.drawBase = function () {
    var g = this.base.getContext('2d'), s = this.scale;
    g.clearRect(0, 0, this.base.width, this.base.height);
    for (var y = 0; y < M.MH; y++) {
      for (var x = 0; x < M.MW; x++) {
        var t = M.grid[y * M.MW + x];
        var f = M.floor[y * M.MW + x];
        var col = null;
        if (t) col = 'rgba(150,132,104,.85)';
        else if (f === 1) col = 'rgba(40,120,140,.85)';
        else if (f === 4) col = 'rgba(120,104,72,.62)';
        else if (f === 2) col = 'rgba(64,74,84,.5)';
        else col = 'rgba(88,98,108,.4)';
        g.fillStyle = col;
        g.fillRect(x * s, y * s, s + .6, s + .6);
      }
    }
    // 包点标记
    g.font = 'bold ' + Math.round(s * 3) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    Object.keys(M.SITES).forEach(function (k) {
      var st = M.SITES[k];
      g.strokeStyle = 'rgba(240,198,116,.9)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(st.x * s, st.y * s, st.r * s, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(240,198,116,.95)';
      g.fillText(k, st.x * s, st.y * s);
    });
  };
  MiniMap.prototype.draw = function (cam, bots, extra) {
    var ctx = this.ctx, s = this.scale;
    ctx.clearRect(0, 0, this.c.width, this.c.height);
    ctx.drawImage(this.base, 0, 0);
    // BOT
    bots.forEach(function (b) {
      if (!b.alive) return;
      ctx.fillStyle = b.elite ? '#f0c674' : '#ff4655';
      ctx.beginPath(); ctx.arc(b.x * s, b.y * s, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1; ctx.stroke();
    });
    if (extra && extra.length) {
      extra.forEach(function (e) {
        ctx.fillStyle = e.color || '#22d3b8';
        ctx.beginPath(); ctx.arc(e.x * s, e.y * s, 2.4, 0, Math.PI * 2); ctx.fill();
      });
    }
    // 玩家
    ctx.save();
    ctx.translate(cam.x * s, cam.y * s);
    ctx.rotate(cam.ang + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.4, 5); ctx.lineTo(0, 2.6); ctx.lineTo(-4.4, 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // 视野扇形
    ctx.save();
    ctx.translate(cam.x * s, cam.y * s);
    ctx.rotate(cam.ang);
    var fovR = (cam.fov || 75) * Math.PI / 180;
    var R = 26;
    var grd = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    grd.addColorStop(0, 'rgba(255,255,255,.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -fovR / 2, fovR / 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  global.VEngine = VEngine;
  global.MiniMap = MiniMap;
  global.vpack = pack;
})(window);
