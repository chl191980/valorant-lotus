/* ============================================================
   collection.js —— 藏品库（全皮肤浏览 / 变体 / 收藏 / 检视）
   ============================================================ */
(function (global) {
  'use strict';
  var DB = global.SKIN_DB;
  var TIER_CN = { Ultra: '究极', Exclusive: '尊贵', Premium: '高级', Deluxe: '豪华', Select: '精选' };
  var TIER_RANK = { Ultra: 5, Exclusive: 4, Premium: 3, Deluxe: 2, Select: 1 };
  var LEVEL_CN = {
    VFX: '特效', SoundEffects: '音效', Animation: '动画', Finisher: '终结特效',
    Transformation: '形态变换', HeartbeatAndMapSensor: '心跳/雷达感应', KillCounter: '击杀计数',
    KillBanner: '击杀播报', InspectAndKillBanner: '检视与击杀播报', AoeDamageUponDeath: '死亡范围伤害'
  };

  var LS_FAV = 'vl_fav', LS_EQ = 'vl_equip';
  var state = {
    wpn: 'vandal', filter: 'all', q: '',
    fav: {}, equip: {},
    shown: 0, batch: 60, list: [], sel: null, selVariant: 0,
    inspectOpen: false, rafId: 0, lastT: 0
  };

  function load() {
    try { state.fav = JSON.parse(localStorage.getItem(LS_FAV) || '{}') || {}; } catch (e) { state.fav = {}; }
    try { state.equip = JSON.parse(localStorage.getItem(LS_EQ) || '{}') || {}; } catch (e) { state.equip = {}; }
  }
  function saveFav() { try { localStorage.setItem(LS_FAV, JSON.stringify(state.fav)); } catch (e) { } }
  function saveEquip() { try { localStorage.setItem(LS_EQ, JSON.stringify(state.equip)); } catch (e) { } }

  function skinsOf(wpn) { return DB.skins.filter(function (s) { return s.wpn === wpn; }); }
  function byId(id) { for (var i = 0; i < DB.skins.length; i++) if (DB.skins[i].id === id) return DB.skins[i]; return null; }
  function imgOf(o) { return o ? (o.ic || o.icr) : ''; }
  function fallbackImg(el, remote) {
    if (!remote) return;
    el.onerror = function () { el.onerror = null; el.src = remote; };
  }

  /* ---------- 列表 ---------- */
  function applyFilter() {
    var q = state.q.trim().toLowerCase();
    var list = skinsOf(state.wpn).filter(function (s) {
      if (state.filter === 'fav' && !state.fav[s.id]) return false;
      if (state.filter === 'variants' && s.variants.length < 2) return false;
      if (['Ultra', 'Exclusive', 'Premium', 'Deluxe', 'Select'].indexOf(state.filter) >= 0 && s.tier !== state.filter) return false;
      if (q) {
        var hay = (s.full + ' ' + s.line + ' ' + (s.cn || '') + ' ' + (s.theme || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    list.sort(function (a, b) {
      var fa = state.fav[a.id] ? 1 : 0, fb = state.fav[b.id] ? 1 : 0;
      if (fa !== fb) return fb - fa;
      var ra = TIER_RANK[a.tier] || 0, rb = TIER_RANK[b.tier] || 0;
      if (ra !== rb) return rb - ra;
      return a.full.localeCompare(b.full);
    });
    state.list = list;
    state.shown = 0;
    var grid = document.getElementById('grid');
    grid.innerHTML = '';
    renderBatch();
    updateSide();
  }

  function renderBatch() {
    var grid = document.getElementById('grid');
    var list = state.list;
    if (!list.length) {
      grid.innerHTML = '<div class="empty"><span class="ic">🔍</span>没有找到匹配的皮肤</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    var end = Math.min(list.length, state.shown + state.batch);
    for (var i = state.shown; i < end; i++) frag.appendChild(card(list[i]));
    grid.appendChild(frag);
    state.shown = end;
  }

  function card(s) {
    var d = document.createElement('div');
    d.className = 'card' + (isEquipped(s) ? ' equipped' : '');
    d.dataset.id = s.id;
    d.style.setProperty('--tier', s.tierColor || '#5a9fe2');
    var favOn = state.fav[s.id] ? ' on' : '';
    d.innerHTML =
      '<div class="tierbar"></div>' +
      '<div class="fav' + favOn + '">★</div>' +
      (isEquipped(s) ? '<div class="eqmark">已装备</div>' : '') +
      '<div class="thumb"><img loading="lazy" alt=""></div>' +
      '<div class="meta">' +
      '<div class="nm">' + esc(s.full) + '</div>' +
      '<div class="cn">' + esc(s.cn || (s.theme || '')) + '</div>' +
      '<div class="badges"><span class="tier" style="background:' + (s.tierColor || '#5a9fe2') + '">' +
      (TIER_CN[s.tier] || s.tier) + '</span><span class="vcount">' + s.variants.length + ' 配色</span></div>' +
      '</div>';
    var img = d.querySelector('img');
    img.src = imgOf(s);
    fallbackImg(img, s.icr);
    d.querySelector('.fav').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFav(s.id, this);
    });
    d.addEventListener('click', function () { openDetail(s.id); });
    return d;
  }

  function isEquipped(s) {
    var e = state.equip[s.wpn];
    return e && e.id === s.id;
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function toggleFav(id, el) {
    if (state.fav[id]) delete state.fav[id]; else state.fav[id] = 1;
    saveFav();
    if (el) el.classList.toggle('on');
    if (global.Sfx) global.Sfx.ui();
    updateSide();
  }

  function updateSide() {
    var list = skinsOf(state.wpn);
    var favN = list.filter(function (s) { return state.fav[s.id]; }).length;
    var vN = list.reduce(function (a, s) { return a + s.variants.length; }, 0);
    var el1 = document.getElementById('side-total');
    if (el1) el1.textContent = list.length;
    var el2 = document.getElementById('side-fav');
    if (el2) el2.textContent = favN;
    var el3 = document.getElementById('side-variants');
    if (el3) el3.textContent = vN;
  }

  function buildLegend() {
    var box = document.getElementById('tier-legend');
    if (!box) return;
    var seen = {};
    skinsOf(state.wpn).forEach(function (s) {
      if (seen[s.tier]) return;
      seen[s.tier] = 1;
    });
    var order = ['Ultra', 'Exclusive', 'Premium', 'Deluxe', 'Select'];
    var colors = {};
    skinsOf('vandal').concat(skinsOf('phantom')).forEach(function (s) { colors[s.tier] = s.tierColor; });
    box.innerHTML = order.filter(function (t) { return seen[t]; }).map(function (t) {
      return '<div class="lg"><i style="background:' + (colors[t] || '#888') + '"></i>' + (TIER_CN[t] || t) + ' · ' + t + '</div>';
    }).join('');
  }

  /* ---------- 详情 ---------- */
  function openDetail(id) {
    var s = byId(id);
    if (!s) return;
    state.sel = s;
    state.selVariant = 0;
    var eq = state.equip[s.wpn];
    if (eq && eq.id === s.id && eq.variant) state.selVariant = eq.variant;
    var d = document.getElementById('detail');
    document.getElementById('d-name').textContent = s.full;
    document.getElementById('d-cn').textContent = (s.cn ? s.cn + ' · ' : '') + (s.theme || s.line);
    var gun = document.getElementById('d-gun');
    gun.src = imgOf(s);
    fallbackImg(gun, s.icr);
    var wall = document.getElementById('d-wall');
    if (s.wallpaper) { wall.style.backgroundImage = 'url(' + s.wallpaper + ')'; }
    else if (s.wallpaperR) { wall.style.backgroundImage = 'url(' + s.wallpaperR + ')'; }
    else { wall.style.backgroundImage = 'none'; }
    var tier = document.getElementById('d-tier');
    tier.textContent = (TIER_CN[s.tier] || s.tier);
    tier.style.background = s.tierColor || '#5a9fe2';
    document.getElementById('d-theme').textContent = s.theme || s.line;
    document.getElementById('d-vcount').textContent = s.variants.length + ' 种';
    document.getElementById('d-wpn').textContent = s.wpn === 'vandal' ? '暴徒 Vandal (AK)' : '幻影 Phantom (M4)';
    // 变体
    var vr = document.getElementById('d-variants');
    vr.innerHTML = '';
    s.variants.forEach(function (v, i) {
      var b = document.createElement('div');
      b.className = 'vdot' + (i === state.selVariant ? ' sel' : '');
      var im = document.createElement('img');
      im.src = v.ic || v.icr;
      fallbackImg(im, v.icr);
      b.appendChild(im);
      if (v.label) {
        var l = document.createElement('div');
        l.className = 'vl';
        l.textContent = shortLabel(v.label);
        b.appendChild(l);
      }
      b.addEventListener('click', function () {
        state.selVariant = i;
        vr.querySelectorAll('.vdot').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        gun.src = v.ic || v.icr;
        fallbackImg(gun, v.icr);
      });
      vr.appendChild(b);
    });
    // 等级
    var lv = document.getElementById('d-levels');
    lv.innerHTML = s.levels.length ? s.levels.map(function (l, i) {
      var it = l.item ? (LEVEL_CN[l.item] || l.item) : '基础外观';
      return '<div class="lv"><span>等级 ' + (i + 1) + '</span><b>' + esc(it) + '</b></div>';
    }).join('') : '<div class="lv"><span>等级 1</span><b>基础外观</b></div>';
    // 装备按钮
    var eqBtn = document.getElementById('d-equip');
    eqBtn.textContent = '装备到' + (s.wpn === 'vandal' ? '暴徒' : '幻影');
    document.getElementById('d-fav').textContent = state.fav[s.id] ? '★ 已收藏' : '☆ 收藏';
    d.classList.remove('hidden');
    if (global.Sfx) global.Sfx.ui();
  }
  function shortLabel(l) {
    var m = l.match(/Variant\s*\d+\s*(.*)/i);
    var t = m ? m[1] : l;
    t = t.replace(/[()]/g, '').trim();
    return t.length > 5 ? t.slice(0, 5) : t;
  }
  function closeDetail() {
    document.getElementById('detail').classList.add('hidden');
  }

  function equipSel() {
    var s = state.sel;
    if (!s) return;
    state.equip[s.wpn] = { id: s.id, variant: state.selVariant };
    saveEquip();
    if (global.Game) global.Game.equipSkin(s.wpn, s, state.selVariant);
    if (global.Sfx) global.Sfx.equip();
    if (global.UI) global.UI.refreshMenu();
    closeDetail();
    applyFilter();
    if (global.UI) global.UI.toastSmall('已装备 ' + s.full);
  }

  /* ---------- 检视 ---------- */
  var inspector = null;
  function openInspect(id) {
    var s = byId(id || (state.sel && state.sel.id));
    if (!s) return;
    state.sel = s;
    var box = document.getElementById('inspect');
    box.classList.remove('hidden');
    state.inspectOpen = true;
    var cv = document.getElementById('inspectCanvas');
    if (!inspector) inspector = new global.Inspector(cv);
    global.Game && (global.Game.inspector = inspector);
    cv.style.display = 'block';
    setTimeout(function () {
      inspector.resize();
      inspector.setSkin(s, state.selVariant);
    }, 30);
    document.getElementById('i-name').textContent = s.full;
    document.getElementById('i-sub').textContent = (TIER_CN[s.tier] || s.tier) + ' · ' + (s.theme || s.line) + ' · ' + s.variants.length + ' 配色';
    // 变体条
    var strip = document.getElementById('i-variants');
    strip.innerHTML = '';
    s.variants.forEach(function (v, i) {
      var b = document.createElement('div');
      b.className = 'vdot' + (i === state.selVariant ? ' sel' : '');
      var im = document.createElement('img');
      im.src = v.ic || v.icr; fallbackImg(im, v.icr);
      b.appendChild(im);
      b.addEventListener('click', function () {
        state.selVariant = i;
        inspector.setSkin(s, i);
        strip.querySelectorAll('.vdot').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
      });
      strip.appendChild(b);
    });
    state.lastT = performance.now();
    if (!state.rafId) state.rafId = requestAnimationFrame(inspectLoop);
  }
  function closeInspect() {
    state.inspectOpen = false;
    document.getElementById('inspect').classList.add('hidden');
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
  }
  function inspectLoop(t) {
    if (!state.inspectOpen) { state.rafId = 0; return; }
    state.rafId = requestAnimationFrame(inspectLoop);
    var dt = Math.min(0.05, (t - state.lastT) / 1000);
    state.lastT = t;
    if (inspector) { inspector.update(dt); inspector.draw(); }
  }

  /* ---------- 初始化 ---------- */
  function init() {
    load();
    // 标签
    document.querySelectorAll('#collection .tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('#collection .tab').forEach(function (x) { x.classList.remove('active'); });
        tab.classList.add('active');
        state.wpn = tab.dataset.wpn;
        state.filter = 'all';
        document.querySelectorAll('#filters .fbtn').forEach(function (b) { b.classList.remove('on'); });
        var all = document.querySelector('#filters .fbtn[data-f="all"]');
        if (all) all.classList.add('on');
        applyFilter();
      });
    });
    // 筛选
    document.querySelectorAll('#filters .fbtn[data-f]').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#filters .fbtn').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        state.filter = b.dataset.f;
        applyFilter();
      });
    });
    var rand = document.getElementById('randomSkin');
    if (rand) rand.addEventListener('click', function () {
      var list = skinsOf(state.wpn);
      var s = list[(Math.random() * list.length) | 0];
      state.sel = s;
      state.selVariant = 0;
      equipSel();
      openDetail(s.id);
    });
    // 搜索
    var si = document.getElementById('search');
    si.addEventListener('input', function () { state.q = si.value; applyFilter(); });
    document.getElementById('searchClr').addEventListener('click', function () { si.value = ''; state.q = ''; applyFilter(); });
    // 滚动加载
    document.getElementById('grid').addEventListener('scroll', function (e) {
      var el = e.target;
      if (el.scrollTop + el.clientHeight > el.scrollHeight - 320) renderBatch();
    });
    // 详情按钮
    document.getElementById('detailClose').addEventListener('click', closeDetail);
    document.getElementById('d-equip').addEventListener('click', equipSel);
    document.getElementById('d-inspect').addEventListener('click', function () { openInspect(); });
    document.getElementById('d-fav').addEventListener('click', function () {
      if (!state.sel) return;
      toggleFav(state.sel.id, null);
      this.textContent = state.fav[state.sel.id] ? '★ 已收藏' : '☆ 收藏';
      applyFilter();
    });
    // 检视按钮
    document.getElementById('i-close').addEventListener('click', closeInspect);
    document.getElementById('i-equip').addEventListener('click', function () { equipSel(); closeInspect(); });
    document.getElementById('i-level').addEventListener('click', function () {
      if (inspector) { inspector.effect = !inspector.effect; this.textContent = inspector.effect ? '关闭特效' : '开启特效'; }
    });
    document.getElementById('colBack').addEventListener('click', function () {
      closeDetail(); closeInspect();
      if (global.UI) global.UI.back();
    });
    updateSide();
    buildLegend();
  }

  global.Collection = {
    init: init, open: function (wpn) {
      if (wpn) {
        state.wpn = wpn;
        document.querySelectorAll('#collection .tab').forEach(function (x) {
          x.classList.toggle('active', x.dataset.wpn === wpn);
        });
      }
      applyFilter(); buildLegend();
    },
    equipFromStorage: function () {
      // 启动时把已保存的皮肤同步到 Game；没有存档就用官方默认外观
      ['vandal', 'phantom'].forEach(function (w) {
        var e = state.equip[w];
        var s = e && e.id ? byId(e.id) : null;
        if (!s) s = byId('std-' + w);
        if (s) {
          state.equip[w] = { id: s.id, variant: (e && e.variant) || 0 };
          if (global.Game) global.Game.equipSkin(w, s, (e && e.variant) || 0);
        }
      });
      saveEquip();
    },
    getEquipped: function (wpn) {
      var e = state.equip[wpn];
      return e ? byId(e.id) : null;
    },
    getVariant: function (wpn) { var e = state.equip[wpn]; return e ? (e.variant || 0) : 0; }
  };
})(window);
