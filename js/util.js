/* 공통 유틸 — 날짜는 항상 'YYYY-MM-DD' 문자열로만 다룹니다(시간대 문제 원천 차단). */
(function (root) {
  'use strict';
  var AB = root.AB = root.AB || {};
  var U = AB.util = {};

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  U.DOW = DOW;

  U.pad = function (n) { return String(n).padStart(2, '0'); };
  U.ymd = function (y, m, d) { return y + '-' + U.pad(m) + '-' + U.pad(d); };

  U.today = function () {
    var d = new Date();
    return U.ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  };

  /** 'YYYY-MM-DD'(뒤에 요일 등이 붙어도 됨) → {y,m,d} | null */
  U.parse = function (s) {
    var m = String(s == null ? '' : s).match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > U.daysInMonth(y, mo)) return null; // 2/30 같은 없는 날짜 차단
    return { y: y, m: mo, d: d };
  };

  U.daysInMonth = function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

  /* 한국 공휴일 (대체공휴일 포함). 출처: 2026·2027 공휴일 달력. 설정에서 추가한 날은 U.extraHolidays 로 더함 */
  U.HOLIDAYS = {
    '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴', '2026-03-02': '대체공휴일', '2026-05-01': '근로자의 날',
    '2026-05-05': '어린이날', '2026-05-25': '대체공휴일', '2026-06-03': '지방선거', '2026-07-17': '제헌절', '2026-08-17': '대체공휴일',
    '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
    '2027-01-01': '신정', '2027-02-08': '설날 연휴', '2027-02-09': '대체공휴일', '2027-03-01': '삼일절', '2027-05-03': '대체공휴일', '2027-05-05': '어린이날',
    '2027-05-13': '부처님오신날', '2027-07-19': '대체공휴일', '2027-08-16': '대체공휴일', '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴',
    '2027-10-04': '대체공휴일', '2027-10-11': '대체공휴일', '2027-12-27': '대체공휴일',
    // 주말에 걸린 공휴일(이름 표시용)
    '2026-03-01': '삼일절', '2026-05-24': '부처님오신날', '2026-06-06': '현충일', '2026-08-15': '광복절', '2026-09-26': '추석 연휴', '2026-10-03': '개천절',
    '2027-02-06': '설날 연휴', '2027-02-07': '설날', '2027-05-01': '근로자의 날', '2027-06-06': '현충일', '2027-07-17': '제헌절', '2027-08-15': '광복절',
    '2027-10-03': '개천절', '2027-10-09': '한글날', '2027-12-25': '성탄절'
  };
  U.extraHolidays = {};
  U.holidayName = function (ymd) { return U.extraHolidays[ymd] || U.HOLIDAYS[ymd] || ''; };
  U.weekday = function (ymd) { var p = U.parse(ymd); return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : -1; };
  /** 쉬는 날(토·일·공휴일)인가 */
  U.isOffDay = function (ymd) { var w = U.weekday(ymd); return w === 0 || w === 6 || !!U.holidayName(ymd); };
  /** 그 달의 쉬는 날 목록 [{date, w, name}] */
  U.offDays = function (ym) {
    var r = U.monthRange(ym), out = [];
    for (var d = r.start; d <= r.end; d = U.addDays(d, 1)) if (U.isOffDay(d)) out.push({ date: d, w: U.weekday(d), name: U.holidayName(d) });
    return out;
  };

  U.addDays = function (ymd, n) {
    var p = U.parse(ymd);
    var t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return U.ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  };

  U.diffDays = function (a, b) { // a - b (일)
    var pa = U.parse(a), pb = U.parse(b);
    return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000);
  };

  U.dow = function (ymd) {
    var p = U.parse(ymd);
    return DOW[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  };

  U.monthOf = function (ymd) { return String(ymd).slice(0, 7); };

  U.monthRange = function (ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    return { start: ym + '-01', end: ym + '-' + U.pad(U.daysInMonth(y, m)) };
  };

  U.shiftMonth = function (ym, delta) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + delta;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + U.pad(m + 1);
  };

  /** 같은 '일'을 대상 월로 옮김(말일 초과 시 말일) */
  U.sameDayIn = function (ymd, ym) {
    var p = U.parse(ymd), y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    return U.ymd(y, m, Math.min(p.d, U.daysInMonth(y, m)));
  };

  U.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  U.sum = function (arr, fn) { var s = 0; for (var i = 0; i < arr.length; i++) s += fn ? fn(arr[i]) : arr[i]; return s; };

  U.num = function (n) { return Math.round(Number(n) || 0).toLocaleString('ko-KR'); };
  U.won = function (n) { return U.num(n) + '원'; };
  U.signed = function (n) { n = Math.round(Number(n) || 0); return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('ko-KR') + '원'; };
  /** 12,345,678 → '1,235만', 123,456,789 → '1.2억' (그래프 라벨용) */
  U.compact = function (n) {
    n = Math.round(Number(n) || 0);
    var a = Math.abs(n), sg = n < 0 ? '−' : '';
    if (a >= 1e8) return sg + (a / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, '') + '억';
    if (a >= 1e4) return sg + Math.round(a / 1e4).toLocaleString('ko-KR') + '만';
    return sg + a.toLocaleString('ko-KR');
  };
  U.pct = function (v, d) { return (v * 100).toFixed(d == null ? 0 : d) + '%'; };

  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  U.uid = function () {
    var r = '';
    for (var i = 0; i < 8; i++) r += Math.floor(Math.random() * 36).toString(36);
    return 'c' + Date.now().toString(36) + r;
  };

  U.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  };

  /** 숫자만 남기고 콤마 서식. 빈 값은 '' */
  U.fmtInput = function (v) {
    var d = String(v == null ? '' : v).replace(/[^\d]/g, '');
    return d === '' ? '' : Number(d).toLocaleString('ko-KR');
  };
  U.parseInput = function (v) { var d = String(v == null ? '' : v).replace(/[^\d]/g, ''); return d === '' ? 0 : parseInt(d, 10); };

  U.loadScript = function (src) {
    U._scripts = U._scripts || {};
    if (U._scripts[src]) return U._scripts[src];
    U._scripts[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = function () { delete U._scripts[src]; reject(new Error('스크립트를 불러오지 못했어요: ' + src)); };
      document.head.appendChild(s);
    });
    return U._scripts[src];
  };

  U.groupBy = function (arr, keyFn) {
    var m = {};
    arr.forEach(function (x) { var k = keyFn(x); (m[k] = m[k] || []).push(x); });
    return m;
  };

})(typeof window !== 'undefined' ? window : globalThis);
