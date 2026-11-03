/* 내 하루장 — 새 화면 골격: 위 막대(설정·달·최근 변경·동기화), 아래 탭(오늘·내역·＋·자산·분석),
 *  자산 화면, 최근 변경 3건 시트, 눌림·물결 반응, 한 줄 원칙(넘치는 글자만 줄임). */
(function (root) {
  'use strict';
  var AB = root.AB, U = AB.util, C = AB.calc, St = AB.store, Sy = AB.sync, UI = AB.ui, H = AB.history;
  var esc = U.esc, $ = UI.$;

  /* ───── 아이콘 한 벌 (선 아이콘) ───── */
  var P = {
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14.5h2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    history: '<path d="M3 12a9 9 0 103-6.7"/><path d="M3 4v4h4M12 7v5l3 2"/>',
    redo: '<path d="M21 12a9 9 0 11-3-6.7"/><path d="M21 4v4h-4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    bank: '<path d="M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6 15h4"/>',
    cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
    chev: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7"/>', bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>',
    sync: '<path d="M20 12a8 8 0 01-14 5.3M4 12A8 8 0 0118 6.7"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>', jar: '<path d="M7 4h10M8 4v3c-2 1-3 3-3 5v6a2 2 0 002 2h10a2 2 0 002-2v-6c0-2-1-4-3-5V4"/><path d="M9 14h6"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8"/>'
  };
  UI.ic = function (n, w) { return '<svg class="ic2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || '') + '</svg>'; };
  var CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">' + P.chev + '</svg>';
  UI.CHEV = CHEV;
  var AV = 'assets/photo.jpg';

  /* 금액 가리기 */
  UI.hidden = function () { try { return localStorage.getItem('ab.hide') === '1'; } catch (e) { return false; } };
  UI.actions['hide-amt'] = function () { var on = !UI.hidden(); try { localStorage.setItem('ab.hide', on ? '1' : '0'); } catch (e) { /* 무시 */ } document.documentElement.classList.toggle('priv', on); if (UI.S.tab === 'settings') UI.render(); UI.toast(on ? '금액을 가렸어요 · 다시 누르면 보여요' : '금액을 보여요'); };

  /* ───── 위 막대 ───── */
  UI.renderTop = function () {
    var S = UI.S, p = U.parse(S.month + '-01'), st = Sy.status(), cls = '', label = '';
    if (!st.configured) { cls = ''; label = '연결 안 됨'; }
    else if (st.state === 'syncing') { cls = 'sync'; label = '동기화 중'; }
    else if (st.state === 'error') { cls = 'err'; label = '오류'; }
    else if (st.state === 'offline') { cls = 'wait'; label = '오프라인'; }
    else if (st.pending > 0) { cls = 'wait'; label = '대기 ' + st.pending; }
    else { cls = 'ok'; label = UI.relTime(st.last); }
    var n = H.activeCount();
    $('#top').innerHTML =
      '<span class="topsp" aria-hidden="true"></span>' +
      '<div class="month"><button class="icon-btn" data-act="month" data-d="-1" aria-label="이전 달">' + UI.ic('left', 2.2) + '</button>' +
      '<b class="num" data-act="month-today" title="이번 달로">' + p.y + '년 ' + p.m + '월</b>' +
      '<button class="icon-btn" data-act="month" data-d="1" aria-label="다음 달">' + UI.ic('right', 2.2) + '</button></div>' +
      '<button class="cbtn" data-act="hist" aria-label="최근 변경 ' + n + '건">' + UI.ic('history') + (n ? '<span class="bd num">' + n + '</span>' : '') + '</button>' +
      '<button class="cbtn sdot ' + cls + '" data-act="sync" aria-label="동기화 · ' + esc(label) + '">' + UI.ic('sync') + '</button>' +
      '<button class="cbtn' + (UI.S.tab === 'settings' ? ' on' : '') + '" data-act="tab" data-tab="settings" aria-label="설정">' + UI.ic('more', 2.6) + '</button>';
  };

  /* ───── 아래 탭 (가운데 ＋) ───── */
  var TABS = [['home', '오늘', 'home'], ['entries', '내역', 'list'], ['+'], ['asset', '자산', 'wallet'], ['analysis', '분석', 'chart']];
  UI.renderTabs = function () {
    $('#tabs').innerHTML = TABS.map(function (t) {
      if (t[0] === '+') return '<button class="plus" data-act="add" aria-label="새로 입력">' + UI.ic('plus', 2.6) + '</button>';
      return '<button class="' + (UI.S.tab === t[0] ? 'on' : '') + '" data-act="tab" data-tab="' + t[0] + '">' + UI.ic(t[2], UI.S.tab === t[0] ? 2.3 : 1.9) + '<span>' + t[1] + '</span></button>';
    }).join('');
    var fab = $('#fab'); if (fab) fab.hidden = true;
  };

  /* ───── 계정 한 줄 ───── */
  function kindIc(k) { return k === 'card' ? 'card' : (k === 'cash' ? 'cash' : 'bank'); }
  var COLS = { bank: 'var(--blue)', card: 'var(--expense)', cash: 'var(--ink3)', saving: 'var(--income)', invest: 'var(--warn)' };
  UI.accRow = function (a, eff, d, flow) {
    var k = (eff.accounts.filter(function (x) { return x.name === a.name; })[0] || {}).kind || C.guessKind(a.name);
    var card = d.cards.filter(function (c) { return c.name === a.name; })[0], st = '';
    if (k === 'card' && a.balance < 0 && !UI.cardShort()) st = '<span class="pill pl-w">' + (card && card.due ? +card.due.slice(8) + '일 결제' : '결제 예정') + '</span>';
    else if (a.short < 0) st = '<span class="pill pl-e">부족 ' + U.num(-a.short) + '</span>';
    return '<button class="arow" data-act="acc-open" data-n="' + esc(a.name) + '"><span class="dot" style="background:' + (COLS[k] || 'var(--blue)') + '">' + UI.ic(kindIc(k), 2) + '</span>' +
      '<div class="grow"><div class="t1">' + esc(a.name) + '</div>' +
      (flow ? '<div class="t2 num"><span>이월 <span class="m">' + U.num(a.open) + '</span></span> <span class="inc">+<span class="m">' + U.num(a.in) + '</span></span> <span class="exp">−<span class="m">' + U.num(a.out) + '</span></span></div>' : (st ? '<div>' + st + '</div>' : '')) +
      '</div><b class="num m ' + (a.balance < 0 ? 'exp' : '') + '">' + U.num(a.balance) + '</b>' + CHEV + '</button>';
  };

  /* ───── 자산 화면 ───── */
  UI.S.assetFlow = false;
  UI.views.asset = {
    render: function () {
      var d = UI.derive(), t = d.acct.total, list = d.acct.list.filter(function (a) { return a.open || a.in || a.out || a.balance || a.need; });
      var p = U.parse(d.range.start), q = U.parse(d.asOf);
      var h = '<div class="card"><div class="row between"><span class="k">순자산 · ' + p.m + '월 ' + p.d + '일 ~ ' + q.m + '월 ' + q.d + '일</span><button class="cbtn sm" data-act="hide-amt" aria-label="금액 가리기">' + UI.ic('eye') + '</button></div>' +
        '<div class="big num"><span class="m countup" data-to="' + Math.round(t.balance) + '">' + U.num(t.balance) + '</span><small>원</small></div>' +
        '<div class="row" style="gap:14px;margin-top:4px"><span class="iorow inc">' + UI.ic('up', 2.3) + '<span class="k">입금</span><b class="num m">' + U.num(t.in) + '</b></span><span class="iorow exp">' + UI.ic('down', 2.3) + '<span class="k">출금</span><b class="num m">' + U.num(t.out) + '</b></span></div></div>';
      h += '<div class="seg2" style="margin-bottom:10px"><button class="' + (UI.S.assetFlow ? '' : 'on') + '" data-act="asset-view" data-v="0">잔액</button><button class="' + (UI.S.assetFlow ? 'on' : '') + '" data-act="asset-view" data-v="1">이월 · 입출금</button></div>';
      h += '<div class="card alist">' + (list.length ? list.map(function (a) { return UI.accRow(a, d.eff, d, UI.S.assetFlow); }).join('') : '<div class="empty" style="padding:18px"><b>아직 계정이 없어요</b></div>') + '</div>';
      h += '<div class="grp"><div class="r"><span class="st" style="background:var(--warn)">' + UI.ic('card', 2) + '</span><span class="t">자금 부족에 카드 포함</span><button class="sw" data-act="card-short" role="switch" aria-checked="' + UI.cardShort() + '" aria-label="자금 부족에 카드 포함"><i></i></button></div></div>';
      var f = d.funding;
      if (!d.isPast) {
        h += '<div class="card row" style="gap:12px"><span class="st" style="background:' + (f.deficits.length ? 'var(--expense)' : 'var(--income)') + '">' + UI.ic(f.deficits.length ? 'bell' : 'check', 2.2) + '</span><div class="grow"><b class="t1">' +
          (f.deficits.length ? f.deficits.length + '곳 부족 · ' + U.won(f.deficitTotal) : '부족한 통장 없음') + '</b><div class="t2">' +
          (f.transfers.length ? esc(f.transfers[0].from) + ' → ' + esc(f.transfers[0].to) + ' ' + U.num(f.transfers[0].amount) + (f.transfers.length > 1 ? ' 외 ' + (f.transfers.length - 1) + '건' : '') : (d.cards.filter(function (c) { return c.owed > 0; }).length ? '카드 결제 예정 ' + d.cards.filter(function (c) { return c.owed > 0; }).length + '건 · 결제계좌 잔액 확인' : '남은 예정 지출을 모두 낼 수 있어요')) +
          '</div></div>' + (f.deficits.length ? '<button class="btn sm soft" data-act="tab" data-tab="home">이체</button>' : '') + '</div>';
      }
      return h;
    },
    after: function () { UI.countUps(); }
  };
  UI.actions['asset-view'] = function (el) { UI.S.assetFlow = el.dataset.v === '1'; UI.render(); };
  UI.actions['card-short'] = function () { var on = !UI.cardShort(); UI.setCardShort(on); UI.toast(on ? '카드 마이너스도 자금 부족에 넣어요' : '카드는 결제 예정으로만 보여요', { action: { label: '되돌리기', fn: function () { UI.setCardShort(!on); } } }); };
  UI.actions['acc-open'] = function (el) {
    var d = UI.derive(), a = d.acct.byName[el.dataset.n]; if (!a) return;
    var rows = C.sortRows(d.rows.filter(function (r) { return r.type !== 'budget' && (r.from === a.name || r.to === a.name) && r.date >= d.range.start && r.date <= d.range.end; })).slice(0, 60);
    UI.sheet('<div class="sh"><b>' + esc(a.name) + '</b><button class="cbtn sm" data-act="close" aria-label="닫기">' + UI.ic('x', 2.2) + '</button></div>' +
      '<div class="card"><div class="k">잔액</div><div class="big num ' + (a.balance < 0 ? 'exp' : '') + '"><span class="m">' + U.num(a.balance) + '</span><small>원</small></div></div>' +
      '<div class="grp">' + [['history', 'var(--ink3)', '이월', a.open], ['up', 'var(--income)', '입금', a.in], ['down', 'var(--expense)', '출금', -a.out], ['sparkle', 'var(--warn)', '월말까지 더 나갈 돈', -a.need]].map(function (r) {
        return '<div class="r"><span class="st" style="background:' + r[1] + '">' + UI.ic(r[0], 2.2) + '</span><span class="t">' + r[2] + '</span><span class="v num m">' + U.num(r[3]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="sec">이 달 입출금 ' + rows.length + '건</div><div class="card">' + (rows.length ? rows.map(function (r) { return UI.row(r, d.today); }).join('') : '<div class="empty" style="padding:14px">내역이 없어요</div>') + '</div>');
  };

  /* ───── 최근 변경 3건 ───── */
  function histRows() {
    var L = H.list(), col = { '저장': 'var(--income)', '수정': 'var(--blue)', '삭제': 'var(--expense)' };
    if (!L.length) return '<div class="empty" style="padding:18px"><b>아직 변경이 없어요</b>저장·수정·삭제하면 여기에 최근 3건이 남아요.</div>';
    return L.map(function (x) {
      return '<div class="r' + (x.undone ? ' done' : '') + '"><span class="st" style="background:' + col[x.op] + '">' + UI.ic(x.op === '삭제' ? 'x' : x.op === '수정' ? 'swap' : 'plus', 2.2) + '</span>' +
        '<div class="grow"><div class="t1">' + x.op + ' · ' + esc(x.title) + '</div><div class="t2">' + esc(x.sub) + ' · ' + UI.relTime(x.at) + (x.undone ? ' · 되돌림' : '') + '</div></div>' +
        '<button class="btn sm soft" data-act="hist-toggle" data-id="' + esc(x.id) + '">' + (x.undone ? UI.ic('redo', 2.2) + '다시' : UI.ic('history', 2.2) + '되돌리기') + '</button></div>';
    }).join('');
  }
  UI.actions.hist = function () {
    UI.sheet('<div class="sh"><b>최근 변경</b><button class="cbtn sm" data-act="close" aria-label="닫기">' + UI.ic('x', 2.2) + '</button></div>' +
      '<p class="hint one" style="margin:-4px 0 10px">최근 3건까지 되돌리고, 다시 하기로 살려요</p>' +
      '<div class="grp hist" id="hist-list">' + histRows() + '</div>' +
      (H.list().some(function (x) { return !x.undone; }) ? '<button class="btn ghost" style="width:100%" data-act="hist-all">남은 변경 모두 되돌리기</button>' : ''));
  };
  function refreshHist() { var el = $('#hist-list'); if (el) el.innerHTML = histRows(); UI.renderTop(); }
  UI.actions['hist-toggle'] = async function (el) {
    var e = await H.toggle(el.dataset.id); if (!e) return; refreshHist();
    UI.toast((e.undone ? '되돌렸어요 · ' : '다시 했어요 · ') + e.title, { action: { label: e.undone ? '다시 하기' : '되돌리기', fn: function () { H.toggle(e.id).then(refreshHist); } } });
  };
  UI.actions['hist-all'] = async function () { await H.undoAll(); refreshHist(); UI.toast('최근 변경을 모두 되돌렸어요'); };
  H.on(function () { if (!$('#app').hidden) UI.renderTop(); });

  /* ───── 숫자 세어 올라가기 ───── */
  UI.countUps = function () {
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('#view .countup').forEach(function (el) {
      var to = +el.dataset.to, st = null; if (!isFinite(to) || el.dataset.done) return; el.dataset.done = '1';
      function f(t) { if (!st) st = t; var k = Math.min(1, (t - st) / 700); el.textContent = U.num(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); else { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); fitAll(); } }
      requestAnimationFrame(f);
    });
  };

  /* ───── 눌림 + 물결 ───── */
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest('button, .li[data-act], .arow'); if (!b) return;
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, x = document.createElement('i');
    x.className = 'rip'; x.style.width = x.style.height = s + 'px'; x.style.left = (e.clientX - r.left - s / 2) + 'px'; x.style.top = (e.clientY - r.top - s / 2) + 'px';
    if (b.closest('.chips.scroll')) return; // 가로 칩 줄은 물결 없이 눌림만
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.classList.add('rip-host'); b.appendChild(x); setTimeout(function () { x.remove(); }, 520);
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (err) { /* 무시 */ }
  }, { passive: true });

  /* ───── 한 줄 원칙: 넘치는 글자만 줄임 (최소 62%) ───── */
  var FIT = '.t1,.t2,.k,.big,.pill,.chip,.btn,.sh b,.sec,.mini3 .v,.arow b,.grp .t,.grp .v,.top .month b,.qk span,.hint.one,#toast span';
  function fitAll(rootEl) {
    (rootEl || document).querySelectorAll(FIT).forEach(function (el) {
      if (el.closest('.chips.scroll') || el.closest('.cal')) return; // 가로로 밀리는 칩 줄·달력 칸은 건드리지 않음
      el.style.fontSize = ''; var w = el.clientWidth; if (!w) return; var sw = el.scrollWidth; if (sw <= w + 1) return;
      el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * Math.max(0.62, w / sw)) + 'px';
    });
  }
  UI.fitAll = fitAll;
  var fq = 0;
  function watch() {
    // 물결(.rip)이 붙고 떨어지는 것은 무시: 누르는 순간 글자 크기가 다시 계산되면 칩이 밀려 옆 칩이 눌림
    var onlyRip = function (m) { var n = [].concat([].slice.call(m.addedNodes), [].slice.call(m.removedNodes)); return n.length && n.every(function (x) { return x.nodeType === 1 && x.classList && x.classList.contains('rip'); }); };
    var mo = new MutationObserver(function (list) { if (list.every(onlyRip)) return; cancelAnimationFrame(fq); fq = requestAnimationFrame(function () { fitAll(); }); });
    ['#view', '#layer', '#top', '#toast'].forEach(function (s) { var el = $(s); if (el) mo.observe(el, { childList: true, subtree: true }); });
    root.addEventListener('resize', function () { fitAll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  document.documentElement.classList.toggle('priv', UI.hidden());

})(typeof window !== 'undefined' ? window : globalThis);
