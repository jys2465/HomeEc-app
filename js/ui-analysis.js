/* 분석 — 예산(속도계) / 자산(계정별 이월·입출금·잔액·부족) / 통계(도넛·월별·추이) + 정합성 점검 + 시트 대조 */
(function (root) {
  'use strict';
  var AB = root.AB, U = AB.util, C = AB.calc, St = AB.store, Sy = AB.sync, UI = AB.ui, Ch = AB.charts;
  var esc = U.esc, won = U.won, S = UI.S;
  var chartData = null;

  /* ───── 예산 ───── */
  var RANK = { over: 0, near: 1, unplanned: 2, ok: 3 };
  function budgetView(d) {
    var t = d.budget.total;
    var h = '<div class="card"><h3>' + (d.isCurrent ? '이번 달 예산 진도' : '예산 진도') + '</h3>' +
      '<div class="row between"><div><div class="tiny muted">실제 사용</div><div class="num" style="font-size:1.4rem;font-weight:800">' + won(t.actual) + '</div></div>' +
      '<div class="right"><div class="tiny muted">오늘까지 계획</div><div class="num" style="font-size:1.1rem;font-weight:700">' + won(t.planToDate) + '</div></div></div>' +
      (t.planMonth ? UI.gauge(t) + UI.gaugeLegend() +
        '<div class="mini3"><div><div class="k">월 예산</div><div class="v num">' + U.num(t.planMonth) + '</div></div><div><div class="k">예산−사용</div><div class="v num ' + (t.left >= 0 ? 'inc' : 'exp') + '">' + (t.left >= 0 ? '' : '−') + U.num(Math.abs(t.left)) + '</div></div>' +
        '<div><div class="k">월말 예상</div><div class="v num">' + U.num(t.projected) + '</div></div></div>' : '<p class="hint" style="margin-top:8px">이 달에는 예산 행이 없어요.</p>') + '</div>';
    var list = d.budget.list.slice().sort(function (a, b) { return RANK[a.status] - RANK[b.status] || (b.actual - b.planToDate) - (a.actual - a.planToDate); });
    if (!list.length) return h + '<div class="empty"><div class="em">🎯</div><b>예산 항목이 없어요</b>내역에서 유형을 "예산"으로 입력하면 여기에 속도계가 나타나요.</div>';
    h += '<div class="card"><h3>항목별 속도계</h3>';
    list.forEach(function (b) {
      var chip = { over: '<span class="chip over">월 예산 초과</span>', near: '<span class="chip near">속도 초과</span>', unplanned: '<span class="chip blue">계획 없음</span>', ok: '<span class="chip ok">순항</span>' }[b.status];
      h += '<div class="bgt"><div class="row between"><span class="nm">' + esc(b.name) + '</span>' + chip + '</div>' + UI.gauge(b) +
        '<div class="row between nums num"><span>' + U.num(b.actual) + ' / ' + U.num(b.planMonth) + '원</span><span>' + (b.planToDate ? '속도의 ' + Math.round(b.useRatio * 100) + '%' : '') + '</span></div>' +
        (b.futureAmount > 0 && !d.isPast ? '<div class="tiny faint">남은 예정 ' + U.num(b.futureAmount) + '원 → 월말 예상 ' + U.num(b.projected) + '원</div>' : '') + '</div>';
    });
    h += '</div><div class="card"><details><summary class="small" style="font-weight:700;cursor:pointer">표로 보기 (시트 sumary 형식)</summary><table class="tbl num" style="margin-top:8px"><tr><th>항목</th><th>월예산</th><th>누계예산</th><th>누계사용</th><th>예산−사용</th></tr>' +
      d.budget.list.map(function (b) { return '<tr><td>' + esc(b.name) + '</td><td>' + U.num(b.planMonth) + '</td><td>' + U.num(b.planToDate) + '</td><td>' + U.num(b.actual) + '</td><td class="' + (b.left < 0 ? 'exp' : '') + '">' + U.num(b.left) + '</td></tr>'; }).join('') +
      '<tr style="font-weight:800"><td>합계</td><td>' + U.num(t.planMonth) + '</td><td>' + U.num(t.planToDate) + '</td><td>' + U.num(t.actual) + '</td><td class="' + (t.left < 0 ? 'exp' : '') + '">' + U.num(t.left) + '</td></tr></table></details></div>';
    return h;
  }

  /* ───── 자산 ───── */
  var KIND_ORDER = ['bank', 'cash', 'card', 'saving', 'invest'];
  function accountsView(d) {
    var t = d.acct.total, kinds = {};
    d.eff.accounts.forEach(function (a) { kinds[a.name] = a; });
    var vis = d.acct.list.filter(function (a) { return (a.open || a.in || a.out || a.need || a.balance) && !(kinds[a.name] && kinds[a.name].hidden); });
    var h = '<div class="card hero"><div class="label">전체 계정 잔액 (기준일 ' + d.asOf.slice(5).replace('-', '/') + ')</div><div class="big num">' + won(t.balance) + '</div>' +
      '<div class="mini3"><div><div class="k">이월</div><div class="v num">' + U.num(t.open) + '</div></div><div><div class="k">입금</div><div class="v num inc">+' + U.num(t.in) + '</div></div><div><div class="k">출금</div><div class="v num exp">−' + U.num(t.out) + '</div></div></div>' +
      '<div class="row" style="margin-top:12px;gap:8px"><button class="btn sm soft" data-act="sheet-compare">시트와 대조</button>' + (d.audit.ok && !d.audit.errors ? '<button class="chip ok" data-act="audit">검증 정상</button>' : '<button class="chip bad" data-act="audit">검증 필요</button>') + '</div></div>';
    KIND_ORDER.forEach(function (k) {
      var g = vis.filter(function (a) { return (kinds[a.name] ? kinds[a.name].kind : C.guessKind(a.name)) === k; });
      if (!g.length) return;
      var sub = g.reduce(function (s, a) { return s + a.balance; }, 0);
      h += '<div class="card"><h3>' + C.KIND_LABEL[k] + '<span class="num ' + (sub < 0 ? 'exp' : '') + '">' + U.signed(sub).replace('+', '') + '</span></h3>';
      g.forEach(function (a) {
        h += '<div class="acct"><div class="row between"><b>' + esc(a.name) + '</b><span class="num ' + (a.balance < 0 ? 'exp' : '') + '" style="font-size:1.1rem;font-weight:800">' + U.signed(a.balance).replace('+', '') + '</span></div>' +
          '<div class="grid4 num"><div><div class="k">이월</div><div class="v">' + U.num(a.open) + '</div></div><div><div class="k">입금</div><div class="v inc">' + U.num(a.in) + '</div></div><div><div class="k">출금</div><div class="v exp">' + U.num(a.out) + '</div></div><div><div class="k">남은 필요</div><div class="v">' + U.num(a.need) + '</div></div></div>' +
          (a.short < 0 ? '<div style="margin-top:6px"><span class="chip bad">월말까지 ' + won(-a.short) + ' 부족</span></div>' : '') + '</div>';
      });
      h += '</div>';
    });
    return h + '<p class="hint center" style="margin-top:6px">이월·입금·출금·잔액은 원장에서 바로 계산해요. "남은 필요"는 기준일 이후 월말까지 예정된 (출금 − 입금)입니다.</p>';
  }

  /* ───── 통계 ───── */
  function statsView(d) {
    var type = S.statsMode, items = C.categoryTotals(d.rows, d.range.start, d.asOf, type), total = U.sum(items, function (i) { return i.amount; });
    var months = []; for (var i = 5; i >= 0; i--) months.push(U.shiftMonth(S.month, -i));
    var months12 = []; for (var j = 11; j >= 0; j--) months12.push(U.shiftMonth(S.month, -j));
    var mom = C.momCompare(d.rows, S.month, d.today);
    chartData = {
      items: items, label: type === 'expense' ? '총 지출' : '총 수입',
      m6: { labels: months.map(function (m) { return +m.slice(5) + '월'; }), values: C.monthlyTotals(d.rows, months, type), hi: 5 },
      m12: { labels: months12.map(function (m) { return +m.slice(5) + '월'; }), values: C.endingBalances(d.rows, months12) }
    };
    var h = '<div class="seg" style="margin-bottom:12px"><button class="' + (type === 'income' ? 'on' : '') + '" data-act="smode" data-v="income">수입 분석</button><button class="' + (type === 'expense' ? 'on' : '') + '" data-act="smode" data-v="expense">지출 분석</button></div>';
    if (type === 'expense') {
      var pm = U.parse(mom.prevMonth + '-01').m;
      h += '<div class="card" style="background:var(--brand-soft)"><h3>지난달 같은 기간 비교 <span class="num ' + (mom.diff > 0 ? 'exp' : 'inc') + '">' + U.signed(mom.diff) + '</span></h3>' +
        '<div class="hint" style="color:var(--ink)">' + pm + '월 1~' + mom.day + '일 지출 <b class="num">' + won(mom.prev) + '</b> → 이번 달 같은 기간 <b class="num">' + won(mom.cur) + '</b>. ' + (mom.diff > 0 ? '<b>' + won(mom.diff) + '</b> 더 쓰고 있어요.' : mom.diff < 0 ? '<b>' + won(-mom.diff) + '</b> 아끼고 있어요!' : '똑같아요.') + '</div></div>';
    }
    h += '<div class="card"><h3>' + (type === 'expense' ? '지출' : '수입') + ' 구성비</h3>' + (total ? '<canvas class="chart" id="ch-donut"></canvas><div style="margin-top:8px">' +
      items.map(function (it, i) { return '<div class="legend-row"><i style="background:' + Ch.PALETTE[i % Ch.PALETTE.length] + '"></i><span class="grow">' + esc(it.name) + '</span><b class="num">' + U.num(it.amount) + '</b><span class="muted tiny num" style="min-width:3.2em;text-align:right">' + (it.amount / total * 100).toFixed(1) + '%</span></div>'; }).join('') + '</div>'
      : '<div class="empty" style="padding:20px"><b>이 기간 ' + (type === 'expense' ? '지출' : '수입') + ' 내역이 없어요</b></div>') + '</div>';
    h += '<div class="card"><h3>최근 6개월 ' + (type === 'expense' ? '지출' : '수입') + '</h3><canvas class="chart" id="ch-bars"></canvas></div>' +
      '<div class="card"><h3>월말 전체 계정 잔액 추이 <span class="faint tiny">12개월</span></h3><canvas class="chart" id="ch-line"></canvas></div>';
    return h;
  }

  UI.views.analysis = {
    render: function () {
      var d = UI.derive();
      var h = '<div class="seg" style="margin-bottom:12px">' + [['budget', '예산'], ['accounts', '자산'], ['stats', '통계']].map(function (t) { return '<button class="' + (S.ana === t[0] ? 'on' : '') + '" data-act="ana" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
      return h + (S.ana === 'budget' ? budgetView(d) : S.ana === 'accounts' ? accountsView(d) : statsView(d));
    },
    after: function () {
      if (S.ana !== 'stats' || !chartData) return;
      var d = chartData, c1 = document.getElementById('ch-donut'), c2 = document.getElementById('ch-bars'), c3 = document.getElementById('ch-line');
      if (c1 && d.items.length) Ch.donut(c1, d.items, { label: d.label, h: 190 });
      if (c2) Ch.bars(c2, d.m6.labels, d.m6.values, { highlight: d.m6.hi, color: S.statsMode === 'expense' ? Ch.cv('--expense', '#BD4332') : Ch.cv('--income', '#2E7D46') });
      if (c3) Ch.line(c3, d.m12.labels, d.m12.values);
    }
  };
  UI.actions.ana = function (el) { S.ana = el.dataset.v; UI.render(); document.getElementById('view').scrollTop = 0; };
  UI.actions.smode = function (el) { S.statsMode = el.dataset.v; UI.render(); };

  /* ───── 정합성 점검 ───── */
  UI.actions.audit = function () { UI.openAudit(); };
  UI.openAudit = function () {
    var d = UI.derive(), a = d.audit, p = U.parse(d.month + '-01');
    var h = '<div class="sh-head"><h2>정합성 점검</h2><button class="icon-btn" data-act="close" aria-label="닫기">' + UI.icon('x') + '</button></div>' +
      '<div class="banner ' + (a.ok && !a.errors ? 'good' : 'bad') + '"><span>' + (a.ok && !a.errors ? '✓' : '!') + '</span><div><b>' + p.m + '월 수입 − 지출 − 잔액 = ' + (a.diff === 0 ? '0원 (정상)' : U.signed(a.diff)) + '</b>' +
      (a.ok ? '이 달의 장부 합계와 계정 잔액이 일치해요.' : '아래 행들이 장부(수입·지출)와 계정 잔액에 서로 다르게 반영되고 있어요. 이 행들의 "차이 기여"를 모두 더하면 위 금액과 정확히 같아요.') + '</div></div>';
    if (!a.issues.length) return UI.sheet(h + '<div class="empty" style="padding:20px"><b>문제가 없어요</b>유형과 계정이 모두 맞게 입력되어 있어요.</div>');
    var shown = a.issues.slice(0, 60);
    h += '<div class="small muted" style="margin-bottom:4px">오류 ' + a.errors + '건 · 주의/참고 ' + a.warns + '건 (전체 기간)</div>';
    shown.forEach(function (it) {
      var r = it.row;
      h += '<div class="li" data-act="edit" data-id="' + esc(r.id) + '"><div class="ic ' + (it.level === 'error' ? 'expense' : it.level === 'warn' ? 'budget' : 'transfer') + '">' + (it.level === 'error' ? '오류' : it.level === 'warn' ? '주의' : '참고') + '</div>' +
        '<div class="main"><div class="t1">' + esc(r.usage || r.category || C.TYPE_LABEL[r.type]) + '</div><div class="t2">' + esc(it.text) + '</div><div class="t2">' + r.date.slice(5) + ' · ' + C.TYPE_LABEL[r.type] + ' · ' + U.num(r.type === 'budget' ? r.budget : r.amount) + '원' + (it.contrib ? ' · 차이 기여 ' + U.signed(it.contrib) : '') + '</div></div></div>';
    });
    if (a.issues.length > shown.length) h += '<p class="hint center">… 외 ' + (a.issues.length - shown.length) + '건</p>';
    UI.sheet(h + '<p class="hint" style="margin-top:10px">행을 누르면 바로 수정할 수 있어요. 유형(지출/수입/이체)과 계정이 맞게 고치면 차이가 사라집니다.</p>');
  };

  /* ───── 시트와 대조 ───── */
  UI.actions['sheet-compare'] = async function () {
    if (!Sy.configured()) { UI.toast('먼저 설정에서 시트를 연결해 주세요'); return; }
    UI.toast('시트의 sumary 값을 읽는 중…', { ms: 1500 });
    var r = await Sy.syncNow({ wantSum: true });
    if (!r.ok) { UI.toast(r.error || '동기화에 실패했어요', { kind: 'err' }); return; }
    if (!r.sum) { UI.toast('sumary 시트를 찾지 못했어요', { kind: 'err' }); return; }
    var sum = r.sum, d = UI.derive(), eff = d.eff, rows = St.rows();
    var t = C.accountTable(rows, eff, sum.start, sum.asOf, sum.end), bt = C.budgetTable(rows, eff, sum.start, sum.asOf, sum.end), bBy = {};
    bt.list.forEach(function (b) { bBy[b.name] = b; });
    var bad = 0, ok = 0, rowsH = '', near = function (a, b) { return Math.abs(a - b) < 1; };
    sum.accounts.forEach(function (s) {
      var a = t.byName[s.name] || { open: 0, in: 0, out: 0, balance: 0, need: 0, short: 0 };
      var same = near(a.balance, s.balance) && near(a.in, s.in) && near(a.out, s.out) && near(a.need, s.need);
      same ? ok++ : bad++;
      rowsH += '<tr><td>' + esc(s.name) + '</td><td>' + U.num(a.balance) + '</td><td>' + U.num(s.balance) + '</td><td>' + (same ? '<span class="inc">일치</span>' : '<b class="exp">' + U.signed(a.balance - s.balance) + '</b>') + '</td></tr>';
    });
    var bBad = 0, bOk = 0, bH = '';
    sum.budget.forEach(function (s) {
      var a = bBy[s.name] || { actual: 0, planMonth: 0 };
      var same = near(a.actual, s.actual) && near(a.planMonth, s.planMonth);
      same ? bOk++ : bBad++;
      if (!same) bH += '<tr><td>' + esc(s.name) + '</td><td>' + U.num(a.actual) + '</td><td>' + U.num(s.actual) + '</td><td><b class="exp">' + U.signed(a.actual - s.actual) + '</b></td></tr>';
    });
    var allOk = !bad && !bBad, p = U.parse(sum.asOf);
    var f = C.fundingPlan(t, eff);
    var h = '<div class="sh-head"><h2>시트와 대조</h2><button class="icon-btn" data-act="close" aria-label="닫기">' + UI.icon('x') + '</button></div>' +
      '<div class="banner ' + (allOk ? 'good' : 'bad') + '"><span>' + (allOk ? '✓' : '!') + '</span><div><b>' + (allOk ? '앱 계산과 시트 요약이 모두 일치해요' : '일치하지 않는 항목이 있어요') + '</b>시트 기준일 ' + p.y + '.' + p.m + '.' + p.d + ' · 계정 ' + ok + '/' + (ok + bad) + '개 일치 · 지출항목 ' + bOk + '/' + (bOk + bBad) + '개 일치' +
      (allOk ? '' : '<br>시트 요약이 오래됐다면 시트 메뉴 [가계부 v2 > 요약 새로고침]을 실행한 뒤 다시 대조해 보세요.') + '</div></div>';
    h += '<div class="card"><h3>계정 잔액</h3><table class="tbl num"><tr><th>계정</th><th>앱</th><th>시트</th><th>차이</th></tr>' + rowsH + '</table></div>';
    if (bBad) h += '<div class="card"><h3>다른 지출 항목 (누계사용)</h3><table class="tbl num"><tr><th>항목</th><th>앱</th><th>시트</th><th>차이</th></tr>' + bH + '</table></div>';
    h += '<div class="card"><h3>부족액 비교</h3><div class="kvs"><div><span>시트 적자금액</span><b class="num">' + won(sum.deficit) + '</b></div><div><span>앱 예상 부족액(여유 계정으로 메운 뒤)</span><b class="num">' + won(f.unmet) + '</b></div></div>' +
      '<p class="hint" style="margin-top:6px">시트의 적자금액 산식과 앱의 계산 방식은 조금 다를 수 있어요. 두 값이 크게 다르면 알려 주세요. 산식에 맞춰 드릴게요.</p></div>';
    UI.sheet(h);
  };

})(typeof window !== 'undefined' ? window : globalThis);
