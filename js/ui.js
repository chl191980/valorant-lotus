/* ============================================================
   ui.js —— 界面切换 / 菜单 / 设置
   ============================================================ */
(function (global) {
  'use strict';
  var LS = 'vl_settings';
  var DEFAULTS = {
    sens: 1, adsSens: 0.8, fov: 75, vol: 0.7, quality: 0.8,
    chColor: '#34f5a8', chGap: 4, chLen: 6, chDot: true, dmgNum: true,
    showFps: false, minimap: true, rotate: false, autoFire: false,
    fireAnywhere: true, lefty: true
  };
  var S = {};
  var cur = 'loading';

  function $(id) { return document.getElementById(id); }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function loadSettings() {
    var s = {};
    for (var k in DEFAULTS) s[k] = DEFAULTS[k];
    try {
      var saved = JSON.parse(localStorage.getItem(LS) || '{}');
      for (var k2 in saved) if (saved.hasOwnProperty(k2)) s[k2] = saved[k2];
    } catch (e) { }
    S = s;
  }
  function saveSettings() {
    try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { }
  }
  function push() {
    if (global.Game) global.Game.applySettings(S);
  }

  var UI = {};

  UI._colFrom = 'menu';
  UI.openCollection = function (wpn, from) {
    UI._colFrom = from || (cur === 'game' ? 'game' : 'menu');
    UI.show('collection');
    if (global.Collection) global.Collection.open(wpn);
  };
  UI.back = function () {
    if (UI._colFrom === 'game' && global.Game && global.Game.running) {
      UI.show('game');
      setTimeout(function () { global.Game.onResize(); global.Game.resume(); }, 60);
    } else if (UI._colFrom === 'game' && global.Game && !global.Game.running) {
      UI.show('menu'); UI.refreshMenu();
    } else {
      UI.show('menu'); UI.refreshMenu();
    }
  };

  UI.show = function (name) {
    ['loading', 'menu', 'collection', 'settings', 'game'].forEach(function (n) {
      var el = $(n);
      if (!el) return;
      if (n === name) el.classList.remove('hidden'); else el.classList.add('hidden');
    });
    cur = name;
    if (name === 'game' && global.Game) setTimeout(function () { global.Game.onResize(); }, 60);
    if (name === 'collection' && global.Collection) global.Collection.open();
  };
  UI.current = function () { return cur; };

  /* ---------- 菜单 ---------- */
  var selWpn = 'vandal', selMode = 'range';

  UI.refreshMenu = function () {
    ['vandal', 'phantom'].forEach(function (w) {
      var skin = global.Collection ? global.Collection.getEquipped(w) : null;
      var nameEl = $('skn-' + w);
      if (nameEl) nameEl.textContent = skin ? skin.full : '默认外观';
      var db = global.SKIN_DB.weapons[w];
      var wi = $('wimg-' + w);
      if (wi) {
        wi.src = skin ? (skin.ic || skin.icr) : (db.icon || db.iconR || '');
        wi.onerror = function () { wi.onerror = null; wi.src = skin ? skin.icr : db.iconR; };
      }
      var sub = $('wsub-' + w);
      if (sub) sub.textContent = db.stats.mag + ' 发 / ' + db.stats.fireRate + ' 发每秒';
    });
    var skin = global.Collection ? global.Collection.getEquipped(selWpn) : null;
    var db = global.SKIN_DB.weapons[selWpn];
    var g = $('menu-gun');
    if (g) {
      g.src = skin ? (skin.ic || skin.icr) : (db.icon || db.iconR || '');
      g.onerror = function () { g.onerror = null; g.src = skin ? skin.icr : db.iconR; };
    }
    $('menu-skin-name').textContent = skin ? skin.full : ('默认 · ' + (selWpn === 'vandal' ? '暴徒' : '幻影'));
    $('menu-skin-cn').textContent = skin ? (skin.cn || skin.theme || skin.line) : '标准外观';
    $('menu-skin-tier').textContent = skin ? (({ Ultra: '究极', Exclusive: '尊贵', Premium: '高级', Deluxe: '豪华', Select: '精选' })[skin.tier] || skin.tier) : '—';
    $('menu-mag').textContent = db.stats.mag;
    $('menu-rate').textContent = db.stats.fireRate + ' / 秒';
    $('menu-reload').textContent = db.stats.reload + ' 秒';
    $('menu-cost').textContent = db.stats.cost;
    $('m-stat-skins').textContent = global.SKIN_DB.skins.length;
    var st = {};
    try { st = JSON.parse(localStorage.getItem('vl_stats') || '{}'); } catch (e) { }
    $('m-stat-kills').textContent = st.kills || 0;
    $('m-stat-hs').textContent = st.kills ? Math.round((st.hs || 0) / st.kills * 100) + '%' : '0%';
  };

  UI.toastSmall = function (text) {
    if (!global.Game) return;
    if (cur === 'game') global.Game.toast(text, '');
    else {
      var t = document.createElement('div');
      t.textContent = text;
      t.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:99;' +
        'background:rgba(15,25,35,.94);border:1px solid #ff4655;color:#fff;padding:8px 14px;border-radius:3px;' +
        'font-size:13px;letter-spacing:.06em;box-shadow:0 10px 30px -10px #000';
      document.body.appendChild(t);
      setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = 0; }, 1400);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
    }
  };

  /* ---------- 设置界面 ---------- */
  function bindSwitch(id, key, onChange) {
    var el = $(id);
    if (!el) return;
    el.classList.toggle('on', !!S[key]);
    el.addEventListener('click', function () {
      S[key] = !S[key];
      el.classList.toggle('on', S[key]);
      saveSettings(); push();
      if (global.Sfx) global.Sfx.ui();
      onChange && onChange(S[key]);
    });
  }
  function bindRange(id, labelId, key, fmt, onChange) {
    var el = $(id), lab = $(labelId);
    if (!el) return;
    el.value = S[key];
    if (lab) lab.textContent = fmt ? fmt(S[key]) : S[key];
    el.addEventListener('input', function () {
      S[key] = parseFloat(el.value);
      if (lab) lab.textContent = fmt ? fmt(S[key]) : S[key];
      saveSettings(); push();
      onChange && onChange(S[key]);
    });
  }
  function bindSeg(id, key, onChange, parse) {
    var box = $(id);
    if (!box) return;
    qa('#' + id + ' button').forEach(function (b) {
      var v = parse ? parse(b.dataset.v) : b.dataset.v;
      b.classList.toggle('on', v === S[key]);
      b.addEventListener('click', function () {
        qa('#' + id + ' button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        S[key] = v;
        saveSettings(); push();
        onChange && onChange(v);
      });
    });
  }

  UI.initSettings = function () {
    bindRange('s-sens', 'v-sens', 'sens', function (v) { return (+v).toFixed(2); });
    bindRange('s-adssens', 'v-adssens', 'adsSens', function (v) { return (+v).toFixed(2); });
    bindRange('s-gap', 'v-gap', 'chGap');
    bindRange('s-len', 'v-len', 'chLen');
    bindRange('s-fov', 'v-fov', 'fov');
    bindRange('s-vol', 'v-vol', 'vol', function (v) { return Math.round(v * 100); }, function (v) { if (global.Sfx) global.Sfx.setVol(v); });
    bindSeg('s-chcolor', 'chColor');
    bindSeg('s-quality', 'quality', function () { if (global.Game) global.Game.onResize(); }, parseFloat);
    bindSwitch('s-lefty', 'lefty');
    bindSwitch('s-autofire', 'autoFire');
    bindSwitch('s-fireanywhere', 'fireAnywhere');
    bindSwitch('s-dot', 'chDot');
    bindSwitch('s-dmgnum', 'dmgNum');
    bindSwitch('s-rotate', 'rotate');
    bindSwitch('s-minimap', 'minimap');
    bindSwitch('s-fps', 'showFps');
    $('resetSet').addEventListener('click', function () {
      S = JSON.parse(JSON.stringify(DEFAULTS));
      saveSettings(); push();
      location.reload();
    });
    $('resetStats').addEventListener('click', function () {
      try { localStorage.removeItem('vl_stats'); } catch (e) { }
      UI.refreshMenu();
      UI.toastSmall('历史战绩已清空');
    });
  };

  /* ---------- 初始化 ---------- */
  UI.init = function () {
    loadSettings();
    UI.initSettings();
    push();

    /* 菜单 */
    qa('.wcard').forEach(function (c) {
      c.addEventListener('click', function () {
        qa('.wcard').forEach(function (x) { x.classList.remove('active'); });
        c.classList.add('active');
        selWpn = c.dataset.wpn;
        if (global.Sfx) global.Sfx.ui();
        UI.refreshMenu();
      });
    });
    qa('.mcard').forEach(function (c) {
      c.addEventListener('click', function () {
        qa('.mcard').forEach(function (x) { x.classList.remove('active'); });
        c.classList.add('active');
        selMode = c.dataset.mode;
        if (global.Sfx) global.Sfx.ui();
      });
    });
    $('btnStart').addEventListener('click', function () {
      if (global.Sfx) { global.Sfx.init(); global.Sfx.resume(); }
      try {
        var de = document.documentElement;
        if (!document.fullscreenElement && de.requestFullscreen && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
          de.requestFullscreen().catch(function () { });
        }
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { });
      } catch (e) { }
      UI.show('game');
      setTimeout(function () {
        global.Game.start(selMode, selWpn);
        if (window.innerHeight > window.innerWidth) global.Game.toast('建议横屏游玩', '横屏视野更完整');
      }, 80);
    });
    $('btnCollection').addEventListener('click', function () {
      if (global.Sfx) global.Sfx.ui();
      UI.openCollection(selWpn, 'menu');
    });
    $('btnSettings').addEventListener('click', function () { if (global.Sfx) global.Sfx.ui(); UI.show('settings'); });
    $('setBack').addEventListener('click', function () { UI.show('menu'); UI.refreshMenu(); });

    /* 游戏内 */
    $('pausebtn').addEventListener('click', function () { global.Game.paused ? global.Game.resume() : global.Game.pause(); });
    $('pResume').addEventListener('click', function () { global.Game.resume(); });
    $('pRestart').addEventListener('click', function () {
      global.Game.stop();
      UI.show('game');
      setTimeout(function () { global.Game.start(selMode, selWpn); }, 60);
    });
    $('pQuit').addEventListener('click', function () {
      global.Game.stop();
      UI.show('menu'); UI.refreshMenu();
    });
    $('pCollection').addEventListener('click', function () {
      UI.openCollection(global.Game.weapon, 'game');
    });
    $('btnCollect').addEventListener('touchstart', function (e) {
      e.preventDefault();
      global.Game.pause();
      UI.openCollection(global.Game.weapon, 'game');
    }, { passive: false });
    $('btnCollect').addEventListener('mousedown', function (e) {
      e.preventDefault();
      global.Game.pause();
      UI.openCollection(global.Game.weapon, 'game');
    });

    /* 结算 */
    $('rAgain').addEventListener('click', function () {
      $('result').classList.add('hidden');
      UI.show('game');
      setTimeout(function () { global.Game.start(selMode, global.Game.weapon); }, 60);
    });
    $('rCollection').addEventListener('click', function () {
      $('result').classList.add('hidden');
      UI.openCollection(global.Game.weapon, 'menu');
    });
    $('rMenu').addEventListener('click', function () {
      $('result').classList.add('hidden');
      UI.show('menu'); UI.refreshMenu();
    });

    /* 暂停面板里的快捷滑块 */
    var pv = $('p-vol'), ps = $('p-sens');
    pv.value = Math.round(S.vol * 100);
    ps.value = S.sens;
    pv.addEventListener('input', function () {
      S.vol = pv.value / 100; saveSettings(); push();
      var sv = $('s-vol'); if (sv) { sv.value = S.vol; $('v-vol').textContent = Math.round(S.vol * 100); }
    });
    ps.addEventListener('input', function () {
      S.sens = parseFloat(ps.value); saveSettings(); push();
      var ss = $('s-sens'); if (ss) { ss.value = S.sens; $('v-sens').textContent = (+S.sens).toFixed(2); }
    });

    /* 首次交互解锁声音 */
    var unlock = function () {
      if (global.Sfx) { global.Sfx.init(); global.Sfx.resume(); }
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('mousedown', unlock);
    };
    window.addEventListener('touchstart', unlock);
    window.addEventListener('mousedown', unlock);
  };

  UI.settings = S;
  UI.getSettings = function () { return S; };
  UI.setWpn = function (w) { selWpn = w; };
  UI.setMode = function (m) { selMode = m; };
  UI.selWpn = function () { return selWpn; };
  UI.selMode = function () { return selMode; };

  global.UI = UI;
})(window);
