/* 내 하루장 — 달력 · 노트 · 일정 · 저금통 화면과 입력 시트 */
(function (root) {
  'use strict';
  var AB = root.AB, U = AB.util, C = AB.calc, St = AB.store, UI = AB.ui, X = AB.side;
  var esc = U.esc, $ = UI.$, S = UI.S;
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var KIND = {};
  var EVC = ['#6B4FA3', '#2F6FA3', '#2E7D46', '#B8862B', '#C0412F', '#A0703A'];
  var MOOD = ['😀', '🙂', '😐', '😔', '😣'];
  function x(icn) { return '<button class="cbtn sm" data-act="close" aria-label="닫기">' + UI.ic(icn || 'x', 2.2) + '</button>'; }
  function dayExp(rows, d) { var s = 0; rows.forEach(function (r) { if (r.date === d && r.type === 'expense') s += r.amount || 0; }); return s; }
  function md(d) { var p = U.parse(d); return p.m + '월 ' + p.d + '일 ' + WD[U.weekday(d)]; }

  /* ───── 아래 탭: 오늘 · 달력 · ＋ · 노트 · 자산 ───── */
  var TABS = [['home', '오늘', 'home'], ['entries', '내역', 'list'], ['+'], ['analysis', '분석', 'chart'], ['asset', '자산', 'wallet']];
  var P2 = { cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', note: '<path d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M9 11h6M9 15h6"/>', tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>' };
  var baseIc = UI.ic;
  UI.ic = function (n, w) { if (P2[n]) return '<svg class="ic2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P2[n] + '</svg>'; return baseIc(n, w); };
  UI.renderTabs = function () {
    var cur = S.tab === 'cal' ? 'entries' : (S.tab === 'note' || S.tab === 'jar' ? 'home' : S.tab);
    $('#tabs').innerHTML = TABS.map(function (t) {
      if (t[0] === '+') return '<button class="plus" data-act="add" aria-label="새로 쓰기">' + UI.ic('plus', 2.6) + '</button>';
      return '<button class="' + (cur === t[0] ? 'on' : '') + '" data-act="tab" data-tab="' + t[0] + '">' + UI.ic(t[2], cur === t[0] ? 2.3 : 1.9) + '<span>' + t[1] + '</span></button>';
    }).join('');
    var fab = $('#fab'); if (fab) fab.hidden = true;
  };

  UI.actions['fan-go'] = function (el) { UI.closeSheet(); UI.setTab(el.dataset.tab); };

  /* ───── 말로 쓰기: 브라우저 음성 인식 → 안 되면 아이폰 키보드 받아쓰기 안내 ───── */
  var rec = null, recBtn = null;
  function stopRec() { try { if (rec) rec.stop(); } catch (e) { /* 무시 */ } rec = null; if (recBtn) recBtn.classList.remove('rec'); recBtn = null; }
  var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function keyboardHelp(target) {
    target.focus();
    var tip = document.getElementById('dict-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'dict-tip'; tip.className = 'dict-tip'; }
    tip.innerHTML = '<b>' + UI.ic('mic', 2.2) + ' 키보드의 🎤를 누르고 말하세요</b><span>키보드 왼쪽 아래(또는 스페이스 옆) 마이크 · 안 보이면 아이폰 설정 › 일반 › 키보드 › 받아쓰기 켜기</span>';
    var anchor = (target.parentNode && target.parentNode.classList.contains('row')) ? target.parentNode : target;
    anchor.parentNode.insertBefore(tip, anchor.nextSibling);
    clearTimeout(tip._t); tip._t = setTimeout(function () { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 9000);
  }
  UI.dictate = function (btn, target) {
    if (rec) { stopRec(); return; }
    var SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    // 아이폰은 홈 화면 앱에서 브라우저 음성 인식이 막히거나 조용히 실패해서, 확실히 되는 키보드 받아쓰기로 안내
    if (IOS || !SR) return keyboardHelp(target);
    var fallback = function () { keyboardHelp(target); };
    try {
      rec = new SR(); rec.lang = 'ko-KR'; rec.interimResults = true; rec.continuous = true;
      var base = target.value, sep = base && !/\s$/.test(base) ? ' ' : '', got = false;
      var dog = setTimeout(function () { if (!got) { stopRec(); fallback(); } }, 7000);
      rec.onresult = function (e) { got = true; var fin = '', tmp = ''; for (var i = 0; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript; else tmp += e.results[i][0].transcript; } target.value = base + sep + fin + tmp; target.dispatchEvent(new Event('input', { bubbles: true })); };
      rec.onerror = function () { clearTimeout(dog); stopRec(); if (!got) fallback(); };
      rec.onend = function () { clearTimeout(dog); stopRec(); };
      rec.start(); recBtn = btn; btn.classList.add('rec'); UI.toast('듣고 있어요 · 다시 누르면 멈춰요', { ms: 3000 });
    } catch (err) { stopRec(); fallback(); }
  };
  UI.actions.dictate = function (el) { var t = document.getElementById(el.dataset.for); if (t) UI.dictate(el, t); };

  /* ───── 달력: 칸마다 일정 제목, 날짜를 누르면 아래에 그날 일정·내역·노트 (다시 누르면 새 일정) ───── */
  S.calSel = '';
  function agenda(ds, d) {
    var rows = C.sortRows(d.rows.filter(function (r) { return r.date === ds && r.type !== 'budget'; })), evs = X.eventsIn(ds, ds), notes = X.list('notes').filter(function (n) { return n.date === ds; }), hn = U.holidayName(ds);
    var h = '<div class="sec row between"><span>' + md(ds) + (hn ? ' · <span class="exp">' + esc(hn) + '</span>' : '') + '</span><span class="k num">지출 ' + U.num(dayExp(d.rows, ds)) + '원</span></div><div class="card agenda">';
    evs.forEach(function (e) {
      var tm = e.span ? (+e.span[0].slice(5, 7)) + '/' + (+e.span[0].slice(8)) + '~' + (+e.span[1].slice(5, 7)) + '/' + (+e.span[1].slice(8)) : (e.time ? e.time + (e.endTime ? '~' + e.endTime : '') : '하루 종일');
      h += '<div class="li" data-act="ev-edit" data-id="' + esc(e.ev.id) + '"><div class="ic" style="background:' + (e.ev.color || 'var(--plan)') + ';color:#fff">' + UI.ic('cal', 2) + '</div><div class="main"><div class="t1">' + esc(e.ev.title || '일정') + '</div><div class="t2">' + esc(tm) + (e.ev.place ? ' · ' + esc(e.ev.place) : '') + (e.ev.who ? ' · ' + esc(e.ev.who) : '') + (e.ev.repeat ? ' · ' + esc(e.ev.repeat) : '') + '</div></div><div class="amt num">' + (e.ev.cost ? U.num(e.ev.cost) : '') + '</div></div>';
    });
    rows.forEach(function (r) { h += UI.row(r, d.today); });
    notes.forEach(function (n) { h += '<div class="li" data-act="note-edit" data-id="' + esc(n.id) + '"><div class="ic" style="background:var(--note);color:#fff">' + UI.ic('note', 2) + '</div><div class="main"><div class="t1">' + (n.mood ? n.mood + ' ' : '') + esc(n.secret == 1 ? '비밀 노트' : (n.title || n.body || '').slice(0, 30)) + '</div><div class="t2">노트' + (n.tags ? ' · ' + esc(n.tags) : '') + '</div></div></div>'; });
    if (!evs.length && !rows.length && !notes.length) h += '<div class="empty" style="padding:12px"><b>이 날 기록이 없어요</b></div>';
    return h + '</div><div class="row" style="gap:8px"><button class="btn grow" data-act="ev-new" data-d="' + ds + '">' + UI.ic('cal', 2) + '일정</button><button class="btn soft grow" data-act="day-add" data-d="' + ds + '">' + UI.ic('coin', 2) + '내역</button><button class="btn soft grow" data-act="note-new" data-d="' + ds + '">' + UI.ic('note', 2) + '노트</button></div>';
  }
  UI.views.cal = {
    render: function () {
      var d = UI.derive(), r = d.range, p = U.parse(r.start), first = U.weekday(r.start), dn = U.daysInMonth(p.y, p.m);
      if (!S.calSel || S.calSel < r.start || S.calSel > r.end) S.calSel = d.today >= r.start && d.today <= r.end ? d.today : r.start;
      var evs = X.eventsIn(r.start, r.end), byEv = {}, bars = {}, byNote = {};
      evs.forEach(function (e) { if (e.span) (bars[e.date] = bars[e.date] || []).push(e); else (byEv[e.date] = byEv[e.date] || []).push(e); });
      X.list('notes').forEach(function (n) { if (n.date >= r.start && n.date <= r.end) byNote[n.date] = true; });
      var pay = {}; d.cards.forEach(function (c) { if (c.due && c.owed) pay[c.due] = true; });
      var h = '<div class="card calcard" id="calcard"><div class="row between" style="padding:0 6px 6px"><b class="t1">' + p.y + '년 ' + p.m + '월</b><div class="row" style="gap:6px"><button class="btn soft sm" data-act="cal-today">오늘</button><button class="btn sm" data-act="ev-new" data-d="' + S.calSel + '">' + UI.ic('plus', 2.4) + '일정</button></div></div><div class="cal">' + WD.map(function (w, i) { return '<div class="h ' + (i === 0 ? 'exp' : i === 6 ? 'blu' : '') + '">' + w + '</div>'; }).join('');
      for (var i = 0; i < first; i++) h += '<div></div>';
      for (var day = 1; day <= dn; day++) {
        var ds = U.ymd(p.y, p.m, day), e = dayExp(d.rows, ds), wd = U.weekday(ds), hn = U.holidayName(ds), list = byEv[ds] || [];
        var cls = (ds === d.today ? ' today' : '') + (ds === S.calSel ? ' sel' : '');
        h += '<button data-act="cal-pick" data-d="' + ds + '" class="' + cls + '" aria-label="' + md(ds) + (hn ? ' ' + hn : '') + (list.length ? ' 일정 ' + list.length + '개' : '') + '"><span class="d num ' + (wd === 0 || hn ? 'exp' : wd === 6 ? 'blu' : '') + '">' + day + '</span>' +
          '<span class="bars">' + (bars[ds] || []).slice(0, 2).map(function (b) { var st = b.date === b.span[0] || wd === 0, en = b.date === b.span[1] || wd === 6; return '<i class="bar' + (st ? ' s' : '') + (en ? ' e' : '') + '" style="background:' + (b.ev.color || 'var(--plan)') + '">' + (st ? esc(b.ev.title || '') : '') + '</i>'; }).join('') +
          list.slice(0, 2 - Math.min(2, (bars[ds] || []).length)).map(function (x) { return '<i class="evl" style="color:' + (x.ev.color || 'var(--plan)') + '">' + esc(x.ev.title || '일정') + '</i>'; }).join('') + '</span>' +
          (hn ? '<span class="hn">' + esc(hn) + '</span>' : '') +
          '<span class="m num">' + (e ? (e >= 10000 ? (Math.round(e / 1000) / 10) + '만' : U.num(e)) : '') + '</span><span class="mk">' + (list.length > 2 ? '<em>+' + (list.length - 2) + '</em>' : '') + (pay[ds] ? '<i style="background:var(--warn)"></i>' : '') + (byNote[ds] ? '<i style="background:var(--note)"></i>' : '') + '</span></button>';
      }
      h += '</div><div class="calleg"><span><i style="background:var(--warn)"></i>카드 결제</span><span><i style="background:var(--note)"></i>노트</span><span class="k">옆으로 밀면 다른 달</span></div></div>';
      h += agenda(S.calSel, d);
      var up = evs.filter(function (e) { return e.date > S.calSel && (!e.span || e.date === e.span[0]); }).slice(0, 5);
      if (up.length) h += '<div class="sec">다가오는 일정</div><div class="grp">' + up.map(function (e) { var q = U.parse(e.date); return '<button class="r" data-act="ev-edit" data-id="' + esc(e.ev.id) + '"><span class="st num" style="background:' + (e.ev.color || 'var(--plan)') + ';font-weight:800;font-size:.8rem">' + q.d + '</span><span class="t">' + esc(e.ev.title || '일정') + '</span><span class="v">' + WD[U.weekday(e.date)] + (e.time ? ' ' + e.time : '') + (e.ev.cost ? ' · ' + U.num(e.ev.cost) : '') + '</span>' + UI.CHEV + '</button>'; }).join('') + '</div>';
      return h;
    },
    after: function () {
      var c = document.getElementById('calcard'); if (!c) return; var sx = null, sy = 0;
      c.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      c.addEventListener('touchend', function (e) { if (sx == null) return; var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { S.month = U.shiftMonth(S.month, dx < 0 ? 1 : -1); S.calSel = ''; UI.render(); } });
    }
  };
  UI.actions['cal-pick'] = function (el) { if (S.calSel === el.dataset.d) { evSheet({ start: el.dataset.d + ' 10:00' }); return; } S.calSel = el.dataset.d; UI.render(); };
  UI.actions['cal-today'] = function () { var t = U.today(); S.month = t.slice(0, 7); S.calSel = t; UI.render(); };
  UI.actions['day-open'] = function (el) { dayOpen(el.dataset.d); };
  function dayOpen(ds) {
    var d = UI.derive(), rows = C.sortRows(d.rows.filter(function (r) { return r.date === ds && r.type !== 'budget'; })), evs = X.eventsIn(ds, ds), notes = X.list('notes').filter(function (n) { return n.date === ds; }), hn = U.holidayName(ds);
    var h = '<div class="sh"><b>' + md(ds) + (hn ? ' · ' + esc(hn) : '') + '</b>' + x() + '</div>';
    h += '<div class="card">';
    evs.forEach(function (e) { h += '<div class="li" data-act="ev-edit" data-id="' + esc(e.ev.id) + '"><div class="ic" style="background:var(--plan);color:#fff">' + UI.ic('cal', 2) + '</div><div class="main"><div class="t1">' + esc(e.ev.title || '일정') + '</div><div class="t2">' + (e.time || '하루 종일') + (e.ev.place ? ' · ' + esc(e.ev.place) : '') + '</div></div><div class="amt num">' + (e.ev.cost ? U.num(e.ev.cost) : '') + '</div></div>'; });
    rows.forEach(function (r) { h += UI.row(r, d.today); });
    notes.forEach(function (n) { h += '<div class="li" data-act="note-edit" data-id="' + esc(n.id) + '"><div class="ic" style="background:' + (KIND[n.kind] || 'var(--note)') + ';color:#fff">' + UI.ic('note', 2) + '</div><div class="main"><div class="t1">' + (n.mood ? n.mood + ' ' : '') + esc(n.secret == 1 ? '비밀 노트' : (n.title || n.body || '').slice(0, 30)) + '</div><div class="t2">노트' + (n.tags ? ' · ' + esc(n.tags) : '') + '</div></div></div>'; });
    if (!evs.length && !rows.length && !notes.length) h += '<div class="empty" style="padding:14px"><b>이 날 기록이 없어요</b></div>';
    h += '</div><div class="row" style="gap:8px"><button class="btn soft grow" data-act="day-add" data-d="' + ds + '">' + UI.ic('coin', 2) + '내역</button><button class="btn soft grow" data-act="note-new" data-d="' + ds + '">' + UI.ic('note', 2) + '노트</button><button class="btn soft grow" data-act="ev-new" data-d="' + ds + '">' + UI.ic('cal', 2) + '일정</button></div>';
    UI.sheet(h);
  }
  UI.dayOpen = dayOpen;
  UI.actions['day-add'] = function (el) { UI.closeSheet(); UI.openAdd({ date: el.dataset.d }); };

  /* ───── 노트 ───── */
  S.noteK = S.noteK || '전체'; S.noteQ = S.noteQ || '';
  UI.views.note = {
    render: function () {
      var d = UI.derive(), all = X.list('notes').sort(function (a, b) { return (b.date + b.updated) > (a.date + a.updated) ? 1 : -1; });
      var tags = {}; all.forEach(function (n) { String(n.tags || '').split(/[\s,]+/).forEach(function (t) { if (t) tags[t.replace(/^#?/, '#')] = 1; }); });
      var chips = ['전체'].concat(Object.keys(tags).slice(0, 10));
      var q = S.noteQ.trim(), list = all.filter(function (n) {
        if (S.noteK !== '전체') { if (S.noteK.charAt(0) === '#' && String(n.tags || '').indexOf(S.noteK.slice(1)) < 0) return false; }
        return !q || (n.title + ' ' + n.body + ' ' + n.tags).indexOf(q) >= 0;
      });
      var h = '<div class="row" style="gap:8px;margin-bottom:8px"><input id="note-q" class="input" data-in="note-q" placeholder="노트 · 내역 찾기" value="' + esc(S.noteQ) + '" style="flex:1"><button class="btn soft" data-act="note-new">' + UI.ic('plus', 2.2) + '쓰기</button></div>';
      h += '<div class="chips scroll" style="margin-bottom:10px">' + chips.map(function (c) { return '<button class="chip ' + (S.noteK === c ? 'on' : '') + '" data-act="note-k" data-v="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>';
      var ago = U.parse(d.today), agoD = U.ymd(ago.y - 1, ago.m, Math.min(ago.d, U.daysInMonth(ago.y - 1, ago.m))), agoN = all.filter(function (n) { return n.date === agoD; })[0], agoE = dayExp(d.rows, agoD);
      if (agoN || agoE) h += '<button class="card ago" data-act="day-open" data-d="' + agoD + '" style="width:100%;text-align:left"><div class="k">1년 전 오늘 · ' + agoD.replace(/-/g, '.') + '</div><b class="t1">' + esc(agoN ? (agoN.secret == 1 ? '비밀 노트' : agoN.title || agoN.body.slice(0, 24)) : '이 날의 기록') + '</b><div class="t2">그날 지출 ' + U.num(agoE) + '원</div></button>';
      if (q) {
        var hits = d.rows.filter(function (r) { return (r.usage + ' ' + r.category + ' ' + r.memo1 + ' ' + r.memo2).indexOf(q) >= 0; }).slice(0, 8);
        if (hits.length) h += '<div class="sec">내역 ' + hits.length + '건</div><div class="card">' + hits.map(function (r) { return UI.row(r, d.today); }).join('') + '</div>';
        var ev = X.list('events').filter(function (e) { return (e.title + ' ' + e.place + ' ' + e.who).indexOf(q) >= 0; }).slice(0, 5);
        if (ev.length) h += '<div class="sec">일정 ' + ev.length + '건</div><div class="grp">' + ev.map(function (e) { return '<button class="r" data-act="ev-edit" data-id="' + esc(e.id) + '"><span class="st" style="background:var(--plan)">' + UI.ic('cal', 2) + '</span><span class="t">' + esc(e.title) + '</span><span class="v">' + esc(String(e.start).slice(5, 10)) + '</span></button>'; }).join('') + '</div>';
        h += '<div class="sec">노트 ' + list.length + '건</div>';
      }
      if (!list.length && !q) return h + '<div class="card"><div class="empty"><b>첫 노트를 써 보세요</b>쓴 날의 지출이 함께 붙어요.</div></div>';
      return h + list.slice(0, 80).map(function (n) {
        var e = dayExp(d.rows, n.date), sec = n.secret == 1;
        return '<button class="nt" data-act="note-edit" data-id="' + esc(n.id) + '" style="border-left-color:' + (KIND[n.kind] || 'var(--note)') + '"><div class="row between"><div class="t1 grow">' + (n.mood ? n.mood + ' ' : '') + esc(sec ? '비밀 노트' : (n.title || String(n.body || '').slice(0, 30) || '제목 없음')) + '</div><span class="k num" style="flex:none">' + n.date.slice(5).replace('-', '.') + '</span></div>' + (sec || !n.title ? '' : '<div class="t2">' + esc(String(n.body || '').replace(/\n/g, ' ').slice(0, 60)) + '</div>') +
          '<div class="t2">' + (n.tags ? esc(n.tags) + ' · ' : '') + '그날 지출 ' + U.num(e) + '원' + '</div></button>';
      }).join('');
    }
  };
  UI.inputs['note-q'] = U.debounce ? U.debounce(function (el) { S.noteQ = el.value; UI.render(); }, 250) : function (el) { S.noteQ = el.value; UI.render(); };
  UI.actions['note-k'] = function (el) { S.noteK = el.dataset.v; UI.render(); };

  var N = null;
  function noteSheet(n) {
    N = Object.assign({ date: U.today(), kind: '노트', title: '', body: '', mood: '', tags: '', secret: 0 }, n || {});
    var d = UI.derive(), e = dayExp(d.rows, N.date);
    UI.sheet('<div class="sh"><b>' + (N.id ? '노트 수정' : '새 노트') + '</b>' + x() + '</div>' +
      '<div class="row" style="gap:8px;margin-bottom:8px"><input id="n-date" type="date" class="input" value="' + N.date + '" style="flex:1"><div class="seg2" style="flex:1.4">' + MOOD.map(function (m) { return '<button class="' + (N.mood === m ? 'on' : '') + '" data-act="n-mood" data-v="' + m + '" aria-label="기분 ' + m + '">' + m + '</button>'; }).join('') + '</div></div>' +
      '<input id="n-title" class="input" placeholder="제목 (없어도 돼요)" value="' + esc(N.title) + '" style="margin-bottom:8px">' +
      '<div class="row between" style="margin-bottom:4px"><span class="k">내용</span><div class="row" style="gap:6px"><button class="btn soft sm" data-act="n-todo" aria-label="할 일 줄 넣기">☐ 할 일</button><button class="btn soft sm mic" data-act="dictate" data-for="n-body" aria-label="말로 쓰기">' + UI.ic('mic', 2.2) + '말로</button></div></div><textarea id="n-body" class="input textarea" rows="6" placeholder="오늘 있었던 일, 떠오른 생각">' + esc(N.body) + '</textarea>' +
      '<div class="row" style="gap:8px;margin-top:8px"><input id="n-tags" class="input" placeholder="#가족 #건강" value="' + esc(N.tags) + '" style="flex:1">' + '</div>' +
      '<div class="grp" style="margin-top:10px"><div class="r"><span class="st" style="background:var(--ink2)">' + UI.ic('eye', 2) + '</span><span class="t">비밀 (목록에서 내용 가리기)</span><button class="sw" data-act="n-secret" role="switch" aria-checked="' + (N.secret == 1) + '" aria-label="비밀"><i></i></button></div>' +
      '<div class="r"><span class="st" style="background:var(--expense)">' + UI.ic('coin', 2) + '</span><span class="t">이 날 지출</span><span class="v num">' + U.num(e) + '원</span></div></div>' +
      '<div id="n-found" class="t2" style="margin:2px 4px 8px"></div>' +
      '<div class="row" style="gap:8px">' + (N.id ? '<button class="btn ghost danger-t" data-act="n-del" style="flex:1">삭제</button>' : '') + '<button class="btn" data-act="n-save" style="flex:2">저장</button></div>');
    var b = $('#n-body'); b.addEventListener('input', findMoney); findMoney(); if (!N.id) setTimeout(function () { b.focus(); }, 60);
  }
  function findMoney() {
    var b = $('#n-body'), f = $('#n-found'); if (!b || !f) return;
    var m = b.value.match(/([가-힣A-Za-z ]{1,12}?)\s*(\d[\d,]{2,})\s*원/);
    f.innerHTML = m ? '글 속 <b>' + esc(m[1].trim()) + ' ' + esc(m[2]) + '원</b> → <button class="link" data-act="n-toentry" data-u="' + esc(m[1].trim()) + '" data-a="' + m[2].replace(/,/g, '') + '">내역으로 추가</button>' : '';
  }
  function collect() { N.date = $('#n-date').value || N.date; N.title = $('#n-title').value.trim(); N.body = $('#n-body').value; N.tags = $('#n-tags').value.trim(); var c = $('#n-cost'); if (c) N.cost = U.parseInput(c.value); }
  UI.actions['note-new'] = function (el) { UI.closeSheet(); noteSheet({ date: (el && el.dataset.d) || U.today() }); };
    UI.actions['note-edit'] = function (el) { var n = X.get('notes', el.dataset.id); if (n) { UI.closeSheet(); noteSheet(n); } };
  UI.actions['n-kind'] = function (el) { collect(); N.kind = el.dataset.v; noteSheet(N); };
  UI.actions['n-todo'] = function () { var b = $('#n-body'); var v = b.value; b.value = v + (v && !/\n$/.test(v) ? '\n' : '') + '☐ '; b.focus(); try { b.setSelectionRange(b.value.length, b.value.length); } catch (e) { /* 무시 */ } };
  UI.actions['n-mood'] = function (el) { N.mood = N.mood === el.dataset.v ? '' : el.dataset.v; el.parentNode.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === N.mood); }); };
  UI.actions['n-secret'] = function (el) { N.secret = N.secret == 1 ? 0 : 1; el.setAttribute('aria-checked', N.secret == 1); };
  UI.actions['n-save'] = function () {
    collect(); if (!U.parse(N.date)) return UI.toast('날짜를 골라 주세요');
    if (!N.title && !N.body.trim()) return UI.toast('내용을 써 주세요');
    if (!N.tm && !N.id && N.date === U.today()) { var nn = new Date(); N.tm = U.pad(nn.getHours()) + ':' + U.pad(nn.getMinutes()); }
    var saved = X.put('notes', N); UI.closeSheet(); UI.render();
    UI.toast('노트 저장했어요', { kind: 'ok', action: { label: '되돌리기', fn: function () { X.del('notes', saved.id); UI.render(); } } });
  };
  UI.actions['n-del'] = function () { var b = X.del('notes', N.id); UI.closeSheet(); UI.render(); UI.toast('노트를 지웠어요', { action: { label: '되돌리기', fn: function () { X.put('notes', Object.assign({}, b, { deleted: 0 })); UI.render(); } } }); };
  UI.actions['n-toentry'] = function (el) { collect(); var d = N.date; UI.closeSheet(); UI.openAdd({ usage: el.dataset.u, amount: +el.dataset.a, date: d }); };

  /* ───── 일정 (예상 비용 → 그 날 예산 행으로 함께 저장) ───── */
  var E = null, E0 = null;
  var TPL = [['생일', '매년', 1, '#C0412F'], ['기념일', '매년', 1, '#B8862B'], ['병원', '', 0, '#2F6FA3'], ['모임', '', 0, '#6B4FA3'], ['여행', '', 1, '#2E7D46'], ['경조사', '', 1, '#A0703A'], ['면회', '', 0, '#2F6FA3']];
  function evSheet(e) {
    E0 = e && e.id ? JSON.parse(JSON.stringify(e)) : null;
    E = Object.assign({ start: U.today() + ' 10:00', end: '', allday: 0, title: '', place: '', repeat: '', until: '', who: '', cost: 0, link: '', color: EVC[0], category: '일정', memo: '' }, e || {});
    var dd = String(E.start).slice(0, 10), tt = String(E.start).slice(11, 16) || '10:00', ed = E.allday == 1 ? (String(E.end || '').slice(0, 10) || dd) : dd, et = E.allday == 1 ? '' : String(E.end || '').slice(11, 16);
    var cats = ['일정'].concat(UI.derive().eff.expenses.filter(function (c) { return c !== '일정'; }));
    var whos = {}; X.list('events').forEach(function (v) { String(v.who || '').split(/[,·]/).forEach(function (w) { w = w.trim(); if (w) whos[w] = (whos[w] || 0) + 1; }); });
    var whoList = Object.keys(whos).sort(function (a, b) { return whos[b] - whos[a]; }).slice(0, 6);
    UI.sheet('<div class="sh"><b>' + (E.id ? '일정 수정' : '새 일정') + '</b>' + x() + '</div>' +
      '<input id="e-title" class="input" placeholder="무슨 일정인가요? (예: 결혼기념일 저녁)" value="' + esc(E.title) + '" style="margin-bottom:6px">' +
      (E.id ? '' : '<div class="chips scroll" style="margin-bottom:8px">' + TPL.map(function (t, k) { return '<button type="button" class="chip" data-act="e-tpl" data-k="' + k + '">' + t[0] + '</button>'; }).join('') + '</div>') +
      '<div class="grp">' +
        '<div class="r"><span class="st" style="background:var(--plan)">' + UI.ic('cal', 2) + '</span><span class="t">하루 종일 · 기간</span><button class="sw" data-act="e-allday" role="switch" aria-checked="' + (E.allday == 1) + '" aria-label="하루 종일"><i></i></button></div>' +
        '<div class="r"><span class="k" style="width:30px;text-align:center">시작</span><input id="e-date" type="date" class="input grow" value="' + dd + '"><input id="e-time" type="time" class="input" value="' + tt + '" style="width:7.2em"' + (E.allday == 1 ? ' hidden' : '') + '></div>' +
        '<div class="r"><span class="k" style="width:30px;text-align:center">끝</span><input id="e-end" type="date" class="input grow" value="' + ed + '"' + (E.allday == 1 ? '' : ' hidden') + '><input id="e-endtime" type="time" class="input grow" value="' + et + '" placeholder="끝 시간"' + (E.allday == 1 ? ' hidden' : '') + '></div>' +
      '</div>' +
      '<div class="chips scroll" id="e-times" style="margin:-4px 0 10px"' + (E.allday == 1 ? ' hidden' : '') + '>' + [['09:00', '오전 9시'], ['10:00', '10시'], ['12:00', '낮 12시'], ['15:00', '오후 3시'], ['18:00', '6시'], ['19:00', '7시']].map(function (t) { return '<button type="button" class="chip" data-act="e-qt" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="grp">' +
        '<div class="r"><span class="st" style="background:var(--blue)">' + UI.ic('history', 2) + '</span><span class="t">반복</span><div class="seg2" style="width:190px">' + [['', '없음'], ['매주', '매주'], ['매월', '매월'], ['매년', '매년']].map(function (r) { return '<button type="button" class="' + (E.repeat === r[0] ? 'on' : '') + '" data-act="e-rep" data-v="' + r[0] + '">' + r[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="r" id="e-until-row"' + (E.repeat ? '' : ' hidden') + '><span class="st" style="background:var(--ink3)">' + UI.ic('x', 2) + '</span><span class="t">반복 끝나는 날</span><input id="e-until" type="date" class="input" value="' + esc(E.until || '') + '" style="width:9.5em"></div>' +
        '<div class="r" id="e-cols"><span class="st" style="background:' + E.color + '" id="e-colst">' + UI.ic('tag', 2) + '</span><span class="t">색</span>' + EVC.map(function (c) { return '<button type="button" class="swatch' + (E.color === c ? ' on' : '') + '" data-act="e-col" data-v="' + c + '" style="background:' + c + '" aria-label="색 고르기"></button>'; }).join('') + '</div>' +
      '</div>' +
      '<div class="row" style="gap:8px;margin-bottom:6px"><input id="e-place" class="input" placeholder="장소" value="' + esc(E.place) + '" style="flex:1"><input id="e-who" class="input" placeholder="누구와" value="' + esc(E.who) + '" style="flex:1"></div>' +
      (whoList.length ? '<div class="chips scroll" style="margin-bottom:8px">' + whoList.map(function (w) { return '<button type="button" class="chip" data-act="e-who" data-v="' + esc(w) + '">' + esc(w) + '</button>'; }).join('') + '</div>' : '') +
      '<textarea id="e-memo" class="input textarea" rows="2" placeholder="메모 (준비물, 연락처 등)" style="margin-bottom:8px">' + esc(E.memo || '') + '</textarea>' +
      '<div class="field"><label>예상 비용 <span class="faint" id="e-cost-hint">' + (E.repeat ? '(반복 일정은 예산에 넣지 않아요)' : '(넣으면 시작일 예산에 반영)') + '</span></label><div class="row" style="gap:8px"><div class="suffix-wrap" style="flex:1"><input id="e-cost" class="input num" inputmode="numeric" placeholder="0" value="' + (E.cost ? U.fmtInput(E.cost) : '') + '" data-in="e-cost"><span class="suffix">원</span></div><select id="e-cat" class="select" style="flex:1" aria-label="예산 항목">' + cats.map(function (c) { return '<option' + (c === (E.category || '일정') ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="row" style="gap:8px">' + (E.id ? '<button class="btn ghost danger-t" data-act="e-del" style="flex:1">삭제</button>' : '') + '<button class="btn" data-act="e-save" style="flex:2">저장</button></div>');
    if (!E.id) setTimeout(function () { $('#e-title').focus(); }, 60);
  }
  UI.inputs['e-cost'] = function (el) { el.value = U.fmtInput(el.value); };
  UI.actions['ev-new'] = function (el) { UI.closeSheet(); evSheet({ start: ((el && el.dataset.d) || S.calSel || U.today()) + ' 10:00' }); };
  UI.actions['ev-edit'] = function (el) { var e = X.get('events', el.dataset.id); if (e) { UI.closeSheet(); evSheet(e); } };
  function setAllday(on) { E.allday = on ? 1 : 0; var sw = document.querySelector('[data-act="e-allday"]'); if (sw) sw.setAttribute('aria-checked', !!on); $('#e-time').hidden = on; $('#e-endtime').hidden = on; $('#e-end').hidden = !on; $('#e-times').hidden = on; if (on && !$('#e-end').value) $('#e-end').value = $('#e-date').value; }
  UI.actions['e-allday'] = function () { setAllday(E.allday != 1); };
  UI.actions['e-col'] = function (el) { E.color = el.dataset.v; document.querySelectorAll('#e-cols .swatch').forEach(function (b) { b.classList.toggle('on', b === el); }); $('#e-colst').style.background = E.color; };
  UI.actions['e-rep'] = function (el) { E.repeat = el.dataset.v; el.parentNode.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b === el); }); $('#e-until-row').hidden = !E.repeat; var ch = $('#e-cost-hint'); if (ch) ch.textContent = E.repeat ? '(반복 일정은 예산에 넣지 않아요)' : '(넣으면 시작일 예산에 반영)'; };
  UI.actions['e-qt'] = function (el) { var v = el.dataset.v, et = $('#e-endtime'); $('#e-time').value = v; if (!et.value || et.value <= v) et.value = U.pad(Math.min(+v.slice(0, 2) + 1, 23)) + ':' + (+v.slice(0, 2) >= 23 ? '59' : '00'); document.querySelectorAll('#e-times .chip').forEach(function (c) { c.classList.toggle('on', c === el); }); };
  UI.actions['e-who'] = function (el) { var w = $('#e-who'); w.value = w.value ? (w.value.indexOf(el.dataset.v) >= 0 ? w.value : w.value + ', ' + el.dataset.v) : el.dataset.v; };
  UI.actions['e-tpl'] = function (el) {
    document.querySelectorAll('[data-act="e-tpl"]').forEach(function (c) { c.classList.toggle('on', c === el); });
    var t = TPL[+el.dataset.k], ti = $('#e-title'); if (!ti.value.trim()) ti.value = t[0]; else if (ti.value.indexOf(t[0]) < 0) ti.value = ti.value + ' ' + t[0];
    E.repeat = t[1]; document.querySelectorAll('[data-act="e-rep"]').forEach(function (b) { b.classList.toggle('on', b.dataset.v === t[1]); }); $('#e-until-row').hidden = !t[1];
    setAllday(!!t[2]); var sw = document.querySelector('[data-act="e-col"][data-v="' + t[3] + '"]'); if (sw) UI.actions['e-col'](sw);
  };
  UI.actions['e-save'] = async function () {
    E.title = $('#e-title').value.trim(); var dd = $('#e-date').value; if (!E.title) return UI.toast('일정 이름을 써 주세요'); if (!U.parse(dd)) return UI.toast('날짜를 골라 주세요');
    if (E.allday == 1) { var en = $('#e-end').value; if (en && en < dd) return UI.toast('끝나는 날이 시작일보다 빨라요'); E.start = dd; E.end = en && en > dd ? en : ''; }
    else { var st = $('#e-time').value || '10:00', et = $('#e-endtime').value; if (et && et <= st) return UI.toast('끝 시간이 시작 시간보다 빨라요'); E.start = dd + ' ' + st; E.end = et ? dd + ' ' + et : ''; }
    E.until = E.repeat ? ($('#e-until').value || '') : ''; if (E.until && E.until < dd) return UI.toast('반복 끝나는 날을 확인해 주세요');
    E.category = $('#e-cat').value || '일정'; E.place = $('#e-place').value.trim(); E.who = $('#e-who').value.trim(); E.memo = $('#e-memo').value.trim(); E.cost = U.parseInput($('#e-cost').value) || 0;
    var orig = E0, linked = E.link ? St.get(E.link) : null, linkedBefore = linked ? Object.assign({}, linked) : null;
    if (E.cost > 0 && !E.repeat) {
      var row = Object.assign({}, linked || { id: U.uid(), type: 'budget', repeat: '변동', amount: 0, from: '', to: '', memo1: '', memo2: '' }, { date: dd, category: E.category, usage: E.title, budget: E.cost, memo2: '일정' });
      var sv = await St.save(row); E.link = sv.id;
    } else if (linked) { await St.remove(linked.id); E.link = ''; }
    var saved = X.put('events', E); S.calSel = dd; if (S.tab === 'cal') S.month = dd.slice(0, 7); UI.closeSheet(); UI.render();
    UI.toast('일정 저장 · ' + md(dd) + (E.cost && !E.repeat ? ' · 예산 ' + U.num(E.cost) + '원' : E.cost ? ' · 반복이라 예산 제외' : ''), { kind: 'ok', action: { label: '되돌리기', fn: async function () {
      if (orig) { if (linkedBefore) await St.save(linkedBefore); else if (saved.link && St.get(saved.link)) await St.remove(saved.link); X.put('events', orig); }
      else { X.del('events', saved.id); if (saved.link && St.get(saved.link)) await St.remove(saved.link); }
      UI.render();
    } } });
  };
  UI.actions['e-del'] = async function () {
    var b = X.del('events', E.id), lk = b && b.link ? St.get(b.link) : null, lkCopy = lk ? Object.assign({}, lk) : null;
    if (lk) await St.remove(lk.id);
    UI.closeSheet(); UI.render();
    UI.toast('일정을 지웠어요', { action: { label: '되돌리기', fn: async function () { var keep = b.link; if (lkCopy) { var sv = await St.save(Object.assign({}, lkCopy, { id: U.uid(), rev: 0 })); keep = sv.id; } X.put('events', Object.assign({}, b, { deleted: 0, link: lkCopy ? keep : '' })); UI.render(); } } });
  };

  /* ───── 저금통 ───── */
  UI.views.jar = {
    render: function () {
      var d = UI.derive(), gs = X.list('goals');
      var h = '<div class="row" style="margin-bottom:10px;justify-content:flex-end"><button class="btn soft sm" data-act="g-new">' + UI.ic('plus', 2.2) + '새 목표</button></div>';
      if (!gs.length) return h + '<div class="card"><div class="empty"><b>모으고 싶은 목표를 만들어 보세요</b>예: 가족여행 300만 원 · #가족여행 지출은 자동으로 합산돼요</div></div>';
      return h + gs.map(function (g) {
        var tagSum = 0; if (g.tag) d.rows.forEach(function (r) { if (r.type === 'expense' && (r.memo1 + ' ' + r.memo2 + ' ' + r.usage).indexOf(String(g.tag).replace(/^#/, '')) >= 0) tagSum += r.amount || 0; });
        var saved = (+g.saved || 0), ratio = g.target ? Math.min(1, saved / g.target) : 0, left = Math.max(0, (g.target || 0) - saved), days = g.due ? Math.max(1, U.diffDays(g.due, d.today)) : 0;
        return '<div class="card"><div class="goal"><div class="jar"><i style="height:' + Math.round(ratio * 100) + '%"></i></div><div class="grow"><div class="t1">' + esc(g.name) + (g.due ? ' · ' + g.due.slice(5).replace('-', '/') : '') + '</div>' +
          '<div class="big num" style="font-size:1.35rem"><span class="m">' + U.num(saved) + '</span><small> / ' + U.num(g.target) + '원</small></div>' +
          '<div class="t2">' + (days && left ? '하루 ' + U.num(left / days) + '원씩이면 도착' : left ? '남은 ' + U.num(left) + '원' : '목표 달성!') + (g.tag ? ' · ' + esc(g.tag) + ' 지출 ' + U.num(tagSum) : '') + '</div></div></div>' +
          '<div class="row" style="gap:8px;margin-top:10px"><button class="btn soft grow" data-act="g-add" data-id="' + esc(g.id) + '" data-v="10000">＋1만</button><button class="btn soft grow" data-act="g-add" data-id="' + esc(g.id) + '" data-v="50000">＋5만</button><button class="btn ghost grow" data-act="g-edit" data-id="' + esc(g.id) + '">수정</button></div></div>';
      }).join('');
    }
  };
  UI.actions['g-add'] = function (el) {
    var g = X.get('goals', el.dataset.id); if (!g) return; var v = +el.dataset.v, before = +g.saved || 0;
    X.put('goals', Object.assign({}, g, { saved: before + v })); UI.render();
    UI.toast('저금통에 ' + U.num(v) + '원', { kind: 'ok', action: { label: '되돌리기', fn: function () { var cur = X.get('goals', g.id); X.put('goals', Object.assign({}, cur, { saved: before })); UI.render(); } } });
  };
  function goalSheet(g) {
    g = g || {};
    UI.sheet('<div class="sh"><b>' + (g.id ? '목표 수정' : '새 목표') + '</b>' + x() + '</div>' +
      '<input id="g-name" class="input" placeholder="예: 가족여행" value="' + esc(g.name || '') + '" style="margin-bottom:8px">' +
      '<div class="row" style="gap:8px;margin-bottom:8px"><input id="g-target" class="input num" inputmode="numeric" placeholder="목표 금액" value="' + (g.target ? U.fmtInput(g.target) : '') + '" style="flex:1"><input id="g-due" type="date" class="input" value="' + (g.due || '') + '" style="flex:1"></div>' +
      '<div class="row" style="gap:8px;margin-bottom:10px"><input id="g-tag" class="input" placeholder="#태그 (지출 합산)" value="' + esc(g.tag || '') + '" style="flex:1"><input id="g-saved" class="input num" inputmode="numeric" placeholder="모은 금액" value="' + (g.saved ? U.fmtInput(g.saved) : '') + '" style="flex:1"></div>' +
      '<div class="row" style="gap:8px">' + (g.id ? '<button class="btn ghost danger-t" data-act="g-del" data-id="' + esc(g.id) + '" style="flex:1">삭제</button>' : '') + '<button class="btn" data-act="g-save" data-id="' + esc(g.id || '') + '" style="flex:2">저장</button></div>');
  }
  UI.actions['g-new'] = function () { goalSheet(); };
  UI.actions['g-edit'] = function (el) { goalSheet(X.get('goals', el.dataset.id)); };
  UI.actions['g-save'] = function (el) {
    var name = $('#g-name').value.trim(), target = U.parseInput($('#g-target').value); if (!name || !target) return UI.toast('이름과 목표 금액을 넣어 주세요');
    var cur = el.dataset.id ? X.get('goals', el.dataset.id) : {};
    X.put('goals', Object.assign({}, cur, { name: name, target: target, due: $('#g-due').value, tag: $('#g-tag').value.trim(), saved: U.parseInput($('#g-saved').value) || 0 })); UI.closeSheet(); UI.render(); UI.toast('목표를 저장했어요', { kind: 'ok' });
  };
  UI.actions['g-del'] = function (el) { var b = X.del('goals', el.dataset.id); UI.closeSheet(); UI.render(); UI.toast('목표를 지웠어요', { action: { label: '되돌리기', fn: function () { X.put('goals', Object.assign({}, b, { deleted: 0 })); UI.render(); } } }); };

  /* ───── 내역 ↔ 달력: 같은 탭 안에서 바꿔 보기 ───── */
  function listCalSeg(on) { return '<div class="seg2" style="margin-bottom:10px"><button class="' + (on === 'entries' ? 'on' : '') + '" data-act="tab" data-tab="entries">' + UI.ic('list', 2) + ' 목록</button><button class="' + (on === 'cal' ? 'on' : '') + '" data-act="tab" data-tab="cal">' + UI.ic('cal', 2) + ' 달력</button></div>'; }
  /* 4.0: 달력은 '하루' 탭의 주간 띠·한 달 보기로 옮김 (ui-day.js) */

  /* ───── 오늘 화면에 일정·노트 더하기 / 동기화 연결 ───── */
  var homeRender = UI.views.home.render;
  UI.views.home.render = function () {
    var h = homeRender(), d = UI.derive(), evs = X.eventsIn(d.today, U.addDays(d.today, 7)).slice(0, 4), notes = X.list('notes').filter(function (n) { return n.date === d.today; });
    var add = '';
    if (evs.length) add += '<div class="sec row between"><span>다가오는 일정</span><button class="link" data-act="tab" data-tab="cal">달력 ›</button></div><div class="grp">' + evs.map(function (e) { var q = U.parse(e.date); return '<button class="r" data-act="ev-edit" data-id="' + esc(e.ev.id) + '"><span class="st num" style="background:var(--plan);font-weight:800;font-size:.8rem">' + q.d + '</span><span class="t">' + esc(e.ev.title) + '</span><span class="v">' + (e.date === d.today ? '오늘 ' : WD[U.weekday(e.date)] + ' ') + (e.time || '') + (e.ev.cost ? ' · ' + U.num(e.ev.cost) : '') + '</span></button>'; }).join('') + '</div>';
    add += '<div class="card row" style="gap:12px"><span class="st" style="background:var(--note)">' + UI.ic('note', 2) + '</span><div class="grow"><b class="t1">' + (notes.length ? esc(notes[0].secret == 1 ? '비밀 노트' : notes[0].title || String(notes[0].body).slice(0, 24)) : '오늘 하루는 어땠나요?') + '</b><div class="t2">' + (notes.length ? '오늘 노트 ' + notes.length + '편' : '한 줄이면 충분해요') + '</div></div><button class="btn soft sm" data-act="' + (notes.length ? 'note-edit' : 'note-new') + '"' + (notes.length ? ' data-id="' + esc(notes[0].id) + '"' : '') + '>' + (notes.length ? '보기' : '쓰기') + '</button></div>';
    return h.replace('<div class="sec row between"><span>오늘의 하루', add + '<div class="sec row between"><span>오늘의 하루');
  };
  X.on(function () { if (!$('#app').hidden) UI.scheduleRender(); });
  var runSync = UI.runSync;
  UI.runSync = async function (o) { var r = await runSync(o); X.sync().then(function (s) { if (s.ok) UI.scheduleRender(); }); return r; };
  setTimeout(function () { X.sync(); }, 2500);
  root.addEventListener('online', function () { X.sync(); });
})(typeof window !== 'undefined' ? window : globalThis);
