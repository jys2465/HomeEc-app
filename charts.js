/* 의존성 없는 가벼운 차트(canvas). 테마 색을 CSS 변수에서 읽어 다크모드에서도 자연스럽습니다. */
(function (root) {
  'use strict';
  var AB = root.AB = root.AB || {};
  var U = AB.util;
  var Ch = AB.charts = {};

  Ch.PALETTE = ['#2F5D53', '#BD4332', '#B8862B', '#2F6FA3', '#7D5BA6', '#5C8374', '#D17A5B', '#8A8070', '#4C9AA3', '#A3607A'];

  function cv(name, fb) { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; }
  Ch.cv = cv;

  function prep(canvas, h) {
    var w = canvas.clientWidth || (canvas.parentNode && canvas.parentNode.clientWidth) || 320;
    var dpr = root.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }
  var FONT = '"Noto Sans KR", -apple-system, "Apple SD Gothic Neo", sans-serif';

  /** 도넛: items=[{name,amount}] */
  Ch.donut = function (canvas, items, opt) {
    opt = opt || {};
    var p = prep(canvas, opt.h || 190); if (!p) return;
    var ctx = p.ctx, total = U.sum(items, function (i) { return i.amount; });
    var cx = p.w / 2, cy = p.h / 2, R = Math.min(p.w, p.h) / 2 - 6, r = R * 0.62;
    if (!total) return;
    var a = -Math.PI / 2, gap = items.length > 1 ? 0.03 : 0;
    items.forEach(function (it, i) {
      var sw = it.amount / total * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, a + gap, a + sw - gap); ctx.arc(cx, cy, r, a + sw - gap, a + gap, true); ctx.closePath();
      ctx.fillStyle = Ch.PALETTE[i % Ch.PALETTE.length]; ctx.fill(); a += sw;
    });
    ctx.textAlign = 'center'; ctx.fillStyle = cv('--ink2', '#666'); ctx.font = '600 12px ' + FONT;
    ctx.fillText(opt.label || '', cx, cy - 6);
    ctx.fillStyle = cv('--ink', '#000'); ctx.font = '800 17px ' + FONT;
    ctx.fillText(U.compact(total) + (total >= 1e4 ? '원' : '원'), cx, cy + 14);
  };

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, 0); ctx.arcTo(x, y + h, x, y, 0); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /** 막대: labels[], values[] */
  Ch.bars = function (canvas, labels, values, opt) {
    opt = opt || {};
    var p = prep(canvas, opt.h || 170); if (!p) return;
    var ctx = p.ctx, n = values.length, padB = 24, padT = 22, max = Math.max.apply(null, values.map(Math.abs).concat([1]));
    var slot = p.w / n, bw = Math.min(34, slot * 0.56), base = p.h - padB, gh = base - padT;
    ctx.strokeStyle = cv('--line', '#ddd'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, base + .5); ctx.lineTo(p.w, base + .5); ctx.stroke();
    values.forEach(function (v, i) {
      var h = Math.max(Math.abs(v) / max * gh, v ? 3 : 0), x = i * slot + (slot - bw) / 2, hi = i === opt.highlight;
      if (h) { ctx.fillStyle = hi ? (opt.color || cv('--brand', '#2F5D53')) : cv('--line2', '#ccc'); rr(ctx, x, base - h, bw, h, 7); ctx.fill(); }
      ctx.textAlign = 'center'; ctx.fillStyle = hi ? cv('--ink', '#000') : cv('--ink2', '#777'); ctx.font = (hi ? '800 ' : '500 ') + '11px ' + FONT;
      ctx.fillText(labels[i], x + bw / 2, p.h - 7);
      if (v) { ctx.fillStyle = hi ? (opt.color || cv('--brand', '#2F5D53')) : cv('--ink2', '#777'); ctx.font = '700 11px ' + FONT; ctx.fillText(U.compact(v), x + bw / 2, base - h - 6); }
    });
  };

  /** 추이선: 값이 음수여도 됨 */
  Ch.line = function (canvas, labels, values, opt) {
    opt = opt || {};
    var p = prep(canvas, opt.h || 160); if (!p) return;
    var ctx = p.ctx, n = values.length, padL = 8, padR = 8, padT = 22, padB = 22;
    var mx = Math.max.apply(null, values.concat([0])), mn = Math.min.apply(null, values.concat([0])); if (mx === mn) mx = mn + 1;
    var X = function (i) { return padL + (n === 1 ? (p.w - padL - padR) / 2 : i * (p.w - padL - padR) / (n - 1)); };
    var Y = function (v) { return padT + (mx - v) / (mx - mn) * (p.h - padT - padB); };
    ctx.strokeStyle = cv('--line', '#ddd'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, Y(0) + .5); ctx.lineTo(p.w, Y(0) + .5); ctx.stroke();
    var col = opt.color || cv('--brand', '#2F5D53');
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
    values.forEach(function (v, i) { if (i) ctx.lineTo(X(i), Y(v)); else ctx.moveTo(X(i), Y(v)); }); ctx.stroke();
    values.forEach(function (v, i) { ctx.beginPath(); ctx.arc(X(i), Y(v), i === n - 1 ? 4.5 : 3, 0, 7); ctx.fillStyle = i === n - 1 ? col : cv('--card', '#fff'); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); });
    ctx.textAlign = 'center'; ctx.font = '500 10px ' + FONT; ctx.fillStyle = cv('--ink2', '#777');
    labels.forEach(function (l, i) { if (n <= 7 || i % 2 === n % 2 || i === n - 1) ctx.fillText(l, X(i), p.h - 6); });
    ctx.fillStyle = col; ctx.font = '800 11px ' + FONT; ctx.textAlign = n > 1 ? 'right' : 'center';
    ctx.fillText(U.compact(values[n - 1]), X(n - 1) + (n > 1 ? 4 : 0), Y(values[n - 1]) - 9);
  };

})(typeof window !== 'undefined' ? window : globalThis);
