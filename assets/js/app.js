/* ============================================================
   日常记事本 · 逻辑
   数据保存在浏览器本机（localStorage），不上传任何服务器
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'daily-notes.v1';
  var TRASH_DAYS = 30;
  var MAX_CATS = 12;
  var DAY = 86400000;

  var PALETTE = ['#D9714E', '#E0A458', '#6FA86F', '#5B8DB8', '#9B7BB8', '#C97B84', '#7FA8A0', '#B08D57'];

  var DEFAULT_CATS = [
    { id: 'life', name: '生活琐事', color: '#D9714E' },
    { id: 'food', name: '美食菜谱', color: '#E0A458' },
    { id: 'health', name: '健康运动', color: '#6FA86F' },
    { id: 'media', name: '读书影音', color: '#5B8DB8' },
    { id: 'idea', name: '灵感随手记', color: '#9B7BB8' }
  ];

  var VIEW_TITLE = { all: '全部笔记', today: '今天的笔记', week: '最近 7 天', starred: '星标笔记', trash: '回收站' };

  /* ---------------- 工具函数 ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hexA(hex, a) {
    var h = String(hex || '#B0A394').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }
  function sameDay(a, b) { return startOfDay(a) === startOfDay(b); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts), now = new Date();
    var days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (days <= 0) return '今天 ' + hm;
    if (days === 1) return '昨天 ' + hm;
    if (days < 7) return days + ' 天前';
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }
  function formatFull(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function weekdayName(d) { return '星期' + '日一二三四五六'[d.getDay()]; }

  /* ---------------- 状态 ---------------- */
  var state = {
    notes: [],
    categories: [],
    view: 'all',
    catFilter: null,
    query: '',
    editingId: null,
    pickedCat: null,
    confirmFn: null,
    undo: null
  };

  function getCat(id) {
    for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i];
    return null;
  }
  function catName(id) { var c = getCat(id); return c ? c.name : '未分类'; }
  function catColor(id) { var c = getCat(id); return c ? c.color : '#B0A394'; }
  function displayTitle(n) {
    if (n.title && n.title.trim()) return n.title.trim();
    var first = String(n.content || '').split('\n')[0].trim();
    return first ? (first.length > 18 ? first.slice(0, 18) + '…' : first) : '无标题笔记';
  }

  /* ---------------- 存储 ---------------- */
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, notes: state.notes, categories: state.categories }));
    } catch (e) {
      toast('保存失败：浏览器存储空间可能已满');
    }
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var data = JSON.parse(raw);
        state.notes = Array.isArray(data.notes) ? data.notes : [];
        state.categories = Array.isArray(data.categories) && data.categories.length ? data.categories : DEFAULT_CATS.slice();
        normalize();
        return;
      } catch (e) { /* 数据损坏则重新开始 */ }
    }
    state.categories = DEFAULT_CATS.slice();
    state.notes = seedNotes();
    save();
  }

  function normalize() {
    var now = Date.now(), changed = false;
    state.notes = state.notes.filter(function (n) {
      if (n && n.deletedAt && now - n.deletedAt > TRASH_DAYS * DAY) { changed = true; return false; }
      return !!n;
    }).map(function (n) {
      return {
        id: n.id || uid(),
        title: n.title || '',
        content: n.content || '',
        category: n.category || null,
        starred: !!n.starred,
        createdAt: n.createdAt || n.updatedAt || now,
        updatedAt: n.updatedAt || n.createdAt || now,
        deletedAt: n.deletedAt || null
      };
    });
    if (changed) save();
  }

  function seedNotes() {
    var now = Date.now(), t = now;
    var m = function (mins) { return t - mins * 60000; };
    function mk(o) {
      return {
        id: uid(), title: o.title, content: o.content, category: o.cat, starred: !!o.star,
        createdAt: o.at, updatedAt: o.at, deletedAt: null
      };
    }
    return [
      mk({ title: '周末去菜市场采购', cat: 'life', star: true, at: m(40), content: '西红柿 3 斤、鸡蛋一板、排骨两斤，顺手买了盒小番茄当零食。\n摊主阿姨说下周板栗就上新了，记得去晚一点更便宜。' }),
      mk({ title: '番茄牛腩 · 第一次做成功', cat: 'food', at: m(60 * 14), content: '牛腩先焯水去沫，加两片姜和一勺料酒，小火炖 90 分钟再放番茄。\n收汁时放一点糖，汤会更浓。下次少放盐。' }),
      mk({ title: '跑步 5 公里，配速 6\'12"', cat: 'health', at: m(60 * 30), content: '滨江跑道来回，天气凉快跑起来很舒服，膝盖没有不适。\n拉伸做了 10 分钟，周目标还差 8 公里。' }),
      mk({ title: '《夜晚的潜水艇》读到第三章', cat: 'media', star: true, at: m(60 * 46), content: '文字像水一样流动，把幻想写得特别安静。\n摘一句：「他说，记忆是一种液体，会慢慢渗进墙里。」' }),
      mk({ title: '想把阳台改造成小花园', cat: 'idea', at: m(60 * 70), content: '先量一下阳台尺寸，考虑装两层置物架。\n薄荷和迷迭香好养活，再放一把折叠椅，周末可以坐着喝茶看书。' }),
      mk({ title: '九月记账小结', cat: 'life', at: m(60 * 96), content: '这个月餐饮花了 1280，比上月少了 300，少点外卖真的有用。' }),
      mk({ title: '妈妈的红烧排骨做法', cat: 'food', star: true, at: m(60 * 120), content: '排骨煎到微黄，加冰糖炒色，两勺生抽一勺老抽，小火 40 分钟。' }),
      mk({ title: '周末去看的那场光影展', cat: 'media', at: m(60 * 150), content: '站在装置中间会有回声，光影落在地上像水波。门票 60，值得再去一次。' }),
      mk({ title: '换季衣服整理清单', cat: 'life', at: m(60 * 180), content: '羽绒服送干洗，毛衣收进真空袋，夏天的短袖留两件备用。' }),
      mk({ title: '早睡挑战第 7 天', cat: 'health', star: true, at: m(60 * 210), content: '连续七天 23 点前上床，白天精神明显变好，继续坚持。' }),
      mk({ title: '下个月想去的三个地方', cat: 'idea', at: m(60 * 240), content: '近郊的竹林、老城区的旧书店、江边的日落露台，慢慢一个个去。' })
    ];
  }

  /* ---------------- 筛选 ---------------- */
  function visibleNotes() {
    var now = Date.now();
    var q = state.query.trim().toLowerCase();
    var list = state.notes.slice();

    if (state.view === 'trash') {
      list = list.filter(function (n) { return !!n.deletedAt; });
    } else {
      list = list.filter(function (n) { return !n.deletedAt; });
      if (state.view === 'today') list = list.filter(function (n) { return sameDay(n.updatedAt, now); });
      if (state.view === 'week') list = list.filter(function (n) { return now - n.updatedAt < 7 * DAY; });
      if (state.view === 'starred') list = list.filter(function (n) { return n.starred; });
    }
    if (state.catFilter) list = list.filter(function (n) { return n.category === state.catFilter; });
    if (q) {
      list = list.filter(function (n) {
        return (displayTitle(n) + ' ' + n.content + ' ' + catName(n.category)).toLowerCase().indexOf(q) >= 0;
      });
    }
    list.sort(function (a, b) {
      return state.view === 'trash' ? (b.deletedAt - a.deletedAt) : (b.updatedAt - a.updatedAt);
    });
    return list;
  }

  function countFor(view) {
    var now = Date.now();
    return state.notes.filter(function (n) {
      if (view === 'trash') return !!n.deletedAt;
      if (n.deletedAt) return false;
      if (view === 'today') return sameDay(n.updatedAt, now);
      if (view === 'week') return now - n.updatedAt < 7 * DAY;
      if (view === 'starred') return n.starred;
      return true;
    }).length;
  }

  /* ---------------- 渲染 ---------------- */
  function renderSidebar() {
    $$('#viewNav .nav-item').forEach(function (el) {
      var v = el.getAttribute('data-view');
      el.classList.toggle('active', state.view === v);
      var c = $('[data-count="' + v + '"]', el);
      var n = countFor(v);
      c.textContent = n;
    });

    var box = $('#catList');
    box.innerHTML = state.categories.map(function (c) {
      var n = state.notes.filter(function (x) { return !x.deletedAt && x.category === c.id; }).length;
      return '<div class="cat' + (state.catFilter === c.id ? ' active' : '') + '" data-cat="' + c.id + '">' +
        '<i style="background:' + c.color + '"></i>' + esc(c.name) + '<span class="num">' + n + '</span></div>';
    }).join('') || '<div class="cat" style="cursor:default;color:#B3A695">还没有分类，点右上角 ＋ 添加</div>';

    var active = countFor('all');
    $('#userSub').textContent = '共 ' + active + ' 条笔记';
  }

  function renderChips() {
    var html = '<button class="chip' + (state.catFilter === null ? ' active' : '') + '" data-cat="">全部</button>';
    html += state.categories.map(function (c) {
      return '<button class="chip' + (state.catFilter === c.id ? ' active' : '') + '" data-cat="' + c.id + '">' + esc(c.name) + '</button>';
    }).join('');
    $('#chips').innerHTML = html;
  }

  function renderList() {
    var list = visibleNotes();
    var grid = $('#grid');
    var empty = $('#empty');
    var head = $('#listHead');

    var showHead = state.view !== 'all' || !!state.catFilter || !!state.query.trim();
    head.classList.toggle('show', showHead);
    if (showHead) {
      var title = state.query.trim() ? '搜索结果' : (state.catFilter ? catName(state.catFilter) : VIEW_TITLE[state.view]);
      var tail = state.view === 'trash'
        ? '<button class="chip" id="clearTrash" style="padding:5px 12px">清空回收站</button>'
        : '';
      head.innerHTML = '<h2>' + esc(title) + '</h2><span class="hint">' + list.length + ' 条' + tail + '</span>';
    }

    if (!list.length) {
      grid.hidden = true;
      empty.hidden = false;
      if (state.query.trim()) {
        $('#emptyIco').textContent = '🔍';
        $('#emptyTitle').textContent = '没有找到相关笔记';
        $('#emptyText').textContent = '换个关键词试试，或者清空搜索条件。';
        $('#emptyBtn').hidden = true;
      } else if (state.view === 'trash') {
        $('#emptyIco').textContent = '🗑️';
        $('#emptyTitle').textContent = '回收站是空的';
        $('#emptyText').textContent = '删除的笔记会先放到这里，30 天内都可以恢复。';
        $('#emptyBtn').hidden = true;
      } else {
        $('#emptyIco').textContent = '🌱';
        $('#emptyTitle').textContent = state.catFilter ? '这个分类还没有笔记' : '还没有笔记';
        $('#emptyText').textContent = '写下第一条笔记，开始记录你的日常。';
        $('#emptyBtn').hidden = false;
      }
      return;
    }

    empty.hidden = true;
    grid.hidden = false;
    grid.innerHTML = list.map(cardHTML).join('') + addCardHTML();
  }

  function cardHTML(n) {
    var inTrash = !!n.deletedAt;
    var color = catColor(n.category);
    var pill = '<span class="pill' + (getCat(n.category) ? '' : ' cat-none') + '" style="background:' + hexA(color, .14) + ';color:' + color + '">' + esc(catName(n.category)) + '</span>';

    var acts;
    var footRight;
    if (inTrash) {
      var left = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - n.deletedAt) / DAY));
      footRight = '<span class="trash-note' + (left <= 7 ? ' warn' : '') + '">还剩 ' + left + ' 天</span>';
      acts = '<div class="acts visible">' +
        '<button class="act" data-act="restore" title="恢复笔记">♻️</button>' +
        '<button class="act danger" data-act="purge" title="永久删除">🗑️</button></div>';
    } else {
      footRight = '<span>' + String(n.content || '').replace(/\s/g, '').length + ' 字</span>';
      acts = '<div class="acts">' +
        '<button class="act star' + (n.starred ? ' on' : '') + '" data-act="star" title="' + (n.starred ? '取消星标' : '标为星标') + '">' + (n.starred ? '⭐' : '☆') + '</button>' +
        '<button class="act" data-act="edit" title="编辑笔记">✏️</button>' +
        '<button class="act danger" data-act="delete" title="删除笔记">🗑️</button></div>';
    }

    return '<article class="card" tabindex="0" data-id="' + n.id + '" title="点击编辑">' +
      '<div class="card-top">' + pill + acts + '</div>' +
      '<h3>' + esc(displayTitle(n)) + '</h3>' +
      '<p>' + esc(n.content || '（没有正文）') + '</p>' +
      '<div class="card-foot"><span>' + formatTime(inTrash ? n.deletedAt : n.updatedAt) + '</span>' + footRight + '</div>' +
      '</article>';
  }

  function addCardHTML() {
    if (state.view === 'trash') return '';
    return '<article class="card add-card" data-new-note tabindex="0" role="button">' +
      '<div class="plus">＋</div><div>写一条新笔记…</div></article>';
  }

  function render() {
    renderSidebar();
    renderChips();
    renderList();
  }

  /* ---------------- 提示条 ---------------- */
  var toastTimer = null, toastAction = null;
  function toast(msg, actionLabel, actionFn) {
    var el = $('#toast');
    toastAction = actionFn || null;
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (actionLabel ? '<button type="button" id="toastAct">' + esc(actionLabel) + '</button>' : '');
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 2600);
  }
  function hideToast() {
    var el = $('#toast');
    el.classList.remove('show');
    toastAction = null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 220);
  }

  /* ---------------- 弹窗控制 ---------------- */
  function openModal(el) {
    el.hidden = false;
    document.body.classList.add('modal-open');
  }
  function closeModal(el) {
    el.hidden = true;
    if (!$$('.modal').some(function (m) { return !m.hidden; })) document.body.classList.remove('modal-open');
  }
  function closeTopModal() {
    var open = $$('.modal').filter(function (m) { return !m.hidden; });
    if (open.length) closeModal(open[open.length - 1]);
  }

  function askConfirm(opts) {
    $('#confirmIcon').textContent = opts.icon || '🗑️';
    $('#confirmTitle').textContent = opts.title || '确认操作？';
    $('#confirmText').textContent = opts.text || '';
    $('#confirmHint').textContent = opts.hint || '';
    var ok = $('#confirmOk');
    ok.textContent = opts.okLabel || '确定';
    ok.className = opts.danger === false ? 'bp' : 'bd';
    state.confirmFn = opts.onOk;
    openModal($('#confirmModal'));
  }

  /* ---------------- 笔记操作 ---------------- */
  function openNoteModal(note) {
    state.editingId = note ? note.id : null;
    state.pickedCat = note ? note.category : (state.catFilter || (state.categories[0] && state.categories[0].id) || null);
    $('#noteModalTitle').textContent = note ? '编辑笔记' : '新建笔记';
    $('#noteModalTip').textContent = note
      ? '创建于 ' + formatFull(note.createdAt) + ' · 最近修改 ' + formatFull(note.updatedAt)
      : '记录此刻的想法，随时可以回来修改';
    $('#noteTitle').value = note ? note.title : '';
    $('#noteContent').value = note ? note.content : '';
    renderCatPicker();
    openModal($('#noteModal'));
    setTimeout(function () { $('#noteTitle').focus(); }, 60);
  }

  function renderCatPicker() {
    var html = state.categories.map(function (c) {
      return '<button class="cp' + (state.pickedCat === c.id ? ' on' : '') + '" type="button" data-pick="' + c.id + '">' + esc(c.name) + '</button>';
    }).join('');
    html += '<button class="cp' + (state.pickedCat === null ? ' on' : '') + '" type="button" data-pick="">未分类</button>';
    $('#catPicker').innerHTML = html;
  }

  function saveNote() {
    var title = $('#noteTitle').value.trim();
    var content = $('#noteContent').value.trim();
    if (!title && !content) {
      toast('先写点内容再保存吧');
      $('#noteTitle').focus();
      return;
    }
    var now = Date.now();
    if (state.editingId) {
      var n = findNote(state.editingId);
      if (n) {
        n.title = title; n.content = content; n.category = state.pickedCat; n.updatedAt = now;
        save(); render(); toast('已保存修改');
      }
    } else {
      state.notes.push({
        id: uid(), title: title, content: content, category: state.pickedCat,
        starred: false, createdAt: now, updatedAt: now, deletedAt: null
      });
      save();
      if (state.view === 'starred') state.view = 'all';
      if (state.view === 'trash') state.view = 'all';
      render(); toast('已添加笔记');
    }
    closeModal($('#noteModal'));
  }

  function findNote(id) {
    for (var i = 0; i < state.notes.length; i++) if (state.notes[i].id === id) return state.notes[i];
    return null;
  }

  function toggleStar(n) {
    n.starred = !n.starred;
    n.updatedAt = Date.now();
    save(); render();
    toast(n.starred ? '已标为星标' : '已取消星标');
  }

  function moveToTrash(n) {
    n.deletedAt = Date.now();
    save(); render();
    toast('「' + displayTitle(n) + '」已移入回收站', '撤销', function () {
      n.deletedAt = null;
      save(); render();
      toast('已恢复');
    });
  }

  function purgeNote(n) {
    state.notes = state.notes.filter(function (x) { return x.id !== n.id; });
    save(); render(); toast('已永久删除');
  }

  function restoreNote(n) {
    n.deletedAt = null;
    n.updatedAt = Date.now();
    save(); render(); toast('已恢复到笔记列表');
  }

  /* ---------------- 分类管理 ---------------- */
  function renderCatManage() {
    var list = $('#catManageList');
    if (!state.categories.length) {
      list.innerHTML = '<div class="cat-row" style="color:#B3A695;font-size:13px">还没有分类</div>';
      return;
    }
    list.innerHTML = state.categories.map(function (c) {
      var n = state.notes.filter(function (x) { return !x.deletedAt && x.category === c.id; }).length;
      return '<div class="cat-row" data-cat="' + c.id + '">' +
        '<i style="background:' + c.color + '"></i>' +
        '<input type="text" maxlength="12" value="' + esc(c.name) + '" data-rename>' +
        '<span class="num">' + n + ' 条</span>' +
        '<button class="del" type="button" data-delcat title="删除分类">✕</button></div>';
    }).join('');
    $('#catHint').textContent = '已用 ' + state.categories.length + ' / ' + MAX_CATS + ' 个分类';
  }

  function addCategory() {
    var input = $('#newCatName');
    var name = input.value.trim();
    if (!name) { toast('请输入分类名称'); input.focus(); return; }
    if (state.categories.length >= MAX_CATS) { toast('最多创建 ' + MAX_CATS + ' 个分类'); return; }
    if (state.categories.some(function (c) { return c.name === name; })) { toast('已有同名分类'); return; }
    state.categories.push({ id: uid(), name: name, color: PALETTE[state.categories.length % PALETTE.length] });
    input.value = '';
    save(); render(); renderCatManage();
    toast('已添加分类「' + name + '」');
  }

  function deleteCategory(cat) {
    askConfirm({
      icon: '🏷️',
      title: '删除分类「' + cat.name + '」？',
      text: '这个分类下的笔记不会被删除，会变成「未分类」。',
      okLabel: '删除分类',
      hint: '',
      onOk: function () {
        state.categories = state.categories.filter(function (c) { return c.id !== cat.id; });
        state.notes.forEach(function (n) { if (n.category === cat.id) n.category = null; });
        if (state.catFilter === cat.id) state.catFilter = null;
        if (state.pickedCat === cat.id) state.pickedCat = null;
        save(); render(); renderCatManage();
        toast('已删除分类');
      }
    });
  }

  /* ---------------- 备份 ---------------- */
  function exportBackup() {
    var data = { app: 'daily-notes', version: 1, exportedAt: new Date().toISOString(), notes: state.notes, categories: state.categories };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var d = new Date();
    var a = document.createElement('a');
    a.href = url;
    a.download = '日常记事本备份-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('备份已导出（' + state.notes.length + ' 条笔记）');
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) { toast('文件格式不对，无法导入'); return; }
      if (!data || !Array.isArray(data.notes)) { toast('文件里没有找到笔记数据'); return; }
      askConfirm({
        icon: '📥',
        title: '导入 ' + data.notes.length + ' 条笔记？',
        text: '导入会替换当前的全部笔记和分类，建议先导出一份备份。',
        okLabel: '确认导入',
        hint: '',
        onOk: function () {
          state.notes = data.notes;
          if (Array.isArray(data.categories) && data.categories.length) state.categories = data.categories;
          normalize();
          state.view = 'all'; state.catFilter = null; state.query = '';
          $('#searchInput').value = ''; $('#searchClear').hidden = true;
          save(); render();
          toast('导入完成');
        }
      });
    };
    reader.readAsText(file, 'utf-8');
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    document.addEventListener('click', function (e) {
      var t = e.target;

      var chip = t.closest ? t.closest('.chip') : null;
      if (chip && chip.hasAttribute('data-cat')) {
        var id = chip.getAttribute('data-cat');
        state.catFilter = id || null;
        render(); return;
      }

      var nav = t.closest ? t.closest('.nav-item') : null;
      if (nav) {
        e.preventDefault();
        state.view = nav.getAttribute('data-view');
        state.catFilter = null;
        state.query = '';
        $('#searchInput').value = '';
        $('#searchClear').hidden = true;
        $('#grid').scrollTop = 0;
        render(); closeSidebar();
        return;
      }

      var cat = t.closest ? t.closest('.cat') : null;
      if (cat && cat.hasAttribute('data-cat')) {
        var cid = cat.getAttribute('data-cat');
        state.catFilter = state.catFilter === cid ? null : cid;
        if (state.view === 'trash') state.view = 'all';
        render(); closeSidebar();
        return;
      }

      var act = t.closest ? t.closest('[data-act]') : null;
      if (act) {
        e.stopPropagation();
        var card = act.closest('.card');
        var n = card && findNote(card.getAttribute('data-id'));
        if (!n) return;
        var a = act.getAttribute('data-act');
        if (a === 'star') toggleStar(n);
        if (a === 'edit') openNoteModal(n);
        if (a === 'delete') {
          askConfirm({
            icon: '🗑️',
            title: '删除这条笔记？',
            text: '「' + displayTitle(n) + '」将被移入回收站，' + TRASH_DAYS + ' 天内都可以恢复。',
            okLabel: '删除',
            hint: '删除后仍可撤销',
            onOk: function () { moveToTrash(n); }
          });
        }
        if (a === 'restore') restoreNote(n);
        if (a === 'purge') {
          askConfirm({
            icon: '⚠️',
            title: '永久删除这条笔记？',
            text: '「' + displayTitle(n) + '」将被彻底删除，无法恢复。',
            okLabel: '永久删除',
            hint: '',
            onOk: function () { purgeNote(n); }
          });
        }
        return;
      }

      if (t.closest && t.closest('[data-new-note]')) { openNoteModal(null); return; }

      var cardEl = t.closest ? t.closest('.card') : null;
      if (cardEl) {
        var note = findNote(cardEl.getAttribute('data-id'));
        if (note) {
          if (note.deletedAt) toast('这条笔记在回收站里，可以点 ♻️ 恢复');
          else openNoteModal(note);
        }
        return;
      }

      if (t.closest && t.closest('[data-close]')) { closeTopModal(); return; }
    });

    $('#grid').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest ? e.target.closest('.card') : null;
      if (!card) return;
      if (e.target !== card) return;
      e.preventDefault();
      if (card.hasAttribute('data-new-note')) { openNoteModal(null); return; }
      var n = findNote(card.getAttribute('data-id'));
      if (n && !n.deletedAt) openNoteModal(n);
    });

    $('#saveNoteBtn').addEventListener('click', saveNote);
    $('#confirmOk').addEventListener('click', function () {
      var fn = state.confirmFn;
      state.confirmFn = null;
      closeModal($('#confirmModal'));
      if (fn) fn();
    });

    $('#catPicker').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick]');
      if (!b) return;
      state.pickedCat = b.getAttribute('data-pick') || null;
      renderCatPicker();
    });

    var searchInput = $('#searchInput');
    function doSearch() {
      state.query = searchInput.value;
      $('#searchClear').hidden = !searchInput.value;
      renderList();
    }
    searchInput.addEventListener('input', doSearch);
    searchInput.addEventListener('keydown', function (e) { if (e.key === 'Escape') { searchInput.value = ''; doSearch(); searchInput.blur(); } });
    $('#searchClear').addEventListener('click', function () { searchInput.value = ''; doSearch(); searchInput.focus(); });

    document.addEventListener('click', function (e) {
      if (e.target.id === 'clearTrash') {
        askConfirm({
          icon: '🗑️',
          title: '清空回收站？',
          text: '回收站里的 ' + countFor('trash') + ' 条笔记将被永久删除，无法恢复。',
          okLabel: '清空回收站',
          hint: '',
          onOk: function () {
            state.notes = state.notes.filter(function (n) { return !n.deletedAt; });
            save(); render(); toast('回收站已清空');
          }
        });
      }
      if (e.target.id === 'toastAct' && toastAction) { var f = toastAction; toastAction = null; hideToast(); f(); }
    });

    $('#manageCatsBtn').addEventListener('click', function () { renderCatManage(); openModal($('#catModal')); });
    $('#addCatBtn').addEventListener('click', addCategory);
    $('#newCatName').addEventListener('keydown', function (e) { if (e.key === 'Enter') addCategory(); });

    $('#catManageList').addEventListener('click', function (e) {
      var del = e.target.closest('[data-delcat]');
      if (!del) return;
      var row = del.closest('.cat-row');
      var cat = getCat(row.getAttribute('data-cat'));
      if (cat) deleteCategory(cat);
    });
    $('#catManageList').addEventListener('change', function (e) {
      var input = e.target.closest('[data-rename]');
      if (!input) return;
      var row = input.closest('.cat-row');
      var cat = getCat(row.getAttribute('data-cat'));
      var name = input.value.trim();
      if (!cat) return;
      if (!name) { input.value = cat.name; return; }
      cat.name = name;
      save(); render(); toast('分类已重命名');
    });

    $('#moreBtn').addEventListener('click', function () { openModal($('#moreModal')); });
    $('#exportBtn').addEventListener('click', exportBackup);
    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importBackup(f);
      e.target.value = '';
    });
    $('#clearAllBtn').addEventListener('click', function () {
      askConfirm({
        icon: '⚠️',
        title: '清空全部笔记？',
        text: '当前 ' + countFor('all') + ' 条笔记（含回收站）都会被永久删除，建议先导出备份。',
        okLabel: '全部删除',
        hint: '',
        onOk: function () {
          state.notes = [];
          save(); render(); toast('已清空全部笔记');
        }
      });
    });

    $('#menuBtn').addEventListener('click', openSidebar);
    $('#sidebarClose').addEventListener('click', closeSidebar);
    $('#sidebarMask').addEventListener('click', closeSidebar);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeTopModal(); closeSidebar(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !$('#noteModal').hidden) { e.preventDefault(); saveNote(); }
      if (e.key === '/' && document.activeElement && ['INPUT', 'TEXTAREA'].indexOf(document.activeElement.tagName) < 0) {
        e.preventDefault(); $('#searchInput').focus();
      }
    });

    $('#noteTitle').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('#noteContent').focus(); }
    });
  }

  function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarMask').classList.add('show'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarMask').classList.remove('show'); }

  /* ---------------- 顶部问候 ---------------- */
  function renderHeader() {
    var now = new Date(), h = now.getHours();
    var greet = h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    var emoji = h < 5 ? '🌙' : h < 11 ? '☀️' : h < 18 ? '🌤️' : '🌆';
    $('#greeting').textContent = greet + ' ' + emoji;
    $('#todayLine').textContent = now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' +
      weekdayName(now) + ' · 今天想记录点什么？';
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    load();
    renderHeader();
    bind();
    render();
    initFileNotice();
  }

  // 以本地文件方式打开时给一次友好提示（点「知道了」后不再出现）
  function initFileNotice() {
    if (location.protocol !== 'file:') return;
    var bar = $('#fileNotice');
    if (!bar) return;
    var KEY = 'daily-notes.fileTipHidden';
    try { if (localStorage.getItem(KEY) === '1') return; } catch (e) { }
    bar.hidden = false;
    $('#noticeClose').addEventListener('click', function () {
      bar.hidden = true;
      try { localStorage.setItem(KEY, '1'); } catch (e) { }
    });
    $('#noticeBackup').addEventListener('click', function () {
      bar.hidden = true;
      try { localStorage.setItem(KEY, '1'); } catch (e) { }
      openModal($('#moreModal'));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // 供调试使用
  window.__notesApp = { state: state, save: save, render: render };
})();




