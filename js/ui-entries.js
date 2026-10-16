/* 내역 — 검색/필터/날짜별 묶음, 고정비 복사(미리보기·회차 자동 증가·중복 방지) */
(function (root) {
  'use strict';
  var AB = root.AB, U = AB.util, C = AB.calc, St = AB.store, UI = AB.ui;
  var esc = U.esc, S = UI.S;
  S.limit = 250;

  function filtered(d) {
    var rows = d.rows;
    if (!S.allTime) rows = rows.filter(function (r) { return r.date >= d.range.start && r.date <= d.range.end; });
    var q = S.q.trim().toLowerCase();
    rows = rows.filter(function (r) {
      if (S.fType === 'all') { if (r.type === 'budget' && !S.showBudget) return false; } else if (r.type !== S.fType) return false;
      if (S.fRepeat !== 'all' && r.repeat !== S.fRepeat) return false;
      if (S.fAcct && r.from !== S.fAcct && r.to !== S.fAcct) return false;
      if (S.fCat && r.category !== S.fCat) return false;
      if (q && [r.usage, r.category, r.from, r.to, r.memo1, r.memo2].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    return C.sortRows(rows);
  }

  function listHtml(d) {
    var rows = filtered(d), shown = rows.slice(0, S.limit);
    var exp = 0, inc = 0;
    rows.forEach(function (r) { if (r.type === 'expense') exp += r.amount; else if (r.type === 'income') inc += r.amount; });
    var sum = '<div class="row between small muted" style="padding:2px 2px 6px"><span>' + rows.length + '건' + (S.allTime ? ' · 전체 기간' : '') + '</span><span class="num">' +
      (exp ? '지출 <b class="exp">−' + U.num(exp) + '</b>' : '') + (exp && inc ? ' · ' : '') + (inc ? '수입 <b class="inc">+' + U.num(inc) + '</b>' : '') + '</span></div>';
    if (!rows.length) {
      return sum + '<div class="empty"><div class="em">🔎</div><b>조건에 맞는 내역이 없어요</b>' + (S.q || S.fAcct || S.fCat || S.fType !== 'all' || S.fRepeat !== 'all' ? '필터를 바꾸거나 "전체 기간"을 켜 보세요.' : '＋ 버튼으로 첫 내역을 입력해 보세요.') + '</div>';
    }
    var h = sum, last = null, byDay = U.groupBy(shown, function (r) { return r.date; });
    shown.forEach(function (r) {
      if (r.date !== last) {
        last = r.date;
        var dayExp = byDay[r.date].reduce(function (s, x) { return s + (x.type === 'expense' ? x.amount : 0); }, 0), p = U.parse(r.date);
        h += '<div class="daygrp"><span>' + (S.allTime ? p.y + '.' : '') + p.m + '월 ' + p.d + '일 ' + U.dow(r.date) + (r.date === d.today ? ' · 오늘' : '') + '</span><span class="num exp">' + (dayExp ? '−' + U.num(dayExp) : '') + '</span></div>';
      }
      h += UI.row(r, d.today);
    });
    if (rows.length > shown.length) h += '<div class="center" style="padding:14px"><button class="btn ghost sm" data-act="more">' + (rows.length - shown.length) + '건 더 보기</button></div>';
    return h;
  }

  function opts(list, cur, allLabel) {
    return '<option value="">' + allLabel + '</option>' + list.map(function (n) { return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
  }

  UI.views.entries = {
    render: function () {
      var d = UI.derive();
      var types = [['all', '전체'], ['expense', '지출'], ['income', '수입'], ['transfer', '이체'], ['budget', '예산']];
      var h = '<div class="toolbar"><div class="suffix-wrap" style="margin-bottom:8px"><input id="q" class="input" data-in="q" type="search" placeholder="내역·항목·계정·메모 검색" value="' + esc(S.q) + '" autocomplete="off"></div>' +
        '<div class="chips scroll">' + types.map(function (t) { return '<button class="chip' + (S.fType === t[0] ? ' on' : '') + '" data-act="ftype" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
        '<div class="chips scroll" style="margin-top:6px">' +
        ['all:반복 전체', '고정:고정', '변동:변동'].map(function (x) { var p = x.split(':'); return '<button class="chip' + (S.fRepeat === p[0] ? ' on' : '') + '" data-act="frepeat" data-v="' + p[0] + '">' + p[1] + '</button>'; }).join('') +
        '<button class="chip' + (S.allTime ? ' on' : '') + '" data-act="toggle" data-k="allTime">전체 기간</button>' +
        '<button class="chip' + (S.showBudget ? ' on' : '') + '" data-act="toggle" data-k="showBudget">예산 행 보기</button>' +
        '<button class="chip' + (S.filtersOpen || S.fAcct || S.fCat ? ' on' : '') + '" data-act="toggle" data-k="filtersOpen">계정·항목</button>' +
        '<button class="chip blue" data-act="fixed-copy">고정비 복사</button></div>';
      if (S.filtersOpen || S.fAcct || S.fCat) {
        h += '<div class="row" style="margin-top:8px;gap:8px"><select class="select" data-ch="fAcct">' + opts(d.eff.accounts.map(function (a) { return a.name; }), S.fAcct, '모든 계정') + '</select>' +
          '<select class="select" data-ch="fCat">' + opts(d.eff.expenses.concat(d.eff.incomes), S.fCat, '모든 항목') + '</select></div>';
      }
      h += '</div><div id="entry-list">' + listHtml(d) + '</div>';
      return h;
    }
  };
  function refreshList() { var el = document.getElementById('entry-list'); if (el) el.innerHTML = listHtml(UI.derive()); }

  UI.inputs.q = function (el) { S.q = el.value; S.limit = 250; refreshList(); };
  UI.changes.fAcct = function (el) { S.fAcct = el.value; S.limit = 250; UI.render(); };
  UI.changes.fCat = function (el) { S.fCat = el.value; S.limit = 250; UI.render(); };
  UI.actions.ftype = function (el) { S.fType = el.dataset.v; S.limit = 250; UI.render(); };
  UI.actions.frepeat = function (el) { S.fRepeat = el.dataset.v; S.limit = 250; UI.render(); };
  UI.actions.toggle = function (el) { var k = el.dataset.k; S[k] = !S[k]; S.limit = 250; UI.render(); };
  UI.actions.more = function () { S.limit += 250; refreshList(); };

  /* ───── 고정비 복사 ───── */
  var fc = { dst: null, plan: [] };
  function fcHtml() {
    var d = UI.derive(), src = S.month, items = fc.plan, make = items.filter(function (i) { return i.row; }).length;
    var dstOpts = [1, 2, 3].map(function (n) { var m = U.shiftMonth(src, n), p = U.parse(m + '-01'); return '<option value="' + m + '"' + (m === fc.dst ? ' selected' : '') + '>' + p.y + '년 ' + p.m + '월로</option>'; }).join('');
    var p = U.parse(src + '-01');
    var h = '<div class="sh-head"><h2>고정비 복사</h2><button class="icon-btn" data-act="close" aria-label="닫기">' + UI.icon('x') + '</button></div>' +
      '<p class="hint" style="margin-bottom:10px">' + p.y + '년 ' + p.m + '월의 <b>고정</b> 내역을 복사합니다. 이미 있는 내역은 건너뛰고, 메모의 <b>★ N회</b>는 자동으로 1 올라가요.</p>' +
      '<select class="select" data-ch="fc-dst" style="margin-bottom:10px">' + dstOpts + '</select>';
    if (!items.length) return h + '<div class="empty"><div class="em">📋</div><b>복사할 고정 내역이 없어요</b>내역을 입력할 때 반복을 "고정"으로 설정하면 여기서 복사할 수 있어요.</div>';
    h += '<div class="row between small" style="margin-bottom:6px"><b>복사할 내역 ' + make + '건</b><span class="muted">건너뜀 ' + (items.length - make) + '건</span></div><div style="max-height:46vh;overflow:auto;margin-bottom:12px">';
    items.forEach(function (it, i) {
      var r = it.row || it.src, amt = r.type === 'budget' ? r.budget : r.amount;
      h += '<label class="li" style="cursor:pointer;' + (it.skip ? 'opacity:.5' : '') + '"><input type="checkbox" data-ch="fc-check" data-i="' + i + '" ' + (it.row ? 'checked' : 'disabled') + ' style="width:20px;height:20px">' +
        '<div class="main"><div class="t1">' + esc(r.usage || r.category || '(내용 없음)') + '</div><div class="t2">' + esc((it.row ? it.row.date.slice(5) : it.src.date.slice(5)) + ' · ' + (C.TYPE_LABEL[r.type]) + (r.category ? ' · ' + r.category : '') + (it.skip ? ' · ' + it.skip : (it.row.memo1 !== it.src.memo1 ? ' · ' + it.row.memo1 : ''))) + '</div></div>' +
        '<div class="amt num ' + r.type + '">' + U.num(amt) + '</div></label>';
    });
    return h + '</div><button class="btn block" data-act="fc-run"' + (make ? '' : ' disabled') + '>' + make + '건 복사하기</button>';
  }
  function fcPlan() { fc.plan = AB.smart.planFixedCopy(UI.derive().rows, S.month, fc.dst); fc.plan.forEach(function (i) { i.on = !!i.row; }); }
  UI.actions['fixed-copy'] = function () { fc.dst = U.shiftMonth(S.month, 1); fcPlan(); UI.sheet(fcHtml()); };
  UI.changes['fc-dst'] = function (el) { fc.dst = el.value; fcPlan(); UI.sheet(fcHtml()); };
  UI.changes['fc-check'] = function (el) { fc.plan[+el.dataset.i].on = el.checked; var n = fc.plan.filter(function (i) { return i.row && i.on; }).length; var b = document.querySelector('[data-act="fc-run"]'); if (b) { b.textContent = n + '건 복사하기'; b.disabled = !n; } };
  UI.actions['fc-run'] = async function () {
    var rows = fc.plan.filter(function (i) { return i.row && i.on; }).map(function (i) { return i.row; });
    if (!rows.length) return;
    var saved = await St.saveMany(rows, { bulk: rows.length > 25 });
    UI.closeSheet();
    var ids = saved.map(function (r) { return r.id; }), p = U.parse(fc.dst + '-01');
    UI.toast(p.m + '월로 ' + rows.length + '건을 복사했어요', { kind: 'ok', action: { label: '되돌리기', fn: function () { St.removeMany(ids); } } });
    S.month = fc.dst; UI.render();
  };

})(typeof window !== 'undefined' ? window : globalThis);
