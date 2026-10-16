/* 엑셀 입출력 — 라이브러리(SheetJS)는 필요할 때만 불러옵니다(앱 시작 속도). 저장소에 포함되어 오프라인에서도 동작. */
(function (root) {
  'use strict';
  var AB = root.AB = root.AB || {};
  var U = AB.util, C = AB.calc;
  var X = AB.xio = {};

  var ALIAS = {
    date: ['사용일자', '일자', '날짜', '결제일자', 'date'],
    type: ['유형', '구분', '종류'],
    repeat: ['반복성', '고변성', '반복'],
    category: ['계정항목', '항목', '카테고리', '계정'],
    usage: ['사용내역', '내역', '내용'],
    budget: ['예산금액', '예산'],
    amount: ['확정금액', '금액', '사용금액'],
    from: ['출금계정', '출금', '발신처'],
    to: ['입금계정', '입금', '수신처'],
    memo1: ['메모1', '메모'],
    memo2: ['메모2']
  };

  function lib() { return U.loadScript('vendor/xlsx.full.min.js').then(function () { return root.XLSX; }); }

  function toNum(v) { var n = Number(String(v == null ? '' : v).replace(/[,\s원]/g, '')); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }
  function toType(v) {
    var s = String(v || '');
    if (s.indexOf('예산') >= 0) return 'budget'; if (s.indexOf('수입') >= 0) return 'income'; if (s.indexOf('이체') >= 0) return 'transfer';
    return s ? 'expense' : '';
  }
  function toDate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) { var t = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return U.ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
    var s = String(v).trim().replace(/\s*\(.*?\)/g, '');
    var p = U.parse(s); if (p) return U.ymd(p.y, p.m, p.d);
    var m = s.match(/^(\d{2})\D+(\d{1,2})\D+(\d{1,2})/); if (m) return U.ymd(2000 + (+m[1]), +m[2], +m[3]);
    var d = s.replace(/\D/g, ''); if (d.length === 8) return U.ymd(+d.slice(0, 4), +d.slice(4, 6), +d.slice(6, 8));
    return '';
  }

  /** 파일 → 정규화된 행들. existing 과 같은 내역은 '중복'으로 분리. */
  X.parseFile = async function (file, existing) {
    var XLSX = await lib();
    var buf = await file.arrayBuffer();
    var wb = XLSX.read(buf, { type: 'array' });
    var name = wb.SheetNames.indexOf('data') >= 0 ? 'data' : wb.SheetNames[0];
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
    var hi = -1;
    for (var i = 0; i < Math.min(aoa.length, 30); i++) { if (aoa[i].some(function (c) { return ALIAS.date.indexOf(String(c).trim()) >= 0; })) { hi = i; break; } }
    if (hi < 0) throw new Error('머리글 행(사용일자 등)을 찾지 못했어요. 이 앱에서 내보낸 형식(또는 시트 data 형식)인지 확인해 주세요.');
    var col = {}, heads = aoa[hi].map(function (h) { return String(h).trim(); });
    Object.keys(ALIAS).forEach(function (k) { // 별칭 우선순위대로 찾음 (예: 확정금액 > 금액 > 사용금액)
      for (var a = 0; a < ALIAS[k].length; a++) { var ix = heads.indexOf(ALIAS[k][a]); if (ix >= 0) { col[k] = ix; break; } }
    });
    var get = function (r, k) { return col[k] === undefined ? '' : r[col[k]]; };
    var oldSchema = col.type === undefined; // 예전 가계부(계정항목에 '수입'/'계좌이체')
    var out = [], skipped = 0, known = {};
    (existing || []).forEach(function (r) { known[C.fingerprint(r)] = (known[C.fingerprint(r)] || 0) + 1; });
    var dupes = 0, months = {};
    for (var r = hi + 1; r < aoa.length; r++) {
      var row = aoa[r], date = toDate(get(row, 'date'));
      if (!date) { if (row.some(function (c) { return String(c).trim() !== ''; })) skipped++; continue; }
      var cat = String(get(row, 'category') || '').trim(), type = toType(get(row, 'type'));
      if (oldSchema) { type = cat === '계좌이체' ? 'transfer' : cat === '수입' ? 'income' : 'expense'; if (type !== 'expense') cat = type === 'income' ? '기타수입' : ''; }
      if (!type) type = 'expense';
      var o = {
        id: U.uid(), date: date, type: type, repeat: String(get(row, 'repeat')).trim() === '고정' ? '고정' : '변동',
        category: cat, usage: String(get(row, 'usage') || '').trim(), budget: toNum(get(row, 'budget')), amount: toNum(get(row, 'amount')),
        from: String(get(row, 'from') || '').trim(), to: String(get(row, 'to') || '').trim(), memo1: String(get(row, 'memo1') || '').trim(), memo2: String(get(row, 'memo2') || '').trim(), rev: 0, ts: 0
      };
      var fp = C.fingerprint(o);
      if (known[fp] > 0) { known[fp]--; dupes++; continue; }
      months[date.slice(0, 7)] = (months[date.slice(0, 7)] || 0) + 1;
      out.push(o);
    }
    return { rows: out, dupes: dupes, skipped: skipped, months: months, sheet: name, oldSchema: oldSchema };
  };

  X.exportRows = async function (rows) {
    var XLSX = await lib();
    var head = ['사용일자', '유형', '반복성', '계정항목', '사용내역', '예산금액', '확정금액', '출금계정', '입금계정', '메모1', '메모2'];
    var aoa = [head].concat(C.sortRows(rows).map(function (r) {
      return [r.date + '(' + U.dow(r.date) + ')', C.TYPE_LABEL[r.type], r.repeat, r.category, r.usage, r.budget, r.amount, r.from, r.to, r.memo1, r.memo2];
    }));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 15 }, { wch: 6 }, { wch: 7 }, { wch: 12 }, { wch: 24 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 20 }, { wch: 16 }];
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'data');
    var name = '가계부_백업_' + U.today().replace(/-/g, '') + '.xlsx';
    var buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS && navigator.canShare && root.File) { // 아이폰: "파일에 저장"을 고를 수 있는 공유 시트
      var file = new File([buf], name, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); return name; } catch (e) { if (e && e.name === 'AbortError') return name; }
      }
    }
    var url = URL.createObjectURL(new Blob([buf], { type: mime })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    return name;
  };

})(typeof window !== 'undefined' ? window : globalThis);
