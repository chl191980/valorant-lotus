/* ============================================================
   main.js —— 启动引导
   ============================================================ */
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function elMap() {
    var e = {
      ammo: $('ammo'), ammoMax: $('ammomax'), reloading: $('reloading'),
      hudWpn: $('hud-wpn'), hudSkin: $('hud-skin'),
      hp: $('hp'), armor: $('armor'), hpbar: $('hpbar'),
      timerText: $('timer').querySelector('b'), score: $('sb-score'), kills: $('sb-kills'), obj: $('sb-obj'),
      killfeed: $('killfeed'), hitmark: $('hitmark'), dmgwrap: $('dmgwrap'),
      hurt: $('hurt'), flash: $('flash'), scope: $('scope-vig'), toast: $('toast'),
      fps: $('fps'), minimap: $('minimap'), crosshair: $('crosshair'),
      pause: $('pause'), result: $('result'),
      rTitle: $('r-title'), rSub: $('r-sub'), rKills: $('r-kills'), rHS: $('r-hs'),
      rHSP: $('r-hsp'), rAcc: $('r-acc'), rDmg: $('r-dmg'), rTime: $('r-time'),
      pKills: $('p-kills'), pHS: $('p-hs'), pAcc: $('p-acc')
    };
    return e;
  }

  /* 预加载：武器默认图 + 已装备皮肤 + 菜单用图 */
  function preload(cb) {
    var urls = [];
    ['vandal', 'phantom'].forEach(function (w) {
      var db = global.SKIN_DB.weapons[w];
      if (db.icon) urls.push(db.icon);
    });
    // 热门皮肤封面（让藏品库更顺滑）
    var hot = ['Prime', 'Reaver', 'Elderflame', 'Glitchpop', 'Oni', 'Ion', 'Araxys', 'Kuronami',
      'Gaia\'s Vengeance', 'Prelude to Chaos', 'Singularity', 'Neptune', 'Champions 2023', 'Sentinels of Light'];
    hot.forEach(function (name) {
      var s = global.SKIN_DB.skins.filter(function (x) { return x.line === name; })[0];
      if (s && s.ic) urls.push(s.ic);
    });
    // 已装备
    try {
      var eq = JSON.parse(localStorage.getItem('vl_equip') || '{}');
      Object.keys(eq).forEach(function (w) {
        var id = eq[w].id;
        var s = global.SKIN_DB.skins.filter(function (x) { return x.id === id; })[0];
        if (s && s.ic) urls.push(s.ic);
      });
    } catch (e) { }

    var total = urls.length, done = 0;
    var bar = $('loadbar'), tip = $('loadtip');
    var tips = ['正在载入枪皮数据…', '正在准备莲花古城…', '正在校准准星…', '正在唤醒训练 BOT…'];
    if (!total) { cb(); return; }
    var ti = 0;
    var timer = setInterval(function () {
      ti = (ti + 1) % tips.length;
      tip.textContent = tips[ti];
    }, 700);
    urls.forEach(function (u) {
      var im = new Image();
      var fin = function () {
        done++;
        if (bar) bar.style.width = Math.round(done / total * 100) + '%';
        if (done === total) { clearInterval(timer); cb(); }
      };
      im.onload = fin; im.onerror = fin;
      im.src = u;
    });
  }

  function boot() {
    if (!global.SKIN_DB) {
      $('loadtip').textContent = '皮肤数据载入失败：请确认 js/skins-data.js 存在';
      return;
    }
    global.Collection.init();
    preload(function () {
      $('loadbar').style.width = '100%';
      global.Game.init({
        el: elMap(),
        viewCanvas: $('view'),
        gunCanvas: $('gun'),
        mmCanvas: $('mmcanvas')
      });
      global.UI.init();
      global.Collection.equipFromStorage();
      global.Collection.open('vandal');
      global.UI.refreshMenu();
      $('menu-ver').textContent = 'v1.0 · ' + global.SKIN_DB.skins.length + ' 款枪皮';
      global.UI.show('menu');
      setTimeout(function () { if (global.Game.onResize) global.Game.onResize(); }, 120);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
