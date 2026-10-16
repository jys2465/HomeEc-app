/* 홈 — "지금 내 가계가 계획 대비 어떤 상태인가"를 한 화면에 */
(function (root) {
  'use strict';
  var AB = root.AB, U = AB.util, C = AB.calc, St = AB.store, Sy = AB.sync, UI = AB.ui, S = AB.smart;
  var esc = U.esc, won = U.won;

  function statusChip(t) {
    if (t.status === 'ok') {
      if (!t.planMonth) return '';
      if (!t.actual) return '<span class="chip">아직 쓴 내역이 없어요</span>';
      return t.left > 0 ? '<span class="chip ok">순항 중 · 계획보다 ' + won(t.left) + ' 덜 썼어요</span>' : '<span class="chip ok">계획대로 가는 중</span>';
    }
    if (t.status === 'near') return '<span class="chip near">계획 속도보다 ' + won(-t.left) + ' 빨라요</span>';
    if (t.status === 'over') return '<span class="chip over">월 계획을 ' + won(t.actual - t.planMonth) + ' 넘었어요</span>';
    if (t.status === 'unplanned') return '<span class="chip blue">계획 없이 쓴 지출이에요</span>';
    return '';
  }

  function hero(d) {
    var t = d.budget.total, p = U.parse(d.month + '-01');
    var label = d.isCurrent ? '이번 달 지출' : (d.isPast ? p.m + '월 지출' : p.m + '월 (아직 시작 전)');
    var h = '<div class="card hero"><div class="row between"><span class="label">' + label + '</span>' +
      (d.audit.ok && !d.audit.errors ? '<button class="chip ok" data-act="audit">검증 정상</button>' : '<button class="chip bad" data-act="audit">검증 필요 ' + (d.audit.errors || '') + '</button>') + '</div>' +
      '<div class="big num">' + won(t.actual) + '</div>';
    if (t.planMonth) {
      h += '<div class="sub">월 계획 <b class="num">' + won(t.planMonth) + '</b> · 오늘까지 계획 <b class="num">' + won(t.planToDate) + '</b></div>' + UI.gauge(t) + UI.gaugeLegend();
      h += '<div style="margin-top:10px">' + statusChip(t) + '</div>';
      if (!d.isPast && t.projected > t.actual) h += '<div class="sub" style="margin-top:8px">남은 예정 지출까지 더하면 월말 약 <b class="num">' + won(t.projected) + '</b> (월 계획 대비 ' + (t.projected - t.planMonth >= 0 ? '+' : '−') + U.num(Math.abs(t.projected - t.planMonth)) + '원)</div>';
    } else {
      h += '<div class="sub">이 달에는 예산 행이 없어서 계획 대비 비교를 숨겼어요. 내역에서 유형을 <b>예산</b>으로 입력하면 속도계가 켜져요.</div>';
    }
    var net = d.totals.income - d.totals.expense;
    h += '<div class="mini3"><div><div class="k">수입</div><div class="v num inc">+' + U.num(d.totals.income) + '</div></div>' +
      '<div><div class="k">지출</div><div class="v num exp">−' + U.num(d.totals.expense) + '</div></div>' +
      '<div><div class="k">수지</div><div class="v num ' + (net >= 0 ? 'inc' : 'exp') + '">' + (net >= 0 ? '+' : '−') + U.num(Math.abs(net)) + '</div></div></div></div>';
    return h;
  }

  function quick(d) {
    var list = S.suggest(d.idx, '', 'expense', 7).filter(function (x) { return x.row.type === 'expense'; });
    if (!list.length) return '';
    return '<div class="card"><h3>빠른 입력 <span class="faint tiny">자주 쓰는 내역</span></h3><div class="chips scroll">' +
      list.map(function (x) { return '<button class="chip" data-act="quick" data-u="' + esc(x.usage) + '">' + esc(x.usage.length > 14 ? x.usage.slice(0, 13) + '…' : x.usage) + '</button>'; }).join('') + '</div></div>';
  }

  function funding(d) {
    if (d.isPast) return '';
    var f = d.funding, anyNeed = d.acct.list.some(function (a) { return a.need > 0; });
    if (!f.deficits.length) {
      return anyNeed ? '<div class="banner good"><span>✓</span><div><b>이번 달 자금 흐름은 안정적이에요</b>남은 예정 지출을 모두 낼 만큼 각 계정에 돈이 있어요.</div></div>' : '';
    }
    var h = '<div class="card"><h3>자금 부족 예보 <span class="exp num">−' + won(f.deficitTotal) + '</span></h3>';
    f.deficits.forEach(function (x) {
      var a = d.acct.byName[x.name];
      h += '<div class="fund-row"><div class="row between"><b>' + esc(x.name) + '</b><span class="exp num">' + won(x.need) + ' 부족</span></div>' +
        '<div class="tiny muted num">월말까지 필요 ' + won(a.need) + ' · 현재 잔액 ' + U.signed(a.balance).replace('+', '') + '</div></div>';
    });
    if (f.transfers.length) {
      h += '<div class="sec-title" style="margin-top:12px">이렇게 옮기면 해결돼요</div>';
      f.transfers.forEach(function (t) {
        h += '<div class="row between" style="padding:6px 0"><div class="grow"><b>' + esc(t.from) + '</b> → <b>' + esc(t.to) + '</b><div class="num exp small" style="color:var(--ink)">' + won(t.amount) + '</div></div>' +
          '<button class="btn sm soft" data-act="fund" data-from="' + esc(t.from) + '" data-to="' + esc(t.to) + '" data-amt="' + t.amount + '">이체 기록</button></div>';
      });
    }
    if (f.unmet > 0) h += '<div class="banner bad" style="margin:10px 0 0"><span>!</span><div><b>추천 이체를 모두 해도 ' + won(f.unmet) + '이 모자라요</b>남은 수입 예정(급여 등)이 있는지 확인해 보세요.</div></div>';
    return h + '</div>';
  }

  function cards(d) {
    var list = d.cards.filter(function (c) { return c.owed > 0 || c.billingDay; });
    if (!list.length) return '';
    var h = '<div class="card"><h3>카드 결제 일정</h3>';
    list.forEach(function (c) {
      var due = c.due ? '<span class="chip ' + (c.dDay <= 3 ? 'near' : '') + '">D-' + c.dDay + ' · ' + c.due.slice(5).replace('-', '/') + '</span>' : '<button class="chip" data-act="go" data-tab="settings">결제일 설정</button>';
      var pay = c.payFrom ? '<span class="chip ' + (c.enough ? 'ok' : 'bad') + '">' + esc(c.payFrom) + (c.enough ? ' 잔액 충분' : ' 잔액 부족') + '</span>' : '<span class="faint tiny">결제계좌 미설정</span>';
      h += '<div class="fund-row"><div class="row between"><b>' + esc(c.name) + '</b><span class="num ' + (c.owed ? 'exp' : 'muted') + '">' + (c.owed ? won(c.owed) : '미결제 없음') + '</span></div>' +
        '<div class="row between wrap" style="margin-top:6px;gap:6px">' + due + pay + '</div></div>';
    });
    return h + '</div>';
  }

  function hot(d) {
    var list = d.budget.list.filter(function (b) { return b.status === 'near' || b.status === 'over' || b.status === 'unplanned'; })
      .sort(function (a, b) { return (b.actual - b.planToDate) - (a.actual - a.planToDate); }).slice(0, 3);
    if (!list.length) return '';
    return '<div class="card"><h3>속도가 빠른 항목 <button class="link" data-act="go" data-tab="analysis" data-ana="budget">전체 보기</button></h3>' +
      list.map(function (b) {
        return '<div class="bgt"><div class="row between"><span class="nm">' + esc(b.name) + '</span><span class="nums num">' + U.num(b.actual) + ' / ' + U.num(b.planMonth) + '원</span></div>' + UI.gauge(b) +
          '<div class="tiny ' + (b.status === 'over' ? 'exp' : 'wrn') + '">' + (b.planToDate ? '계획 속도의 ' + Math.round(b.useRatio * 100) + '%' : '계획 없이 사용') + '</div></div>';
      }).join('') + '</div>';
  }

  function recent(d) {
    var list = C.sortRows(d.rows.filter(function (r) { return r.type !== 'budget' && r.date <= d.today; })).slice(0, 5);
    if (!list.length) return '';
    return '<div class="card"><h3>최근 내역 <button class="link" data-act="go" data-tab="entries">전체 보기</button></h3>' + list.map(function (r) { return UI.row(r, d.today); }).join('') + '</div>';
  }

  function onboarding() {
    var configured = Sy.configured();
    return '<div class="card"><div class="empty"><div class="em">📒</div><b>' + (configured ? '시트에서 내역을 불러오는 중이에요' : '처음 오셨네요') + '</b>' +
      (configured ? '잠시만 기다려 주세요. 오래 걸리면 아래 버튼을 눌러 보세요.' : '구글 시트를 연결하면 기존 내역이 모두 내려와요.<br>연결 없이 쓰려면 ＋ 버튼으로 직접 입력하세요.') +
      '<div class="row" style="justify-content:center;margin-top:14px;gap:8px">' +
      (configured ? '<button class="btn" data-act="sync">지금 동기화</button>' : '<button class="btn" data-act="go" data-tab="settings">시트 연결하기</button><button class="btn ghost" data-act="add">직접 입력</button>') +
      '</div></div></div>';
  }

  UI.views.home = {
    render: function () {
      var d = UI.derive(), h = '';
      if (!d.rows.length) return onboarding();
      var nc = St.conflicts().length;
      if (nc) h += '<div class="banner"><span>⚠</span><div><b>다른 곳에서 먼저 바뀐 내역이 ' + nc + '건 있어요</b>내 변경은 보관해 뒀어요. <button class="link" style="color:var(--brand);font-weight:700" data-act="go" data-tab="settings">설정에서 확인</button></div></div>';
      return h + hero(d) + quick(d) + funding(d) + cards(d) + hot(d) + recent(d);
    }
  };

  UI.actions.quick = function (el) { UI.openAdd({ usage: el.dataset.u, fromSuggestion: true }); };
  UI.actions.fund = async function (el) {
    var d = UI.derive(), amt = +el.dataset.amt, from = el.dataset.from, to = el.dataset.to;
    var saved = await St.save({ id: U.uid(), date: d.today, type: 'transfer', repeat: '변동', category: '', usage: '자금이동(부족 예보)', budget: 0, amount: amt, from: from, to: to, memo1: '', memo2: '' });
    UI.toast(from + ' → ' + to + ' ' + won(amt) + ' 이체를 기록했어요', { action: { label: '되돌리기', fn: function () { St.remove(saved.id); } } });
  };

})(typeof window !== 'undefined' ? window : globalThis);
