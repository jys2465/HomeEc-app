/* 내 하루장 4.0 — 위 막대(큰 제목 + ⋯), 하단 탭(하루·내역·＋·분석·자산), 큰 달 바꾸기,
 *  '하루' 탭: 월요일 시작 주간 띠 ↔ 한 달 달력, 이번 달 남은 예산(계산식 보기), 시간대별 일정·내역·노트 타임라인 */
(function (root) {
  'use strict';
  var AB = root.AB, U = AB.util, C = AB.calc, St = AB.store, Sy = AB.sync, UI = AB.ui, X = AB.side, H = AB.history;
  var esc = U.esc, $ = UI.$, S = UI.S;
  var WD = ['월', '화', '수', '목', '금', '토', '일'];
  var P3 = { day: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>' };
  var ic0 = UI.ic; UI.ic = function (n, w) { return P3[n] ? '<svg class="ic2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P3[n] + '</svg>' : ic0(n, w); };
  function wd(ds) { return (U.weekday(ds) + 6) % 7; } // 월=0 … 일=6
  function md(ds) { var p = U.parse(ds); return p.m + '월 ' + p.d + '일'; }
  S.daySel = S.daySel || U.today(); S.dayMonth = false; S.dayFilt = '전체'; S.dayPicked = '';
  var lastToday = U.today();
  function rollDay() { var t = U.today(); if (t !== lastToday) { if (S.daySel === lastToday) { S.daySel = t; if (S.month === lastToday.slice(0, 7)) S.month = t.slice(0, 7); } lastToday = t; if (!$('#app').hidden) UI.render(); } }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') rollDay(); });
  setInterval(rollDay, 60000); // 자정이 지나면 '오늘'을 새 날로

  /* ───── 위 막대: 큰 제목 + ⋯ 하나 ───── */
  var TITLE = { entries: '내역', analysis: '분석', asset: '자산', settings: '설정', jar: '저금통', note: '노트', cal: '달력' };
  UI.renderTop = function () {
    var t = S.tab, title, sub = '';
    if (t === 'home') { var td = U.today(); title = S.daySel === td ? '오늘' : md(S.daySel); sub = (S.daySel === td ? md(td) + ' ' : '') + WD[wd(S.daySel)] + '요일'; }
    else { title = TITLE[t] || ''; sub = t === 'settings' ? '내 하루장 v' + (AB.VERSION || '') : ''; }
    var st = Sy.status(), warn = St.conflicts().length || st.state === 'error' || st.pending > 0 || (X && X.pending() > 0);
    $('#top').innerHTML = '<div class="tt grow"><div class="tsub">' + esc(sub) + '</div><h1 class="ttl">' + esc(title) + '</h1></div>' +
      (t === 'settings' ? '<button class="cbtn" data-act="tab" data-tab="home" aria-label="닫기">' + UI.ic('x', 2.4) + '</button>' :
      '<button class="cbtn" data-act="lock-now" aria-label="잠그기 (로그아웃)">' + UI.ic('lock', 2.2) + '</button><button class="cbtn mbtn" data-act="more" aria-label="더보기 · 설정 · 최근 변경 · 동기화">' + UI.ic('more', 2.6) + (warn ? '<span class="wdot"></span>' : '') + '</button>');
  };

  /* ───── ⋯ 더보기 ───── */
  UI.actions.more = function () {
    var st = Sy.status(), n = H.activeCount(), conf = St.conflicts().length;
    var syncV = !st.configured ? '연결 안 됨' : st.state === 'syncing' ? '동기화 중' : st.state === 'error' ? '오류' : st.state === 'offline' ? '오프라인' : (st.pending ? '대기 ' + st.pending + '건 · ' : '') + UI.relTime(st.last);
    var rows = [['settings', 'gear', 'var(--ink2)', '설정', '글씨 · 화면 · 잠금 · 계정'], ['hist', 'history', 'var(--blue)', '최근 변경', n + '건 · 되돌리기'], ['sync', 'sync', 'var(--brand)', '시트 동기화', syncV + (conf ? ' · 충돌 ' + conf : '')], ['link', 'link', '#4285F4', '연동', '구글 캘린더 · Tasks'], ['note', 'note', 'var(--note)', '노트 모두', X.list('notes').length + '편 · 찾기 · 1년 전 오늘'], ['jar', 'jar', 'var(--warn)', '저금통', X.list('goals').length + '개 목표']];
    UI.sheet('<div class="sh"><b>더보기</b><button class="cbtn sm" data-act="close" aria-label="닫기">' + UI.ic('x', 2.2) + '</button></div><div class="grp">' +
      rows.map(function (r) { return '<button class="r" data-act="more-go" data-v="' + r[0] + '"><span class="st" style="background:' + r[2] + '">' + UI.ic(r[1], 2) + '</span><span class="t">' + r[3] + '</span><span class="v">' + esc(r[4]) + '</span>' + UI.CHEV + '</button>'; }).join('') +
      '</div><p class="hint center faint one">내 하루장 v' + (AB.VERSION || '') + ' · <button class="link" data-act="sw-check">업데이트 확인</button></p>');
  };
  UI.actions['more-go'] = function (el) {
    var v = el.dataset.v; UI.closeSheet();
    if (v === 'settings' || v === 'jar' || v === 'note') UI.setTab(v);
    else if (v === 'hist') UI.actions.hist();
    else if (v === 'sync') UI.actions.sync();
    else if (v === 'link') UI.actions.link ? UI.actions.link() : UI.toast('연동은 곧 열려요');
  };

  /* ───── 연동: 구글 기본 캘린더 · 구글 Tasks ───── */
  function flag(k, v) { try { if (v === undefined) return localStorage.getItem(k) === '1'; localStorage.setItem(k, v ? '1' : '0'); } catch (e) { return false; } }
  function linkHtml() {
    var e = X.lastErrs || {}, err = function (m) { return /권한|permission|authoriz|허용|Exception: You do not have/i.test(m) ? '시트에서 연동 허용이 필요해요 (아래 안내)' : m; };
    return '<div class="sh"><b>연동</b><button class="cbtn sm" data-act="close" aria-label="닫기">' + UI.ic('x', 2.2) + '</button></div><div class="grp">' +
      '<div class="r"><span class="st" style="background:#4285F4">' + UI.ic('cal', 2) + '</span><div class="grow"><div class="t1">구글 캘린더 (기본 캘린더)</div><div class="t2">' + (e.gcal ? '<span class="exp">' + esc(err(e.gcal)) + '</span>' : '일정을 양쪽으로 주고받기') + '</div></div><button class="sw" data-act="link-sw" data-k="ab.gcal" role="switch" aria-checked="' + flag('ab.gcal') + '" aria-label="구글 캘린더"><i></i></button></div>' +
      '<div class="r"><span class="st" style="background:#1E88E5">' + UI.ic('check', 2.2) + '</span><div class="grow"><div class="t1">구글 Tasks (할 일)</div><div class="t2">' + (e.tasks ? '<span class="exp">' + esc(err(e.tasks)) + '</span>' : '노트의 ☐ 줄 → \'내 하루장\' 할 일 목록') + '</div></div><button class="sw" data-act="link-sw" data-k="ab.tasks" role="switch" aria-checked="' + flag('ab.tasks') + '" aria-label="구글 Tasks"><i></i></button></div>' +
      '<div class="r"><span class="st" style="background:#F6B400">' + UI.ic('note', 2) + '</span><div class="grow"><div class="t1">구글 Keep</div><div class="t2">일반 계정은 연동 통로가 없어요</div></div><span class="v">불가</span></div></div>' +
      '<div class="grp"><button class="r" data-act="link-now"><span class="st" style="background:var(--brand)">' + UI.ic('sync', 2) + '</span><span class="t">지금 맞추기</span><span class="v">' + (X.lastSync ? UI.relTime(X.lastSync) : '아직') + '</span></button></div>' +
      '<div class="card"><b class="t1">처음 켤 때 한 번만</b><p class="hint" style="white-space:normal;margin:4px 0 0">구글 시트 › 메뉴 <b>가계부 v2 › 구글 캘린더 · Tasks 연동 허용</b>을 눌러 권한을 허용하고, Apps Script <b>배포 › 새 버전</b>으로 다시 배포해 주세요. 캘린더에서 들여온 일정은 파란색으로 보여요.</p></div>';
  }
  UI.actions.link = function () { UI.sheet(linkHtml()); };
  UI.actions['link-sw'] = function (el) { var on = !flag(el.dataset.k); flag(el.dataset.k, on); el.setAttribute('aria-checked', on); if (on) { UI.toast('켰어요 · 맞추는 중…'); UI.actions['link-now'](); } };
  UI.actions['link-now'] = async function () {
    if (!Sy.configured()) return UI.toast('먼저 시트를 연결해 주세요 (설정 › 고급)');
    var r = await X.sync(); var sh = UI.sheetEl(); if (sh && sh.querySelector('[data-act="link-now"]')) sh.innerHTML = '<div class="grab"></div>' + linkHtml();
    var e = X.lastErrs || {};
    if (r && r.ok && !e.gcal && !e.tasks) UI.toast('캘린더 · 할 일을 맞췄어요', { kind: 'ok' }); else if (e.gcal || e.tasks) UI.toast('연동 허용이 필요해요 · 안내를 확인하세요', { kind: 'err' }); else UI.toast('지금은 맞출 수 없어요 (오프라인?)');
    UI.scheduleRender();
  };

  /* ───── 하단 탭: 하루 · 내역 · ＋ · 분석 · 자산 ───── */
  var TABS = [['home', '하루', 'day'], ['entries', '내역', 'list'], ['+'], ['analysis', '분석', 'chart'], ['asset', '자산', 'wallet']];
  UI.renderTabs = function () {
    var cur = { cal: 'home', note: 'home', jar: 'asset', settings: '' }[S.tab]; if (cur === undefined) cur = S.tab;
    $('#tabs').innerHTML = TABS.map(function (t) {
      if (t[0] === '+') return '<button class="plus" data-act="add" aria-label="새로 쓰기">' + UI.ic('plus', 2.6) + '</button>';
      return '<button class="' + (cur === t[0] ? 'on' : '') + '" data-act="tab" data-tab="' + t[0] + '">' + UI.ic(t[2], cur === t[0] ? 2.3 : 1.9) + '<span>' + t[1] + '</span></button>';
    }).join('');
    var fab = $('#fab'); if (fab) fab.hidden = true;
  };

  /* ───── 큰 달 바꾸기 (내역 · 분석 · 자산) ───── */
  function monBar() { var p = U.parse(S.month + '-01'), cur = S.month === U.today().slice(0, 7); return '<div class="monbar"><button data-act="month" data-d="-1" aria-label="이전 달">' + UI.ic('left', 2.6) + '</button><button class="mt" data-act="month-today" aria-label="이번 달로"><b class="num">' + p.y + '년 ' + p.m + '월</b>' + (cur ? '' : '<span>이번 달로</span>') + '</button><button data-act="month" data-d="1" aria-label="다음 달">' + UI.ic('right', 2.6) + '</button></div>'; }
  ['entries', 'analysis', 'asset'].forEach(function (k) { var v = UI.views[k]; if (!v) return; var r = v.render; v.render = function () { return monBar() + r.apply(this, arguments); }; });

  /* 자산 아래에 저금통 */
  (function () { var v = UI.views.asset, r = v.render; v.render = function () {
    var gs = X.list('goals'), h = r.apply(this, arguments);
    h += '<div class="sec row between"><span>저금통</span><button class="link" data-act="tab" data-tab="jar">' + (gs.length ? '모두 ›' : '＋ 목표') + '</button></div>';
    if (!gs.length) return h + '<button class="card row" data-act="g-new" style="width:100%;text-align:left;gap:12px"><span class="st" style="background:var(--warn)">' + UI.ic('jar', 2) + '</span><div class="grow"><b class="t1">모을 목표 만들기</b><div class="t2">예: 가족여행 300만 원</div></div></button>';
    return h + '<div class="grp">' + gs.slice(0, 3).map(function (g) { var sv = +g.saved || 0, r2 = g.target ? Math.min(1, sv / g.target) : 0; return '<button class="r" data-act="tab" data-tab="jar"><span class="st" style="background:var(--warn)">' + UI.ic('jar', 2) + '</span><div class="grow"><div class="t1">' + esc(g.name) + '</div><div class="t2 num">' + U.num(sv) + ' / ' + U.num(g.target) + '원 · ' + Math.round(r2 * 100) + '%</div></div>' + UI.CHEV + '</button>'; }).join('') + '</div>';
  }; })();

  /* ───── 하루 탭 ───── */
  function dayExp(rows, ds) { var s = 0; rows.forEach(function (r) { if (r.date === ds && r.type === 'expense') s += r.amount || 0; }); return s; }
  function weekStrip(d) {
    var start = U.addDays(S.daySel, -wd(S.daySel)), h = '<div class="card week" id="wk">';
    var evs = X.eventsIn(start, U.addDays(start, 6)), notes = {}; X.list('notes').forEach(function (n) { notes[n.date] = 1; });
    for (var i = 0; i < 7; i++) {
      var ds = U.addDays(start, i), p = U.parse(ds), hn = U.holidayName(ds);
      var hasEv = evs.some(function (e) { return e.date === ds; }), hasTx = d.rows.some(function (r) { return r.date === ds && r.type !== 'budget' && r.amount; });
      h += '<button data-act="day-pick" data-d="' + ds + '" class="' + (ds === S.daySel ? 'sel ' : '') + (ds === d.today ? 'today ' : '') + ((i === 6 || hn) ? 'sun' : i === 5 ? 'sat' : '') + '" aria-label="' + md(ds) + ' ' + WD[i] + '요일' + (hn ? ' ' + hn : '') + '"><span class="w">' + WD[i] + '</span><span class="dd num">' + p.d + '</span><span class="dots">' +
        (hasEv ? '<i style="background:var(--plan)"></i>' : '') + (hasTx ? '<i style="background:var(--expense)"></i>' : '') + (notes[ds] ? '<i style="background:var(--note)"></i>' : '') + '</span></button>';
    }
    return h + '<div class="wfoot"><button data-act="day-month">' + UI.ic('cal', 1.9) + ' 한 달 보기</button>' + (S.daySel !== d.today ? '<button data-act="day-today">오늘로</button>' : '') + '</div></div>';
  }
  function monthGrid(d) {
    var ym = S.daySel.slice(0, 7), r = U.monthRange(ym), p = U.parse(r.start), first = wd(r.start), dn = U.daysInMonth(p.y, p.m);
    var evs = X.eventsIn(r.start, r.end), byEv = {}, notes = {};
    evs.forEach(function (e) { (byEv[e.date] = byEv[e.date] || []).push(e); });
    X.list('notes').forEach(function (n) { notes[n.date] = 1; });
    var h = '<div class="card mcal" id="mcal"><div class="mhd"><button class="cbtn sm" data-act="dm-shift" data-d="-1" aria-label="이전 달">' + UI.ic('left', 2.4) + '</button><b class="num">' + p.y + '년 ' + p.m + '월</b><button class="cbtn sm" data-act="dm-shift" data-d="1" aria-label="다음 달">' + UI.ic('right', 2.4) + '</button><button class="btn sm soft" data-act="day-month">주간으로</button></div><div class="mg">' +
      WD.map(function (w, i) { return '<div class="h ' + (i === 5 ? 'sat' : i === 6 ? 'sun' : '') + '">' + w + '</div>'; }).join('');
    for (var i = 0; i < first; i++) h += '<div></div>';
    for (var day = 1; day <= dn; day++) {
      var ds = U.ymd(p.y, p.m, day), w = wd(ds), hn = U.holidayName(ds), ex = dayExp(d.rows, ds), list = byEv[ds] || [];
      h += '<button data-act="dm-pick" data-d="' + ds + '" class="' + (ds === d.today ? 'today ' : '') + (ds === S.daySel ? 'sel ' : '') + ((w === 6 || hn) ? 'sun' : w === 5 ? 'sat' : '') + '" aria-label="' + md(ds) + (hn ? ' ' + hn : '') + '"><span class="dn num">' + day + '</span>' +
        list.slice(0, 2).map(function (e) {
          var sp = e.span, cls = '';
          if (sp) { var st = e.date === sp[0] || w === 0, en = e.date === sp[1] || w === 6; cls = st && en ? '' : st ? ' s' : en ? ' e' : ' m'; }
          return '<i class="lb' + cls + '" style="background:' + (e.ev.color || 'var(--plan)') + '">' + (!sp || e.date === sp[0] || w === 0 ? esc(e.ev.title || '일정') : '&nbsp;') + '</i>';
        }).join('') + (list.length > 2 ? '<span class="more2">+' + (list.length - 2) + '</span>' : '') +
        (hn && !list.length ? '<span class="hn">' + esc(hn) + '</span>' : '') +
        (ex ? '<span class="ex num">' + (ex >= 10000 ? (Math.round(ex / 1000) / 10) + '만' : U.num(ex)) + '</span>' : (notes[ds] ? '<span class="ndot"></span>' : '')) + '</button>';
    }
    return h + '</div><div class="mfoot k">한 번 누르면 그날 · 두 번 누르면 새 일정</div></div>';
  }
  function budgetHero(d) {
    var t = d.budget.total; if (!d.isCurrent || !t.planMonth) return '';
    var dl = U.diffDays(d.range.end, d.today) + 1, left = t.planMonth - t.projected, per = Math.max(0, left) / dl, p = U.parse(d.today), dn = U.daysInMonth(p.y, p.m);
    var usedR = Math.min(1, t.actual / t.planMonth), dayR = p.d / dn;
    return '<button class="card hero2" data-act="budget-calc"><div class="row between"><span class="lbl">이번 달 남은 예산</span><span class="k">계산 보기 ›</span></div>' +
      '<div class="big num ' + (left < 0 ? 'exp' : '') + '"><span class="m countup" data-to="' + Math.round(left) + '">' + U.num(left) + '</span><small>원</small></div>' +
      '<div class="pbar"><i style="width:' + (usedR * 100).toFixed(1) + '%"></i><em style="left:' + (dayR * 100).toFixed(1) + '%"></em></div>' +
      '<div class="row between"><span class="k">예산 ' + U.num(t.planMonth) + ' 중 ' + Math.round(usedR * 100) + '% 씀</span><span class="k">세로선 = 오늘(달의 ' + Math.round(dayR * 100) + '%)</span></div>' +
      (left >= 0 ? '<div class="daily">' + UI.ic('coin', 2) + '<div class="grow"><div class="k" style="color:var(--ink)">남은 ' + dl + '일 동안 하루에</div><b class="num m">약 ' + U.num(Math.floor(per / 100) * 100) + '원</b><span class="k" style="color:var(--ink)"> 씩 쓰면 예산에 맞아요</span></div></div>'
        : '<div class="daily bad">' + UI.ic('bell', 2) + '<div class="grow"><b>예정 지출까지 더하면 ' + U.won(-left) + ' 넘어요</b><div class="k">분석에서 빠른 항목을 확인해 보세요</div></div></div>') + '</button>';
  }
  UI.actions['budget-calc'] = function () {
    var d = UI.derive(), t = d.budget.total, dl = U.diffDays(d.range.end, d.today) + 1, left = t.planMonth - t.projected;
    UI.sheet('<div class="sh"><b>이 숫자는 이렇게 나와요</b><button class="cbtn sm" data-act="close" aria-label="닫기">' + UI.ic('x', 2.2) + '</button></div><div class="grp calc">' +
      [['이번 달 예산 합계', U.num(t.planMonth)], ['이미 쓴 돈', '− ' + U.num(t.actual)], ['앞으로 나갈 예정 (고정비 · 일정 비용)', '− ' + U.num(t.futureAmount)], ['= 남은 예산', U.num(left)]].map(function (r, i) { return '<div class="r"><span class="t" style="' + (i === 3 ? 'font-weight:800' : '') + '">' + r[0] + '</span><span class="v num" style="color:var(--ink);font-weight:700">' + r[1] + '원</span></div>'; }).join('') + '</div>' +
      (left > 0 ? '<div class="card" style="background:var(--brand-soft)"><div class="k" style="color:var(--ink)">남은 예산 ÷ 남은 ' + dl + '일 (오늘 포함)</div><div class="big num" style="font-size:1.5rem">하루 약 ' + U.num(Math.floor(left / dl / 100) * 100) + '원</div><div class="k" style="color:var(--ink)">매일 이만큼만 쓰면 월말에 예산이 딱 맞아요</div></div>' : '') +
      '<p class="hint" style="white-space:normal">예산은 시트의 \'예산\' 행을 모두 더한 값이에요. 막대의 세로선은 오늘이 이번 달의 몇 %인지예요. 막대가 선보다 짧으면 계획보다 덜 쓰고 있다는 뜻이에요.</p>');
  };
  function nowHM() { var n = new Date(); return U.pad(n.getHours()) + ':' + U.pad(n.getMinutes()); }
  function timeline(d) {
    var ds = S.daySel, items = [], f = S.dayFilt;
    X.eventsIn(ds, ds).forEach(function (e) { items.push({ k: '일정', t: e.span ? '' : e.time, allday: !!e.span || !e.time, h: e.ev.title || '일정', s: e.span ? md(e.span[0]) + ' ~ ' + md(e.span[1]) : (e.time ? e.time + (e.endTime ? '~' + e.endTime : '') : '하루 종일') + (e.ev.place ? ' · ' + e.ev.place : '') + (e.ev.who ? ' · ' + e.ev.who : ''), c: e.ev.color || 'var(--plan)', i: 'cal', act: 'ev-edit', id: e.ev.id, amt: e.ev.cost ? '예상 ' + U.num(e.ev.cost) : '' }); });
    d.rows.forEach(function (r) { if (r.date !== ds || r.type === 'budget') return; var inc = r.type === 'income', tr = r.type === 'transfer'; items.push({ k: '내역', t: r.tm || '', h: r.usage || r.category || '내역', s: tr ? (r.from + ' → ' + r.to) : (r.category ? r.category + ' · ' : '') + (inc ? r.to : r.from), c: inc ? 'var(--income)' : tr ? 'var(--blue)' : !r.amount ? 'var(--ink3)' : 'var(--expense)', i: inc ? 'up' : tr ? 'swap' : 'coin', act: 'edit', id: r.id, amt: r.amount ? (inc ? '+' : tr ? '' : '−') + U.num(r.amount) : '기록용', amtCls: inc ? 'inc' : r.amount ? '' : 'zero' }); });
    X.list('notes').forEach(function (n) { if (n.date !== ds) return; items.push({ k: '노트', t: n.tm || '', h: n.secret == 1 ? '비밀 노트' : (n.title || String(n.body || '').slice(0, 30) || '노트'), s: (n.mood ? n.mood + ' ' : '') + '노트' + (n.tags ? ' · ' + n.tags : ''), c: 'var(--note)', i: 'note', act: 'note-edit', id: n.id }); });
    if (f !== '전체') items = items.filter(function (x) { return x.k === f; });
    var allday = items.filter(function (x) { return x.k === '일정' && x.allday; }), timed = items.filter(function (x) { return x.t && !x.allday; }).sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; }), notime = items.filter(function (x) { return !x.t && !(x.k === '일정' && x.allday); });
    var row = function (x) { return '<button class="tev" style="--c:' + x.c + '" data-act="' + x.act + '" data-id="' + esc(x.id) + '"><span class="ic">' + UI.ic(x.i, 2) + '</span><div class="grow"><div class="t1">' + esc(x.h) + '</div><div class="t2">' + esc(x.s) + '</div></div>' + (x.amt ? '<b class="num m ' + (x.amtCls || '') + '">' + esc(x.amt) + '</b>' : '') + '</button>'; };
    var h = '<div class="tline">', now = ds === d.today ? nowHM() : null, shown = !now;
    if (allday.length) h += '<div class="tg"><span class="tm">종일</span><div class="tgi">' + allday.map(row).join('') + '</div></div>';
    timed.forEach(function (x) { if (!shown && x.t > now) { h += '<div class="nowl"><span>' + now + '</span></div>'; shown = true; } h += '<div class="tg"><span class="tm num">' + x.t + '</span><div class="tgi">' + row(x) + '</div></div>'; });
    if (!shown) h += '<div class="nowl"><span>' + now + '</span></div>';
    if (notime.length) h += '<div class="tg"><span class="tm none">시간<br>없음</span><div class="tgi">' + notime.map(row).join('') + '</div></div>';
    if (!items.length) h += '<div class="tg"><span class="tm none">–</span><div class="tgi"><div class="card empty1">' + (f === '전체' ? '이 날은 아직 기록이 없어요 · ＋로 남겨요' : ({ 일정: '일정이', 내역: '내역이', 노트: '노트가' })[f] + ' 없어요') + '</div></div></div>';
    return h + '</div>';
  }
  UI.views.home = {
    render: function () {
      var d = UI.derive(), h = '';
      var nc = St.conflicts().length;
      if (nc) h += '<button class="banner" data-act="go" data-tab="settings" data-open="adv" style="width:100%;text-align:left"><span>⚠</span><div><b>다른 곳에서 먼저 바뀐 내역 ' + nc + '건</b>눌러서 확인 (설정 › 고급)</div></button>';
      h += S.dayMonth ? monthGrid(d) : weekStrip(d);
      if (S.daySel === d.today) h += budgetHero(d);
      else h += '<div class="card row between"><span class="k" style="font-weight:700">' + md(S.daySel) + '에 쓴 돈</span><b class="num m" style="font-size:1.25rem">' + U.num(dayExp(d.rows, S.daySel)) + '원</b></div>';
      if (S.daySel === d.today && d.funding.deficits.length) h += '<button class="card row" data-act="tab" data-tab="asset" style="width:100%;text-align:left;gap:12px"><span class="st" style="background:var(--expense)">' + UI.ic('bell', 2) + '</span><div class="grow"><b class="t1">' + d.funding.deficits.length + '곳 자금 부족 · ' + U.won(d.funding.deficitTotal) + '</b><div class="t2">자산에서 이체 추천 보기</div></div>' + UI.CHEV + '</button>';
      h += '<div class="chips scroll" style="margin-bottom:10px">' + ['전체', '일정', '내역', '노트'].map(function (c) { return '<button class="chip ' + (S.dayFilt === c ? 'on' : '') + '" data-act="day-filt" data-v="' + c + '">' + c + '</button>'; }).join('') + '</div>';
      if (S.dayFilt === '노트') h += '<div class="row between" style="margin:-4px 4px 8px"><span class="k">이 날의 노트</span><button class="link" data-act="tab" data-tab="note">노트 모두 ›</button></div>';
      return h + timeline(d);
    },
    after: function () {
      UI.countUps();
      var el = $('#wk') || $('#mcal'); if (!el) return; var sx = null, sy = 0;
      el.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      el.addEventListener('touchend', function (e) { if (sx == null) return; var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null; if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (S.dayMonth) shiftMonth(dx < 0 ? 1 : -1); else { S.daySel = U.addDays(S.daySel, dx < 0 ? 7 : -7); syncMonth(); UI.render(); } });
    }
  };
  function syncMonth() { var ym = S.daySel.slice(0, 7); if (S.month !== ym) S.month = ym; }
  function shiftMonth(n) { var ym = U.shiftMonth(S.daySel.slice(0, 7), n), p = U.parse(ym + '-01'); S.daySel = ym === U.today().slice(0, 7) ? U.today() : U.ymd(p.y, p.m, 1); syncMonth(); UI.render(); }
  UI.actions['day-pick'] = function (el) { S.daySel = el.dataset.d; S.dayPicked = el.dataset.d; syncMonth(); UI.render(); };
  UI.actions['day-today'] = function () { S.daySel = U.today(); syncMonth(); UI.render(); };
  UI.actions['day-month'] = function () { S.dayMonth = !S.dayMonth; UI.render(); };
  UI.actions['dm-shift'] = function (el) { shiftMonth(+el.dataset.d); };
  UI.actions['dm-pick'] = function (el) { if (S.daySel === el.dataset.d && S.dayPicked === el.dataset.d) { S.calSel = el.dataset.d; UI.actions['ev-new']({ dataset: { d: el.dataset.d } }); return; } S.daySel = el.dataset.d; S.dayPicked = el.dataset.d; syncMonth(); UI.render(); };
  UI.actions['day-filt'] = function (el) { S.dayFilt = el.dataset.v; UI.render(); };
  // 새 일정·노트·내역의 기본 날짜 = 하루 탭에서 고른 날
  var evNew = UI.actions['ev-new'];
  UI.actions['ev-new'] = function (el) { if (S.tab === 'home' && !(el && el.dataset && el.dataset.d)) { S.calSel = S.daySel; return evNew({ dataset: { d: S.daySel } }); } return evNew(el); };
  var addA = UI.actions.add; UI.actions.add = function (el) { if (S.tab === 'home' && S.daySel !== U.today()) return UI.openAdd({ date: S.daySel }); return addA(el); };
  var noteNew = UI.actions['note-new']; UI.actions['note-new'] = function (el) { if (S.tab === 'home' && !(el && el.dataset && el.dataset.d)) return noteNew({ dataset: { d: S.daySel } }); return noteNew(el); };
  // 이전 '달력' 탭 · 노트 바로가기는 하루 탭으로
  var setTab = UI.setTab; UI.setTab = function (t) { if (t === 'cal') { S.dayMonth = true; t = 'home'; } if (t === 'home' && S.tab !== 'home') syncMonth(); return setTab(t); };
})(typeof window !== 'undefined' ? window : globalThis);
