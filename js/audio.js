/* ============================================================
   audio.js —— 全程序化音效（WebAudio），零音频文件
   ============================================================ */
(function (global) {
  'use strict';

  var A = {
    ctx: null, master: null, vol: 0.7, ready: false,
    noiseBuf: null, ambientGain: null
  };

  A.init = function () {
    if (A.ctx) return;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.vol;
    A.master.connect(A.ctx.destination);
    // 噪声缓冲
    var len = Math.floor(A.ctx.sampleRate * 0.6);
    var buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.noiseBuf = buf;
    A.ready = true;
  };

  A.resume = function () {
    if (!A.ctx) A.init();
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  };
  A.setVol = function (v) {
    A.vol = v;
    if (A.master) A.master.gain.value = v;
  };

  function now() { return A.ctx.currentTime; }

  function noise(dur, gain, type, freq, q, when, rate) {
    var s = A.ctx.createBufferSource();
    s.buffer = A.noiseBuf;
    s.playbackRate.value = rate || 1;
    var f = A.ctx.createBiquadFilter();
    f.type = type || 'lowpass'; f.frequency.value = freq || 3000; f.Q.value = q || 0.8;
    var g = A.ctx.createGain();
    var t = when || now();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(A.master);
    s.start(t); s.stop(t + dur + 0.05);
    return { src: s, gain: g, filter: f };
  }

  function tone(freq, dur, gain, type, when, slideTo) {
    var o = A.ctx.createOscillator();
    o.type = type || 'sine';
    var g = A.ctx.createGain();
    var t = when || now();
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  /* ---------- 枪声 ---------- */
  A.shot = function (wpn, dist) {
    if (!A.ready) return;
    var t = now();
    var far = dist && dist > 6;
    var k = far ? Math.max(0.16, 1 - dist / 45) : 1;
    if (wpn === 'phantom') {
      noise(0.16, 0.5 * k, 'lowpass', far ? 1400 : 5200, 0.9, t, 1.5);
      noise(0.05, 0.34 * k, 'highpass', 2200, 0.7, t, 2.2);
      tone(168, 0.11, 0.34 * k, 'triangle', t, 62);
      if (!far) noise(0.28, 0.1 * k, 'bandpass', 900, 1.4, t + 0.02, 0.8);   // 尾音
    } else {
      noise(0.24, 0.62 * k, 'lowpass', far ? 1100 : 3400, 0.9, t, 1.1);
      noise(0.07, 0.4 * k, 'highpass', 1500, 0.6, t, 1.8);
      tone(112, 0.17, 0.46 * k, 'triangle', t, 42);
      tone(74, 0.24, 0.34 * k, 'sine', t, 34);
      if (!far) noise(0.34, 0.12 * k, 'bandpass', 560, 1.1, t + 0.03, 0.7);
    }
  };

  /* 命中反馈 */
  A.hitBody = function () { if (A.ready) { tone(320, 0.05, 0.16, 'square'); noise(0.05, 0.16, 'bandpass', 1600, 1.2); } };
  A.hitHead = function () {
    if (!A.ready) return;
    var t = now();
    tone(1560, 0.1, 0.26, 'sine', t);
    tone(2340, 0.16, 0.16, 'sine', t + 0.012);
  };
  A.hitWall = function () { if (A.ready) noise(0.06, 0.13, 'bandpass', 2600, 1.6); };
  A.kill = function () {
    if (!A.ready) return;
    var t = now();
    tone(880, 0.09, 0.22, 'square', t);
    tone(1180, 0.13, 0.2, 'square', t + 0.07);
    noise(0.22, 0.16, 'lowpass', 1200, 0.7, t + 0.02, 0.9);
  };
  A.death = function () {
    if (!A.ready) return;
    var t = now();
    tone(220, 0.5, 0.22, 'sawtooth', t, 60);
    noise(0.5, 0.24, 'lowpass', 700, 0.9, t, 0.7);
  };
  A.reloadIn = function () { if (A.ready) { noise(0.05, 0.2, 'bandpass', 1100, 2); tone(320, 0.04, 0.1, 'square', now() + 0.05); } };
  A.reloadOut = function () { if (A.ready) { noise(0.06, 0.22, 'bandpass', 900, 2); tone(240, 0.05, 0.12, 'square'); } };
  A.reloadDone = function () { if (A.ready) { noise(0.05, 0.24, 'bandpass', 1500, 2.4); tone(420, 0.06, 0.12, 'square', now() + 0.03); } };
  A.swap = function () { if (A.ready) { noise(0.07, 0.2, 'bandpass', 1300, 1.6); tone(300, 0.06, 0.1, 'square', now() + 0.06); } };
  A.dryFire = function () { if (A.ready) { tone(1200, 0.03, 0.16, 'square'); noise(0.03, 0.12, 'highpass', 3000); } };
  A.step = function () { if (A.ready) noise(0.055, 0.09, 'bandpass', 380 + Math.random() * 160, 1.1, now(), 0.8); };
  A.hurt = function () {
    if (!A.ready) return;
    tone(150, 0.22, 0.3, 'sawtooth', now(), 70);
    noise(0.2, 0.2, 'lowpass', 900, 0.8);
  };
  A.ding = function () { if (A.ready) { tone(1320, 0.5, 0.14, 'sine'); tone(1980, 0.5, 0.08, 'sine', now() + 0.01); } };
  A.ui = function () { if (A.ready) tone(680, 0.04, 0.07, 'square'); };
  A.equip = function () {
    if (!A.ready) return;
    var t = now();
    noise(0.06, 0.18, 'bandpass', 1800, 1.4, t);
    noise(0.09, 0.16, 'bandpass', 900, 1.2, t + 0.12);
  };

  /* ---------- 环境底噪（莲花古城：风声 + 低鸣） ---------- */
  A.startAmbient = function () {
    if (!A.ready || A.ambientGain) return;
    var g = A.ctx.createGain();
    g.gain.value = 0.0;
    g.connect(A.master);
    g.gain.linearRampToValueAtTime(0.055, now() + 2.5);
    // 风
    var s = A.ctx.createBufferSource();
    s.buffer = A.noiseBuf; s.loop = true;
    var f = A.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.6;
    var lfo = A.ctx.createOscillator(); lfo.frequency.value = 0.07;
    var lg = A.ctx.createGain(); lg.gain.value = 160;
    lfo.connect(lg); lg.connect(f.frequency);
    s.connect(f); f.connect(g); s.start(); lfo.start();
    // 低鸣
    var o1 = A.ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 58;
    var o2 = A.ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 87.2;
    var g2 = A.ctx.createGain(); g2.gain.value = 0.35;
    o1.connect(g2); o2.connect(g2); g2.connect(g);
    o1.start(); o2.start();
    A.ambientGain = g;
  };
  A.stopAmbient = function () {
    if (A.ambientGain) {
      try { A.ambientGain.gain.linearRampToValueAtTime(0, now() + 0.6); } catch (e) { }
      var ag = A.ambientGain; A.ambientGain = null;
      setTimeout(function () { try { ag.disconnect(); } catch (e) { } }, 900);
    }
  };

  global.Sfx = A;
})(window);
