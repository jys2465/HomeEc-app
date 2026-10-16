/* 스마트 입력: 내 입력 습관을 학습해 자동 추천 / 카드 승인 문자 파싱 / 고정비 복사(회차 자동 증가) */
(function (root) {
  'use strict';
  var AB = root.AB = root.AB || {};
  var U = AB.util;
  var S = AB.smart = {};

  /** '교통_버스' → '교통',  '보험_YS 신…' → '보험' */
  S.prefixOf = function (usage) { return String(usage || '').split(/[_\s\-\/]/)[0]; };

  function add(map, k, n) { map[k] = (map[k] || 0) + (n || 1); }
  function top(map, n) {
    return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).slice(0, n);
  }

  /** 과거 내역에서 사용내역/접두어/항목/계정 사용 빈도를 학습 */
  S.buildIndex = function (rows, today) {
    today = today || U.today();
    var cutoff = U.addDays(today, -180);
    var idx = { byUsage: {}, prefix: {}, cat: {}, acct: {}, today: today };
    rows.forEach(function (r) {
      if (r.usage) {
        var e = idx.byUsage[r.usage];
        if (!e) e = idx.byUsage[r.usage] = { usage: r.usage, count: 0, last: r };
        e.count++;
        if (r.date > e.last.date || (r.date === e.last.date && (r.ts || 0) >= (e.last.ts || 0))) e.last = r;
      }
      if ((r.type === 'expense' || r.type === 'income') && r.usage && r.category) {
        var pre = S.prefixOf(r.usage);
        if (pre) { var pk = r.type + '|' + pre; idx.prefix[pk] = idx.prefix[pk] || {}; add(idx.prefix[pk], r.category); }
      }
      if (r.date >= cutoff) {
        if (r.category && r.type !== 'transfer') { var ck = r.type; idx.cat[ck] = idx.cat[ck] || {}; add(idx.cat[ck], r.category); }
        if (r.from) { var fk = r.type + '|from'; idx.acct[fk] = idx.acct[fk] || {}; add(idx.acct[fk], r.from); }
        if (r.to) { var tk = r.type + '|to'; idx.acct[tk] = idx.acct[tk] || {}; add(idx.acct[tk], r.to); }
      }
    });
    return idx;
  };

  /** 자주 쓰는 항목/계정 (칩 표시용) */
  S.topCats = function (idx, type, n) { return top(idx.cat[type] || {}, n || 8); };
  S.topAccts = function (idx, type, side, n) { return top(idx.acct[type + '|' + side] || {}, n || 6); };

  /** 입력 중인 글자로 과거 내역 추천. text가 비면 '자주 쓰는 내역' */
  S.suggest = function (idx, text, type, limit) {
    var q = String(text || '').trim().toLowerCase(), out = [];
    Object.keys(idx.byUsage).forEach(function (k) {
      var e = idx.byUsage[k];
      if (type && e.last.type !== type) return;
      var kl = k.toLowerCase(), score;
      if (!q) score = e.count;
      else if (kl.indexOf(q) === 0) score = 100 + e.count;
      else if (kl.indexOf(q) >= 0) score = 50 + e.count;
      else return;
      var age = U.diffDays(idx.today, e.last.date);
      score += Math.max(0, 30 - age) / 30 * 5; // 최근에 쓴 것을 조금 더 앞으로
      out.push({ usage: k, row: e.last, count: e.count, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 6);
  };

  /** 사용내역 → 항목 추정 (정확히 같은 내역 > 같은 접두어 최다 항목) */
  S.guessCategory = function (idx, usage, type) {
    var e = idx.byUsage[usage];
    if (e && e.last.category && e.last.type === type) return e.last.category;
    var m = idx.prefix[type + '|' + S.prefixOf(usage)];
    if (m) return top(m, 1)[0] || '';
    return '';
  };

  /* ───────────── 카드 승인 문자 파서 ───────────── */
  var BRANDS = [['하나', '하나'], ['롯데', '롯데'], ['신한', '신한'], ['KB|국민', '국민'], ['삼성', '삼성'], ['현대', '현대'], ['NH|농협', '농협'], ['우리', '우리'], ['BC|비씨', 'BC'], ['토스', '토스'], ['카카오', '카카']];

  S.parseSms = function (text, accounts, today) {
    today = today || U.today();
    var t = String(text || '').replace(/\[Web발신\]|\[국제발신\]|\(광고\)/g, ' ').replace(/\s+/g, ' ').trim();
    var res = { ok: false, amount: 0, type: 'expense', date: '', account: '', usage: '', cancel: false, notes: [] };
    if (!t) return res;

    var re = /(\d{1,3}(?:,\d{3})+|\d+)\s*원/g, m, amtEnd = 0;
    while ((m = re.exec(t))) {
      var before = t.slice(Math.max(0, m.index - 6), m.index);
      if (/잔액|한도|누적|포인트/.test(before)) continue;
      res.amount = Number(m[1].replace(/,/g, '')); amtEnd = m.index + m[0].length; break;
    }
    if (/취소/.test(t)) { res.cancel = true; res.notes.push('취소 문자예요. 반대 거래인지 확인하고 입력해 주세요.'); }
    if (/입금|급여|환급|캐시백|받으셨|이체받/.test(t) && !/승인|결제|출금|사용/.test(t)) res.type = 'income';

    var d1 = t.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (d1) res.date = U.ymd(+d1[1], +d1[2], +d1[3]);
    else {
      var d2 = t.match(/(?:^|[^\d:])(\d{1,2})\/(\d{1,2})(?![\d:])/);
      if (d2 && +d2[1] >= 1 && +d2[1] <= 12 && +d2[2] >= 1 && +d2[2] <= 31) {
        var y = +today.slice(0, 4), cand = U.ymd(y, +d2[1], +d2[2]);
        if (cand > U.addDays(today, 1)) cand = U.ymd(y - 1, +d2[1], +d2[2]);
        res.date = cand;
      }
    }

    // 계정: 이름이 문자에 그대로 있으면 우선, 없으면 카드사 이름으로 추정
    var names = accounts.map(function (a) { return a.name; }).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < names.length; i++) if (t.indexOf(names[i]) >= 0) { res.account = names[i]; break; }
    if (!res.account) {
      for (var b = 0; b < BRANDS.length && !res.account; b++) {
        if (new RegExp(BRANDS[b][0]).test(t)) {
          var hit = accounts.filter(function (a) { return a.kind === 'card' && a.name.indexOf(BRANDS[b][1]) >= 0; })[0] ||
                    accounts.filter(function (a) { return a.name.indexOf(BRANDS[b][1]) >= 0; })[0];
          if (hit) res.account = hit.name;
        }
      }
    }

    // 가맹점: 시각(12:34) 뒤 → 일시불/할부 뒤 → 금액 뒤 순서로 시도
    var use = '', mm = t.match(/\d{1,2}:\d{2}(?::\d{2})?\s+(.+)$/);
    if (mm) use = mm[1];
    else if ((mm = t.match(/(?:일시불|할부\s*\d+\s*개월?)\s+(.+)$/))) use = mm[1];
    else if (amtEnd) use = t.slice(amtEnd);
    use = use.replace(/\s*(누적|잔액|한도).*$/, '').replace(/\d{1,3}(?:,\d{3})+\s*원.*$/, '').replace(/(일시불|할부\s*\d+\s*개월?|승인|사용|결제)/g, ' ')
      .replace(/\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
    res.usage = use.slice(0, 30);
    res.ok = res.amount > 0;
    if (!res.ok) res.notes.push('금액을 찾지 못했어요.');
    return res;
  };

  /* ───────────── 고정비 복사 ───────────── */
  /** '★ 13회 / 24회' → '★ 14회 / 24회'.  마지막 회차를 넘으면 finished */
  S.bumpMemo = function (text) {
    text = String(text || '');
    var m = text.match(/★\s*(\d+)\s*회(?:\s*\/\s*(\d+)\s*회?)?/);
    if (!m) return { text: text, finished: false, changed: false };
    var n = +m[1] + 1, total = m[2] ? +m[2] : 0;
    if (total && n > total) return { text: text, finished: true, changed: false };
    return { text: text.replace(/(★\s*)(\d+)/, function (a, p) { return p + n; }), finished: false, changed: true };
  };

  function fixedKey(r) { return [r.type, r.category, r.usage, r.from, r.to].join('|'); }

  /** 이번 달 '고정' 행을 다음 달로 복사할 계획(미리보기). 이미 있는 행·끝난 회차는 건너뜀. */
  S.planFixedCopy = function (rows, srcYm, dstYm) {
    var sr = U.monthRange(srcYm), dr = U.monthRange(dstYm);
    var src = rows.filter(function (r) { return r.repeat === '고정' && r.date >= sr.start && r.date <= sr.end; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var have = {};
    rows.forEach(function (r) { if (r.date >= dr.start && r.date <= dr.end) { var k = fixedKey(r); have[k] = (have[k] || 0) + 1; } });
    return src.map(function (r) {
      var k = fixedKey(r), item = { src: r, row: null, skip: null };
      if (have[k] > 0) { have[k]--; item.skip = '이미 있어요'; return item; }
      var memo = S.bumpMemo(r.memo1);
      if (memo.finished) { item.skip = '회차가 끝났어요'; return item; }
      item.row = Object.assign({}, r, { id: U.uid(), date: U.sameDayIn(r.date, dstYm), memo1: memo.text, rev: 0, ts: 0 });
      return item;
    });
  };

})(typeof window !== 'undefined' ? window : globalThis);
