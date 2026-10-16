/* UI 코어 — 화면 골격과 공통 부품. 각 화면은 ui-*.js 에서 UI.views[탭] 으로 등록됩니다. */
(function (root) {
  'use strict';
  var AB = root.AB = root.AB || {};
  var U = AB.util, C = AB.calc, St = AB.store, Sy = AB.sync;
  var UI = AB.ui = { actions: {}, inputs: {}, changes: {}, views: {} };

  UI.S = {
    month: U.today().slice(0, 7), tab: 'home', ana: 'budget', statsMode: 'expense',
    q: '', fType: 'all', fRepeat: 'all', fAcct: '', fCat: '', allTime: false, showBudget: false, filtersOpen: false
  };
  var $ = UI.$ = function (sel) { return document.querySelector(sel); };
  var esc = U.esc;

  /* ───── 아이콘 ───── */
  var ICON = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
    gear: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  UI.icon = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>'; };

  UI.relTime = function (ts) {
    if (!ts) return '아직 없음';
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return '방금'; if (s < 3600) return Math.round(s / 60) + '분 전'; if (s < 86400) return Math.round(s / 3600) + '시간 전';
    return Math.round(s / 86400) + '일 전';
  };

  /* ───── 파생값(한 번 계산해 모든 화면이 공유) ───── */
  var cache = { key: '', val: null };
  UI.derive = function () {
    var S = UI.S, today = U.today(), key = St.version() + '|' + S.month + '|' + today;
    if (cache.key === key) return cache.val;
    var rows = St.rows(), eff = C.effective(St.cfg(), rows), range = U.monthRange(S.month), asOf = C.asOfFor(S.month, today);
    var d = { rows: rows, eff: eff, range: range, today: today, asOf: asOf, month: S.month };
    d.isCurrent = today >= range.start && today <= range.end;
    d.isPast = S.month < today.slice(0, 7); d.isFuture = S.month > today.slice(0, 7);
    d.acct = C.accountTable(rows, eff, range.start, asOf, range.end);
    d.budget = C.budgetTable(rows, eff, range.start, asOf, range.end);
    d.totals = C.periodTotals(rows, range.start, asOf);
    d.funding = C.fundingPlan(d.acct, eff);
    d.cards = C.cardSchedule(rows, eff, today);
    d.audit = C.audit(rows, eff, range.start, asOf);
    d.idx = AB.smart.buildIndex(rows, today);
    cache = { key: key, val: d };
    return d;
  };

  /* ───── 공통 HTML 부품 ───── */
  UI.gauge = function (b) {
    var max = Math.max(b.planMonth, b.actual, b.planToDate, 1);
    var fill = b.actual / max * 100, tick = b.planToDate / max * 100, end = b.planMonth / max * 100;
    return '<div class="gauge"><div class="fill ' + b.status + '" style="width:' + fill.toFixed(1) + '%"></div>' +
      (b.planMonth ? '<i class="end" style="left:' + end.toFixed(1) + '%;right:auto"></i>' : '') +
      (b.planToDate ? '<i class="tick" style="left:' + tick.toFixed(1) + '%"></i>' : '') + '</div>';
  };
  UI.gaugeLegend = function () { return '<div class="gauge-legend"><span><i></i>오늘까지 계획</span><span>막대 = 실제 사용</span></div>'; };

  var TI = { expense: '지출', income: '수입', transfer: '이체', budget: '예산' };
  UI.row = function (r, today) {
    var future = r.date > today && r.type !== 'budget', t1 = r.usage || r.category || TI[r.type], meta = [];
    if (r.category && r.type !== 'transfer') meta.push(r.category);
    if (r.type === 'expense') meta.push(r.from || '출금계정 없음');
    else if (r.type === 'income') meta.push(r.to || '입금계정 없음');
    else if (r.type === 'transfer') meta.push((r.from || '?') + ' → ' + (r.to || '?'));
    var amt = r.type === 'budget' ? r.budget : r.amount, sign = r.type === 'expense' ? '−' : r.type === 'income' ? '+' : '';
    var tags = (r.repeat === '고정' ? '<span class="tag fix">고정</span>' : '') + (future ? '<span class="tag soon">예정</span>' : '') + (r.type === 'budget' ? '<span class="tag plan">계획</span>' : '');
    return '<div class="li' + (future ? ' future' : '') + '" data-act="edit" data-id="' + esc(r.id) + '">' +
      '<div class="ic ' + r.type + '">' + TI[r.type].charAt(0) + '</div>' +
      '<div class="main"><div class="t1">' + esc(t1) + tags + '</div><div class="t2">' + esc(meta.join(' · ')) + '</div></div>' +
      '<div class="amt num ' + r.type + '">' + sign + U.num(amt) + '</div></div>';
  };

  /* ───── 토스트 / 다이얼로그 / 시트 ───── */
  UI.toast = function (msg, opt) {
    opt = opt || {};
    var t = $('#toast'); if (!t) return;
    t.className = 'toast show ' + (opt.kind || '');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (opt.action ? '<button data-act="toast-action">' + esc(opt.action.label) + '</button>' : '');
    UI._toastAct = opt.action ? opt.action.fn : null;
    clearTimeout(UI._tt);
    UI._tt = setTimeout(function () { t.classList.remove('show'); }, opt.ms || (opt.action ? 6500 : 2800));
  };
  UI.actions['toast-action'] = function () { var f = UI._toastAct; UI._toastAct = null; $('#toast').classList.remove('show'); if (f) f(); };

  UI.confirm = function (msg, o) {
    o = o || {};
    return new Promise(function (res) {
      var d = document.createElement('div'); d.className = 'dlg-scrim';
      d.innerHTML = '<div class="dlg" role="alertdialog" aria-modal="true"><p>' + esc(msg) + '</p><div class="row"><button class="btn ghost" data-r="0">' + esc(o.cancel || '취소') + '</button><button class="btn ' + (o.danger ? 'danger' : '') + '" data-r="1">' + esc(o.ok || '확인') + '</button></div></div>';
      d.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b) { d.remove(); res(b.dataset.r === '1'); } else if (e.target === d) { d.remove(); res(false); } });
      document.body.appendChild(d);
    });
  };
  UI.prompt = function (msg, value, o) {
    o = o || {};
    return new Promise(function (res) {
      var d = document.createElement('div'); d.className = 'dlg-scrim';
      d.innerHTML = '<div class="dlg" role="dialog" aria-modal="true"><p>' + esc(msg) + '</p><input class="input" id="dlg-in" ' + (o.numeric ? 'inputmode="numeric" ' : '') + 'value="' + esc(value || '') + '" style="margin-bottom:12px"><div class="row"><button class="btn ghost" data-r="0">취소</button><button class="btn" data-r="1">확인</button></div></div>';
      var inp = d.querySelector('#dlg-in');
      var done = function (ok) { var v = inp.value; d.remove(); res(ok ? v : null); };
      d.addEventListener('click', function (e) { var b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === d) done(false); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(true); });
      document.body.appendChild(d); setTimeout(function () { inp.focus(); inp.select(); }, 30);
    });
  };

  UI.sheet = function (html, opts) {
    var layer = $('#layer');
    layer.innerHTML = '<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div></div>';
    UI.sheetOpts = opts || {};
    return layer.querySelector('.sheet');
  };
  UI.closeSheet = function () {
    var layer = $('#layer'); if (!layer || !layer.innerHTML) return;
    layer.innerHTML = '';
    var cb = UI.sheetOpts && UI.sheetOpts.onClose; UI.sheetOpts = null; if (cb) cb();
  };
  UI.sheetEl = function () { return document.querySelector('#layer .sheet'); };
  UI.actions.scrim = function (el, e) { if (e.target === el) UI.closeSheet(); };
  UI.actions.close = function () { UI.closeSheet(); };

  /* ───── 헤더 / 탭 ───── */
  UI.renderTop = function () {
    var S = UI.S, p = U.parse(S.month + '-01'), st = Sy.status();
    var pill, label;
    if (!st.configured) { pill = ''; label = '연결 안 됨'; }
    else if (st.state === 'syncing') { pill = 'sync'; label = '동기화 중'; }
    else if (st.state === 'error') { pill = 'err'; label = '동기화 오류'; }
    else if (st.state === 'offline') { pill = 'wait'; label = '오프라인'; }
    else if (st.pending > 0) { pill = 'wait'; label = '대기 ' + st.pending + '건'; }
    else { pill = 'ok'; label = UI.relTime(st.last); }
    $('#top').innerHTML =
      '<button class="icon-btn" data-act="lock" aria-label="화면 잠금">' + UI.icon('lock') + '</button>' +
      '<div class="month"><button class="icon-btn" data-act="month" data-d="-1" aria-label="이전 달">' + UI.icon('left') + '</button>' +
      '<b class="num" data-act="month-today" title="이번 달로">' + p.y + '년 ' + p.m + '월</b>' +
      '<button class="icon-btn" data-act="month" data-d="1" aria-label="다음 달">' + UI.icon('right') + '</button></div>' +
      '<button class="pill ' + pill + '" data-act="sync" aria-label="동기화"><i></i>' + esc(label) + '</button>';
  };

  var TABS = [['home', '홈', 'home'], ['entries', '내역', 'list'], ['analysis', '분석', 'chart'], ['settings', '설정', 'gear']];
  UI.renderTabs = function () {
    $('#tabs').innerHTML = TABS.map(function (t) {
      return '<button class="' + (UI.S.tab === t[0] ? 'on' : '') + '" data-act="tab" data-tab="' + t[0] + '">' + UI.icon(t[2]) + '<span>' + t[1] + '</span></button>';
    }).join('');
    $('#fab').hidden = UI.S.tab === 'settings';
  };

  var scrollPos = {}, rendering = false, pending = false;
  UI.render = function () {
    if (!$('#view') || $('#app').hidden) return;
    var S = UI.S, view = $('#view'), v = UI.views[S.tab];
    scrollPos[S.tab] = view.scrollTop;
    var ae = document.activeElement, focusId = ae && ae.id && view.contains(ae) ? ae.id : null, selStart = focusId && ae.selectionStart;
    UI.renderTop(); UI.renderTabs();
    view.innerHTML = v ? v.render() : '';
    view.scrollTop = scrollPos[S.tab] || 0;
    if (focusId) { var el = document.getElementById(focusId); if (el) { el.focus(); try { el.setSelectionRange(selStart, selStart); } catch (e) { /* 무시 */ } } }
    if (v && v.after) v.after();
  };
  UI.scheduleRender = function () {
    if (pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; try { UI.render(); } catch (e) { console.error(e); } });
  };
  UI.setTab = function (t) { UI.S.tab = t; var view = $('#view'); UI.render(); view.scrollTop = scrollPos[t] || 0; };

  /* ───── 공통 동작 ───── */
  UI.actions.tab = function (el) { UI.setTab(el.dataset.tab); };
  UI.actions.month = function (el) { UI.S.month = U.shiftMonth(UI.S.month, +el.dataset.d); UI.render(); $('#view').scrollTop = 0; };
  UI.actions['month-today'] = function () { UI.S.month = U.today().slice(0, 7); UI.render(); };
  UI.actions.lock = function () { AB.lock && AB.lock.lockNow(); };
  UI.actions.sync = function () {
    if (!Sy.configured()) { UI.setTab('settings'); UI.toast('먼저 시트 연결 정보를 입력해 주세요'); return; }
    UI.runSync({ manual: true });
  };
  UI.actions.edit = function (el) { AB.ui.openEdit(el.dataset.id); };
  UI.actions.add = function () { AB.ui.openAdd(); };
  UI.actions.go = function (el) { if (el.dataset.ana) UI.S.ana = el.dataset.ana; UI.setTab(el.dataset.tab); };

  UI.runSync = async function (opts) {
    opts = opts || {};
    var r = await Sy.syncNow(opts);
    if (r.ok) {
      if (opts.manual || opts.full) UI.toast('동기화 완료' + (r.conflicts ? ' · 충돌 ' + r.conflicts + '건(설정에서 확인)' : ''), { kind: 'ok' });
      else if (r.conflicts) UI.toast('다른 곳에서 먼저 바뀐 내역 ' + r.conflicts + '건이 있어요. 설정 > 동기화에서 확인하세요.');
    } else if (r.reason === 'shrink') {
      var yes = await UI.confirm('시트(서버)에는 ' + r.server + '건인데 이 기기에는 ' + r.local + '건이 있어요.\n서버 기준으로 바꾸면 이 기기에만 있던 내역이 사라질 수 있어요.\n정말 바꿀까요?', { danger: true, ok: '서버 기준으로 바꾸기' });
      if (yes) return UI.runSync({ full: true, force: true });
    } else if (r.reason === 'error') UI.toast(r.error, { kind: 'err', ms: 5000 });
    else if (r.reason === 'offline') UI.toast('오프라인이에요. 연결되면 자동으로 동기화됩니다.');
    return r;
  };

  /* ───── 시작 ───── */
  function guard(fn, el, e) {
    try { var r = fn(el, e); if (r && r.catch) r.catch(function (err) { console.error(err); UI.toast('오류: ' + (err && err.message || err), { kind: 'err' }); }); }
    catch (err) { console.error(err); UI.toast('오류: ' + (err && err.message || err), { kind: 'err' }); }
  }
  UI.init = function () {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]'); if (!el) return;
      var f = UI.actions[el.dataset.act]; if (f) guard(f, el, e);
    });
    document.addEventListener('input', function (e) { var el = e.target.closest('[data-in]'); if (el && UI.inputs[el.dataset.in]) guard(UI.inputs[el.dataset.in], el, e); });
    document.addEventListener('change', function (e) { var el = e.target.closest('[data-ch]'); if (el && UI.changes[el.dataset.ch]) guard(UI.changes[el.dataset.ch], el, e); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') UI.closeSheet(); });
    St.on(UI.scheduleRender);
    Sy.onStatus(function () { if (!$('#app').hidden) UI.renderTop(); });
    setInterval(function () { if (!$('#app').hidden && document.visibilityState === 'visible') UI.renderTop(); }, 30000); // '3분 전' 같은 표시 갱신
  };

})(typeof window !== 'undefined' ? window : globalThis);
