/* 계산 엔진 — 모든 숫자는 '원장(행)'에서만 파생됩니다. (저장된 잔액·합계는 없음 → 서로 어긋날 수 없음)
 *
 * 시트 sumary 와 같은 의미를 그대로 따릅니다.
 *   이월   = 시작일 전날까지 [입금계정 합 − 출금계정 합]
 *   입금/출금/잔액 = 시작일 ~ 기준일(누계일)
 *   당월예산 = 월 전체 예산금액 합 / 표준사용(누계예산) = 기준일까지의 예산금액 합
 *   누계사용 = 기준일까지 '지출' 확정금액 합,  누계사용율 = 누계사용 ÷ 누계예산
 *   필요금액 = 기준일 이후 월말까지의 (출금 − 입금),  부족 = min(0, 잔액 − 필요금액)
 */
(function (root) {
  'use strict';
  var AB = root.AB = root.AB || {};
  var U = AB.util;
  var C = AB.calc = {};

  C.TYPE_LABEL = { expense: '지출', income: '수입', transfer: '이체', budget: '예산' };
  C.KIND_LABEL = { bank: '통장', cash: '현금·상품권', card: '카드', saving: '적금·예금', invest: '투자' };
  C.DEFAULT_ORDER = {
    accounts: ['하나머니', '온누리권', '카카자율', '토스자율', '하나자율', '가방현금', '카카자금', '우리대출', '우리급여', '하나카드', '롯데카드', '신한카드', '주식투자', '코인투자', '카카투자', '일본환전', '하나적금', '우리적금', '우리적금2'],
    expenses: ['진영생활비', '영수생활비', '민성생활비', '민혁생활비', '가족외식비', '가족간식비', '가족행사비', '보험료', '통신비', '공과금', '교통비', '부채상환', '저축선급'],
    incomes: ['급여수익', '배달수익', '투자수익', '금융수익', '대출자금', '하나머니', '기타수입']
  };

  C.guessKind = function (name) {
    if (/카드/.test(name)) return 'card';
    if (/투자|환전|주식|코인/.test(name)) return 'invest';
    if (/적금|예금|청약/.test(name)) return 'saving';
    if (/현금|온누리|상품권/.test(name)) return 'cash';
    return 'bank';
  };

  function inc(map, k) { map[k] = (map[k] || 0) + 1; }

  /** 설정 + 실제 데이터에서 관측된 이름을 합친 '유효 목록'. 설정에 없는 새 계정/항목도 자동으로 나타남. */
  C.effective = function (cfg, rows) {
    cfg = cfg || {};
    var seen = { accounts: {}, expenses: {}, incomes: {} };
    rows.forEach(function (r) {
      if (r.from) inc(seen.accounts, r.from);
      if (r.to) inc(seen.accounts, r.to);
      if (r.category) {
        if (r.type === 'income') inc(seen.incomes, r.category);
        else if (r.type === 'expense' || r.type === 'budget') inc(seen.expenses, r.category);
      }
    });
    function order(listCfg, seenMap, def) {
      var out = [], used = {};
      (listCfg || []).forEach(function (n) { if (n && !used[n]) { used[n] = 1; out.push(n); } });
      var rest = Object.keys(seenMap).filter(function (n) { return !used[n]; });
      rest.sort(function (a, b) {
        var ia = def.indexOf(a), ib = def.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return seenMap[b] - seenMap[a];
      });
      return out.concat(rest);
    }
    var meta = {};
    (cfg.accounts || []).forEach(function (a) { if (a && a.name) meta[a.name] = a; });
    var names = order((cfg.accounts || []).map(function (a) { return a.name; }), seen.accounts, C.DEFAULT_ORDER.accounts);
    var accounts = names.map(function (n) {
      var m = meta[n] || {}, kind = m.kind || C.guessKind(n);
      return {
        name: n, kind: kind,
        fundable: m.fundable !== undefined ? !!m.fundable : (kind === 'bank' || kind === 'cash'),
        billingDay: Number(m.billingDay) || 0, payFrom: m.payFrom || '', hidden: !!m.hidden
      };
    });
    return {
      accounts: accounts,
      expenses: order(cfg.expenses, seen.expenses, C.DEFAULT_ORDER.expenses),
      incomes: order(cfg.incomes, seen.incomes, C.DEFAULT_ORDER.incomes)
    };
  };

  /** 보고 있는 달의 '기준일'(누계일): 오늘이 달 안이면 오늘, 지난 달이면 말일, 앞으로 올 달이면 시작 전날 */
  C.asOfFor = function (ym, today) {
    var r = U.monthRange(ym);
    if (today > r.end) return r.end;
    if (today < r.start) return U.addDays(r.start, -1);
    return today;
  };

  function newAcc(name) { return { name: name, open: 0, in: 0, out: 0, balance: 0, needOut: 0, needIn: 0, need: 0, short: 0 }; }

  /** 계정별 이월/입금/출금/잔액 + 필요금액/부족 */
  C.accountTable = function (rows, eff, start, asOf, end) {
    var A = {}, order = [];
    eff.accounts.forEach(function (a) { A[a.name] = newAcc(a.name); order.push(a.name); });
    function get(n) { if (!A[n]) { A[n] = newAcc(n); order.push(n); } return A[n]; }
    rows.forEach(function (r) {
      var amt = r.amount || 0;
      if (!amt || r.type === 'budget') return;
      var bucket = r.date < start ? 'open' : (r.date <= asOf ? 'per' : (r.date <= end ? 'fut' : null));
      if (!bucket) return;
      if (r.to) { var t = get(r.to); if (bucket === 'open') t.open += amt; else if (bucket === 'per') t.in += amt; else t.needIn += amt; }
      if (r.from) { var f = get(r.from); if (bucket === 'open') f.open -= amt; else if (bucket === 'per') f.out += amt; else f.needOut += amt; }
    });
    var total = newAcc('합계'), list = order.map(function (n) {
      var a = A[n];
      a.balance = a.open + a.in - a.out;
      a.need = a.needOut - a.needIn;
      a.short = Math.min(0, a.balance - a.need);
      ['open', 'in', 'out', 'balance', 'need', 'short'].forEach(function (k) { total[k] += a[k]; });
      return a;
    });
    return { list: list, byName: A, total: total };
  };

  /** 특정 날짜까지의 계정별 잔액 {이름: 금액} (이월 구분 없이 전체 이력) */
  C.balancesAsOf = function (rows, asOf) {
    var B = {};
    rows.forEach(function (r) {
      var amt = r.amount || 0;
      if (!amt || r.type === 'budget' || r.date > asOf) return;
      if (r.to) B[r.to] = (B[r.to] || 0) + amt;
      if (r.from) B[r.from] = (B[r.from] || 0) - amt;
    });
    return B;
  };

  function newB(name) { return { name: name, planMonth: 0, planToDate: 0, actual: 0, futureAmount: 0, projected: 0, pace: null, useRatio: null, left: 0, status: 'none' }; }

  /** 항목별 예산 진도 */
  C.budgetTable = function (rows, eff, start, asOf, end) {
    var M = {}, order = [];
    eff.expenses.forEach(function (n) { M[n] = newB(n); order.push(n); });
    rows.forEach(function (r) {
      if (r.type !== 'budget' && r.type !== 'expense') return;
      if (r.date < start || r.date > end) return;
      var key = r.category || '(항목 없음)';
      if (!M[key]) { M[key] = newB(key); order.push(key); }
      var b = M[key];
      if (r.budget > 0) { b.planMonth += r.budget; if (r.date <= asOf) b.planToDate += r.budget; }
      if (r.type === 'expense') {
        if (r.date <= asOf) b.actual += r.amount;
        else b.futureAmount += Math.max(r.amount, r.budget || 0);
      } else if (r.date > asOf) {
        b.futureAmount += r.budget || 0;
      }
    });
    var total = newB('합계');
    var list = order.map(function (n) {
      var b = M[n];
      b.projected = b.actual + b.futureAmount;
      b.pace = b.planMonth > 0 ? b.planToDate / b.planMonth : null;
      b.useRatio = b.planToDate > 0 ? b.actual / b.planToDate : null;
      b.left = b.planToDate - b.actual;
      b.status = C.budgetStatus(b);
      ['planMonth', 'planToDate', 'actual', 'futureAmount', 'projected', 'left'].forEach(function (k) { total[k] += b[k]; });
      return b;
    }).filter(function (b) { return b.status !== 'none'; });
    total.pace = total.planMonth > 0 ? total.planToDate / total.planMonth : null;
    total.useRatio = total.planToDate > 0 ? total.actual / total.planToDate : null;
    total.status = C.budgetStatus(total);
    return { list: list, total: total };
  };

  /** ok: 계획 속도 이내 / near: 속도는 넘었지만 월 예산 이내 / over: 월 예산 초과 / unplanned: 계획 없이 사용 */
  C.budgetStatus = function (b) {
    if (!b.planMonth && !b.actual && !b.futureAmount) return 'none';
    if (!b.planMonth) return b.actual > 0 ? 'unplanned' : 'ok';
    if (b.actual > b.planMonth) return 'over';
    if (b.actual > b.planToDate) return 'near';
    return 'ok';
  };

  /** 자금 부족 예보 + 이체 추천 (여유 있는 통장 → 모자란 계정) */
  C.fundingPlan = function (acct, eff) {
    var kinds = {};
    eff.accounts.forEach(function (a) { kinds[a.name] = a; });
    var deficits = [], sources = [];
    acct.list.forEach(function (a) {
      var k = kinds[a.name] || { kind: 'bank', fundable: true };
      if (a.short < 0) deficits.push({ name: a.name, kind: k.kind, need: Math.round(-a.short) });
      else if (k.fundable && k.kind !== 'card') {
        var spare = Math.round(a.balance - a.need);
        if (spare > 0) sources.push({ name: a.name, spare: spare });
      }
    });
    deficits.sort(function (x, y) { return y.need - x.need; });
    sources.sort(function (x, y) { return y.spare - x.spare; });
    var spareTotal = U.sum(sources, function (s) { return s.spare; });
    var transfers = [], unmet = 0;
    deficits.forEach(function (d) {
      var left = d.need;
      for (var i = 0; i < sources.length && left > 0; i++) {
        var s = sources[i];
        if (s.spare <= 0 || s.name === d.name) continue;
        var amt = Math.min(left, s.spare);
        transfers.push({ from: s.name, to: d.name, amount: amt });
        s.spare -= amt; left -= amt;
      }
      if (left > 0) unmet += left;
    });
    return { deficits: deficits, transfers: transfers, unmet: unmet, deficitTotal: U.sum(deficits, function (d) { return d.need; }), spareTotal: spareTotal };
  };

  C.nextBilling = function (day, today) {
    var p = U.parse(today);
    var cand = U.ymd(p.y, p.m, Math.min(day, U.daysInMonth(p.y, p.m)));
    if (cand < today) {
      var nx = U.shiftMonth(today.slice(0, 7), 1), q = U.parse(nx + '-01');
      cand = U.ymd(q.y, q.m, Math.min(day, U.daysInMonth(q.y, q.m)));
    }
    return cand;
  };

  /** 카드별 미결제액·결제 예정일·결제계좌 잔액 */
  C.cardSchedule = function (rows, eff, today) {
    var bal = C.balancesAsOf(rows, today);
    return eff.accounts.filter(function (a) { return a.kind === 'card'; }).map(function (a) {
      var owed = Math.max(0, -(bal[a.name] || 0));
      var due = a.billingDay ? C.nextBilling(a.billingDay, today) : null;
      var payBal = a.payFrom ? (bal[a.payFrom] || 0) : null;
      return {
        name: a.name, owed: owed, billingDay: a.billingDay, due: due,
        dDay: due ? U.diffDays(due, today) : null, payFrom: a.payFrom, payBal: payBal,
        enough: a.payFrom ? payBal >= owed : null
      };
    });
  };

  /**
   * 정합성 검사. '수입 − 지출 − 잔액 = 0' 이 깨지는 원인을 행 단위로 찾아냅니다.
   *  차이(diff) = Σ 각 행의 (장부 효과 − 계정 효과).  각 이슈의 contrib 를 더하면 diff 와 정확히 같습니다.
   */
  C.audit = function (rows, eff, start, asOf) {
    var issues = [], diff = 0, dupKey = {};
    rows.forEach(function (r) {
      var amt = r.amount || 0, to = r.to ? amt : 0, from = r.from ? amt : 0;
      var inPeriod = r.date >= start && r.date <= asOf;
      var contrib = 0, msg = null, level = 'error';
      if (r.type === 'expense') {
        contrib = -amt - (-(from) + to); // 장부 효과 −amt, 계정 효과 (to − from)
        if (!r.from) msg = '지출인데 출금계정이 없어요 — 어느 계정에서도 돈이 빠지지 않아요';
        else if (r.to) msg = '지출 행에 입금계정까지 있어요 — 이체로 입력하려던 건가요?';
      } else if (r.type === 'income') {
        contrib = amt - (to - from);
        if (!r.to) msg = '수입인데 입금계정이 없어요 — 어느 계정에도 돈이 들어오지 않아요';
        else if (r.from) msg = '수입 행에 출금계정까지 있어요 — 이체로 입력하려던 건가요?';
      } else if (r.type === 'transfer') {
        contrib = 0 - (to - from);
        if (!r.from || !r.to) msg = '이체는 출금계정과 입금계정이 모두 있어야 해요';
        else if (r.from === r.to) { msg = '이체의 출금·입금 계정이 같아요'; contrib = 0; }
      } else if (r.type === 'budget') {
        if (amt > 0 || r.from || r.to) { msg = '예산 행에 확정금액/계정이 있어요 — 예산 행은 잔액에 반영되지 않아요'; level = 'warn'; }
      }
      if (inPeriod) diff += contrib;
      if (msg) issues.push({ id: r.id, level: level, text: msg, contrib: inPeriod ? contrib : 0, row: r });
      else if ((r.type === 'expense' || r.type === 'income') && !r.category) issues.push({ id: r.id, level: 'warn', text: '계정항목이 비어 있어요', contrib: 0, row: r });
      if (r.type === 'expense' && amt > 0 && r.usage && r.repeat !== '고정') {
        var k = [r.date, r.usage, amt, r.from].join('|');
        if (dupKey[k]) issues.push({ id: r.id, level: 'info', text: '같은 날 같은 내역·금액이 또 있어요 (중복 입력 확인)', contrib: 0, row: r });
        dupKey[k] = true;
      }
    });
    var rank = { error: 0, warn: 1, info: 2 };
    issues.sort(function (a, b) { return rank[a.level] - rank[b.level] || (a.row.date < b.row.date ? 1 : -1); });
    return {
      diff: Math.round(diff), issues: issues,
      errors: issues.filter(function (i) { return i.level === 'error'; }).length,
      warns: issues.filter(function (i) { return i.level !== 'error'; }).length,
      ok: Math.round(diff) === 0
    };
  };

  /** 기간 합계 (확정 기준) */
  C.periodTotals = function (rows, start, end) {
    var t = { income: 0, expense: 0 };
    rows.forEach(function (r) {
      if (r.date < start || r.date > end) return;
      if (r.type === 'income') t.income += r.amount; else if (r.type === 'expense') t.expense += r.amount;
    });
    return t;
  };

  /** 항목별 합계 (도넛용) — 기준일까지 */
  C.categoryTotals = function (rows, start, asOf, type) {
    var m = {};
    rows.forEach(function (r) {
      if (r.type !== type || r.date < start || r.date > asOf) return;
      var k = r.category || '(항목 없음)';
      m[k] = (m[k] || 0) + r.amount;
    });
    return Object.keys(m).map(function (k) { return { name: k, amount: m[k] }; }).sort(function (a, b) { return b.amount - a.amount; });
  };

  C.monthlyTotals = function (rows, months, type) {
    return months.map(function (ym) {
      var r = U.monthRange(ym), s = 0;
      rows.forEach(function (x) { if (x.type === type && x.date >= r.start && x.date <= r.end) s += x.amount; });
      return s;
    });
  };

  /** 월말 기준 전체 계정 합계(= 이월+수입−지출의 누적) 추이 */
  C.endingBalances = function (rows, months) {
    var sorted = rows.filter(function (r) { return r.type !== 'budget' && r.amount; }).sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    var out = [], i = 0, run = 0;
    months.forEach(function (ym) {
      var end = U.monthRange(ym).end;
      while (i < sorted.length && sorted[i].date <= end) {
        var r = sorted[i++];
        if (r.to) run += r.amount;
        if (r.from) run -= r.amount;
      }
      out.push(run);
    });
    return out;
  };

  /** 지난달 같은 기간 대비 지출 */
  C.momCompare = function (rows, ym, today) {
    var r = U.monthRange(ym), isCur = today >= r.start && today <= r.end;
    var day = isCur ? U.parse(today).d : U.daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7));
    var pym = U.shiftMonth(ym, -1), pr = U.monthRange(pym);
    var pday = Math.min(day, U.daysInMonth(+pym.slice(0, 4), +pym.slice(5, 7)));
    var cur = 0, prev = 0, curEnd = ym + '-' + U.pad(day), prevEnd = pym + '-' + U.pad(pday);
    rows.forEach(function (x) {
      if (x.type !== 'expense') return;
      if (x.date >= r.start && x.date <= curEnd) cur += x.amount;
      if (x.date >= pr.start && x.date <= prevEnd) prev += x.amount;
    });
    return { cur: cur, prev: prev, diff: cur - prev, day: day, prevMonth: pym };
  };

  C.fingerprint = function (r) { return [r.date, r.type, r.usage, r.amount, r.budget, r.from, r.to].join('|'); };

  C.sortRows = function (rows) {
    return rows.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.ts || 0) - (a.ts || 0);
    });
  };

  /** 월 전체 요약 (홈 히어로용) */
  C.monthSummary = function (rows, eff, ym, today) {
    var r = U.monthRange(ym), asOf = C.asOfFor(ym, today);
    var b = C.budgetTable(rows, eff, r.start, asOf, r.end);
    var tot = C.periodTotals(rows, r.start, asOf);
    return { range: r, asOf: asOf, budget: b, income: tot.income, expense: tot.expense };
  };

})(typeof window !== 'undefined' ? window : globalThis);
