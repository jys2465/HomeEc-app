/* 입력/수정 시트 — 금액부터 눌러도 되고, 내용을 쓰면 항목·계정이 알아서 채워집니다. */
(function (root) {
  'use strict';
  var AB = root.AB, U = AB.util, C = AB.calc, St = AB.store, UI = AB.ui, SM = AB.smart;
  var esc = U.esc, $ = UI.$;
  var F = null; // 현재 편집 중인 폼 상태

  UI.cfgDraft = function () {
    var d = UI.derive(), c = JSON.parse(JSON.stringify(St.cfg() || {}));
    delete c.ts;
    c.accounts = d.eff.accounts.map(function (a) { return { name: a.name, kind: a.kind, fundable: a.fundable, billingDay: a.billingDay, payFrom: a.payFrom, hidden: a.hidden }; });
    c.expenses = d.eff.expenses.slice(); c.incomes = d.eff.incomes.slice();
    return c;
  };

  function blank(p) {
    var d = UI.derive();
    return { id: '', isNew: true, type: p.type || 'expense', date: p.date || d.today, repeat: '변동', category: '', usage: '', amount: 0, budget: 0, from: '', to: '', memo1: '', memo2: '', manual: {}, orig: null };
  }
  function fromRow(r) {
    return { id: r.id, isNew: false, type: r.type, date: r.date, repeat: r.repeat, category: r.category, usage: r.usage, amount: r.type === 'budget' ? r.budget : r.amount, budget: r.budget, from: r.from, to: r.to, memo1: r.memo1, memo2: r.memo2, manual: { cat: true, from: true, to: true, repeat: true }, orig: r };
  }
  function catType() { return F.type === 'income' ? 'income' : 'expense'; }

  function defaultAccounts() {
    var d = UI.derive();
    if (!F.manual.from && (F.type === 'expense' || F.type === 'transfer')) F.from = SM.topAccts(d.idx, F.type, 'from', 1)[0] || F.from || '';
    if (!F.manual.to && (F.type === 'income' || F.type === 'transfer')) F.to = SM.topAccts(d.idx, F.type, 'to', 1)[0] || F.to || '';
  }

  /** 예전에 쓴 같은 내용이면 항목·계정·반복·금액을 채움(사용자가 직접 고른 값은 덮어쓰지 않음) */
  function autoFill(usage) {
    var d = UI.derive(), e = d.idx.byUsage[usage];
    if (e && e.last.type === F.type) {
      var r = e.last;
      if (!F.manual.cat && r.category) F.category = r.category;
      if (!F.manual.from && r.from) F.from = r.from;
      if (!F.manual.to && r.to) F.to = r.to;
      if (!F.manual.repeat) F.repeat = r.repeat;
      if (!F.amount) F.amount = F.type === 'budget' ? r.budget : r.amount;
      return true;
    }
    if (!F.manual.cat && usage && F.type !== 'transfer') { var g = SM.guessCategory(d.idx, usage, catType()); if (g) F.category = g; }
    return false;
  }

  function chips(list, cur, key) {
    return list.map(function (n) { return '<button type="button" class="chip' + (n === cur ? ' on' : '') + '" data-act="f-pick" data-k="' + key + '" data-v="' + esc(n) + '">' + esc(n) + '</button>'; }).join('');
  }
  function selectOpts(list, cur, ph) {
    var l = list.slice(); if (cur && l.indexOf(cur) < 0) l.push(cur);
    return '<option value="">' + ph + '</option>' + l.map(function (n) { return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '<option value="__new__">＋ 새로 추가…</option>';
  }
  function uniq(a) { var s = {}; return a.filter(function (x) { if (!x || s[x]) return false; s[x] = 1; return true; }); }

  function html() {
    var edit = !F.isNew;
    return '<div class="sh-head"><h2>' + (edit ? '내역 수정' : '내역 입력') + '</h2><button class="icon-btn" data-act="close" aria-label="닫기">' + UI.icon('x') + '</button></div>' +
      '<div class="seg" id="f-types">' + [['expense', '지출'], ['income', '수입'], ['transfer', '이체'], ['budget', '예산']].map(function (t) { return '<button type="button" data-act="f-type" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="field" style="margin-top:14px"><label id="f-amt-label">금액</label><div class="suffix-wrap"><input id="f-amount" class="input amount-in num" inputmode="numeric" data-in="f-amount" placeholder="0" autocomplete="off"><span class="suffix">원</span></div>' +
      '<div class="quick-amt"><button type="button" data-act="f-add" data-v="1000">+1천</button><button type="button" data-act="f-add" data-v="5000">+5천</button><button type="button" data-act="f-add" data-v="10000">+1만</button><button type="button" data-act="f-add" data-v="50000">+5만</button><button type="button" data-act="f-add" data-v="0">지움</button></div></div>' +
      '<div class="field"><label>내용</label><input id="f-usage" class="input" data-in="f-usage" placeholder="예: 교통_버스" autocomplete="off"><div id="f-sugg" class="chips scroll" style="margin-top:6px"></div></div>' +
      '<div class="field" id="f-cat-wrap"><label>항목</label><div id="f-cat-chips" class="chips"></div><select id="f-cat" class="select" data-ch="f-cat" style="margin-top:8px"></select></div>' +
      '<div class="field" id="f-from-wrap"><label id="f-from-label">출금 계정</label><div id="f-from-chips" class="chips"></div><select id="f-from" class="select" data-ch="f-from" style="margin-top:8px"></select></div>' +
      '<div class="field" id="f-to-wrap"><label id="f-to-label">입금 계정</label><div id="f-to-chips" class="chips"></div><select id="f-to" class="select" data-ch="f-to" style="margin-top:8px"></select></div>' +
      '<div class="field"><label>날짜</label><div class="row"><input id="f-date" type="date" class="input" data-ch="f-date" style="flex:1"><button type="button" class="chip" data-act="f-day" data-v="0">오늘</button><button type="button" class="chip" data-act="f-day" data-v="-1">어제</button><button type="button" class="chip" data-act="f-day" data-v="-2">그제</button></div></div>' +
      '<div class="field"><label>반복</label><div class="seg" id="f-repeat"><button type="button" data-act="f-repeat" data-v="변동">변동</button><button type="button" data-act="f-repeat" data-v="고정">고정</button></div><div class="hint" id="f-repeat-hint" style="margin-top:4px"></div></div>' +
      '<details class="more" id="f-more"><summary>더보기 · 예산금액 · 메모 · 문자 붙여넣기</summary>' +
      '<div class="field" id="f-budget-wrap" style="margin-top:8px"><label>예산금액 <span class="faint">(비우면 계획 없음)</span></label><input id="f-budget" class="input num" inputmode="numeric" data-in="f-budget" placeholder="0"></div>' +
      '<div class="field"><label>메모1</label><input id="f-memo1" class="input" placeholder="예: ★ 13회 / 24회"></div><div class="field"><label>메모2</label><input id="f-memo2" class="input"></div>' +
      (F.isNew ? '<div class="field"><label>카드 승인 문자 붙여넣기</label><textarea id="f-sms" class="textarea input" rows="3" placeholder="[하나카드] 승인 12,300원 일시불 10/16 12:34 스타벅스"></textarea><div class="row" style="margin-top:6px"><button type="button" class="btn sm ghost" data-act="f-paste">클립보드에서 붙여넣기</button><button type="button" class="btn sm soft" data-act="f-sms">분석해서 채우기</button></div></div>' : '') +
      '</details><div id="f-err" class="err-msg"></div>' +
      '<div class="row">' + (F.isNew ? '<button type="button" class="btn ghost" data-act="f-save" data-more="1" style="flex:1">저장하고 계속</button>' : '<button type="button" class="btn ghost danger-t" data-act="f-del" style="flex:1;color:var(--expense)">삭제</button><button type="button" class="btn ghost" data-act="f-copy" style="flex:1">복사</button>') +
      '<button type="button" class="btn" data-act="f-save" style="flex:2">저장</button></div>';
  }

  function refresh() {
    var d = UI.derive(), t = F.type, root = UI.sheetEl(); if (!root) return;
    var seg = $('#f-types'); seg.className = 'seg t-' + t;
    Array.prototype.forEach.call(seg.children, function (b) { b.classList.toggle('on', b.dataset.v === t); });
    $('#f-amt-label').textContent = t === 'budget' ? '예산금액 (계획)' : t === 'expense' ? '확정금액' : '금액';
    var showCat = t !== 'transfer', showFrom = t === 'expense' || t === 'transfer', showTo = t === 'income' || t === 'transfer';
    $('#f-cat-wrap').hidden = !showCat; $('#f-from-wrap').hidden = !showFrom; $('#f-to-wrap').hidden = !showTo;
    $('#f-budget-wrap').hidden = t !== 'expense';
    $('#f-from-label').textContent = t === 'transfer' ? '보내는 계정 (돈이 나가는 곳)' : '출금 계정 (돈이 나가는 곳)';
    $('#f-to-label').textContent = t === 'transfer' ? '받는 계정 (돈이 들어가는 곳)' : '입금 계정 (돈이 들어가는 곳)';
    var rep = $('#f-repeat'); Array.prototype.forEach.call(rep.children, function (b) { b.classList.toggle('on', b.dataset.v === F.repeat); });
    $('#f-repeat-hint').textContent = F.repeat === '고정' && t === 'expense' ? '고정 지출은 예산금액에도 같은 값이 저장돼요(시트의 기존 방식).' : '';
    if (showCat) {
      var names = t === 'income' ? d.eff.incomes : d.eff.expenses, top = SM.topCats(d.idx, t === 'budget' ? 'expense' : t, 8);
      $('#f-cat-chips').innerHTML = chips(uniq([F.category].concat(top)).slice(0, 9), F.category, 'category');
      $('#f-cat').innerHTML = selectOpts(names, F.category, '항목 선택');
    }
    var accts = d.eff.accounts.map(function (a) { return a.name; });
    if (showFrom) { $('#f-from-chips').innerHTML = chips(uniq([F.from].concat(SM.topAccts(d.idx, t, 'from', 6))).slice(0, 7), F.from, 'from'); $('#f-from').innerHTML = selectOpts(accts, F.from, '계정 선택'); }
    if (showTo) { $('#f-to-chips').innerHTML = chips(uniq([F.to].concat(SM.topAccts(d.idx, t, 'to', 6))).slice(0, 7), F.to, 'to'); $('#f-to').innerHTML = selectOpts(accts, F.to, '계정 선택'); }
    var am = $('#f-amount'); if (document.activeElement !== am) am.value = F.amount ? U.fmtInput(F.amount) : '';
    var us = $('#f-usage'); if (document.activeElement !== us) us.value = F.usage;
    var dt = $('#f-date'); if (dt.value !== F.date) dt.value = F.date;
    suggest();
  }

  function suggest() {
    var d = UI.derive(), list = SM.suggest(d.idx, F.usage, F.type, 6).filter(function (s) { return s.usage !== F.usage; });
    $('#f-sugg').innerHTML = list.map(function (s) { return '<button type="button" class="chip" data-act="f-sugg" data-u="' + esc(s.usage) + '">' + esc(s.usage.length > 16 ? s.usage.slice(0, 15) + '…' : s.usage) + '</button>'; }).join('') ||
      (F.usage ? '' : '<span class="faint tiny">자주 쓰는 내역이 여기에 나타나요</span>');
  }

  function open(f, prefill) {
    F = f;
    UI.sheet(html(), { onClose: function () { F = null; } });
    $('#f-memo1').value = F.memo1; $('#f-memo2').value = F.memo2; $('#f-budget').value = F.budget ? U.fmtInput(F.budget) : '';
    if (F.isNew) {
      if (prefill && prefill.usage) { F.usage = prefill.usage; autoFill(prefill.usage); }
      defaultAccounts();
    }
    refresh();
    if (F.isNew && !(prefill && prefill.usage)) setTimeout(function () { var a = $('#f-amount'); if (a) a.focus(); }, 60);
  }
  UI.openAdd = function (prefill) { open(blank(prefill || {}), prefill || {}); };
  UI.openEdit = function (id) { var r = St.get(id); if (r) open(fromRow(r)); };

  /* ───── 입력 처리 ───── */
  UI.inputs['f-amount'] = function (el) { el.value = U.fmtInput(el.value); F.amount = U.parseInput(el.value); };
  UI.inputs['f-budget'] = function (el) { el.value = U.fmtInput(el.value); F.budget = U.parseInput(el.value); };
  UI.inputs['f-usage'] = function (el) { F.usage = el.value; autoFillQuiet(); suggest(); };
  function autoFillQuiet() { // 입력 중에는 칩만 바꾸고 내용 입력창은 건드리지 않음
    var before = [F.category, F.from, F.to, F.repeat, F.amount].join('|'); autoFill(F.usage);
    if (before !== [F.category, F.from, F.to, F.repeat, F.amount].join('|')) refreshKeepInputs();
  }
  function refreshKeepInputs() { var us = F.usage; refresh(); var el = $('#f-usage'); if (el && el.value !== us) el.value = us; }
  UI.changes['f-date'] = function (el) { F.date = el.value; };
  UI.actions['f-day'] = function (el) { F.date = U.addDays(U.today(), +el.dataset.v); $('#f-date').value = F.date; };
  UI.actions['f-type'] = function (el) {
    F.type = el.dataset.v;
    var d = UI.derive(), names = F.type === 'income' ? d.eff.incomes : d.eff.expenses;
    if (F.category && names.indexOf(F.category) < 0) { F.category = ''; F.manual.cat = false; }
    if (F.type === 'transfer') F.category = '';
    F.manual.from = F.manual.to = false; F.from = F.to = ''; defaultAccounts(); autoFill(F.usage); refresh();
  };
  UI.actions['f-repeat'] = function (el) { F.repeat = el.dataset.v; F.manual.repeat = true; refresh(); };
  UI.actions['f-pick'] = function (el) { var k = el.dataset.k; F[k] = el.dataset.v; F.manual[k === 'category' ? 'cat' : k] = true; refresh(); };
  UI.actions['f-add'] = function (el) { var v = +el.dataset.v; F.amount = v ? F.amount + v : 0; $('#f-amount').value = F.amount ? U.fmtInput(F.amount) : ''; };
  UI.actions['f-sugg'] = function (el) { F.usage = el.dataset.u; F.manual = {}; autoFill(F.usage); defaultAccounts(); refresh(); $('#f-usage').value = F.usage; };

  function pickChange(key, list) {
    return async function (el) {
      var v = el.value;
      if (v === '__new__') {
        var name = await UI.prompt(key === 'category' ? '새 항목 이름' : '새 계정 이름', '');
        name = (name || '').trim();
        if (name) {
          var cfg = UI.cfgDraft();
          if (key === 'category') { var arr = F.type === 'income' ? cfg.incomes : cfg.expenses; if (arr.indexOf(name) < 0) arr.push(name); }
          else if (!cfg.accounts.some(function (a) { return a.name === name; })) { var k = C.guessKind(name); cfg.accounts.push({ name: name, kind: k, fundable: k === 'bank' || k === 'cash', billingDay: 0, payFrom: '', hidden: false }); }
          await St.saveCfg(cfg); v = name;
        } else v = F[key];
      }
      F[key] = v; F.manual[key === 'category' ? 'cat' : key] = true; refresh();
    };
  }
  UI.changes['f-cat'] = pickChange('category'); UI.changes['f-from'] = pickChange('from'); UI.changes['f-to'] = pickChange('to');

  UI.actions['f-paste'] = async function () {
    try { var t = await navigator.clipboard.readText(); $('#f-sms').value = t; UI.actions['f-sms'](); }
    catch (e) { UI.toast('붙여넣기 권한이 없어요. 문자를 길게 눌러 직접 붙여넣어 주세요.'); }
  };
  UI.actions['f-sms'] = function () {
    var d = UI.derive(), res = SM.parseSms($('#f-sms').value, d.eff.accounts, d.today);
    if (!res.ok) { $('#f-err').textContent = res.notes.join(' ') || '문자에서 금액을 찾지 못했어요.'; return; }
    F.type = res.type; F.amount = res.amount; if (res.date) F.date = res.date;
    F.manual = {}; F.category = ''; F.from = F.to = '';
    if (res.account) { if (res.type === 'income') { F.to = res.account; F.manual.to = true; } else { F.from = res.account; F.manual.from = true; } }
    F.usage = res.usage;
    var hit = SM.suggest(d.idx, res.usage, res.type, 1)[0]; // 가맹점 이름이 포함된 과거 내역이 있으면 항목을 따라감
    if (hit) { F.category = hit.row.category; if (!F.manual.from && !F.manual.to) { F.from = hit.row.from; F.to = hit.row.to; } }
    else autoFill(F.usage);
    defaultAccounts(); refresh(); $('#f-err').textContent = res.notes.join(' ');
    UI.toast('문자 내용을 채웠어요. 항목·계정을 확인하고 저장하세요.');
  };

  /* ───── 저장 / 삭제 / 복사 ───── */
  UI.actions['f-save'] = async function (el) {
    var more = el.dataset.more === '1', t = F.type, err = $('#f-err');
    F.memo1 = $('#f-memo1').value.trim(); F.memo2 = $('#f-memo2').value.trim(); F.usage = $('#f-usage').value.trim(); F.date = $('#f-date').value;
    var bad = function (m) { err.textContent = m; var sh = UI.sheetEl(); if (sh) sh.scrollTop = sh.scrollHeight; };
    if (!U.parse(F.date)) return bad('날짜를 선택해 주세요.');
    if (!(F.amount > 0)) return bad(t === 'budget' ? '예산금액을 입력해 주세요.' : '금액을 입력해 주세요.');
    if (t !== 'transfer' && !F.category) return bad('항목을 골라 주세요.');
    if ((t === 'expense' || t === 'transfer') && !F.from) return bad(t === 'transfer' ? '보내는 계정을 골라 주세요.' : '출금 계정을 골라 주세요. (돈이 빠져나가는 계정이에요)');
    if ((t === 'income' || t === 'transfer') && !F.to) return bad(t === 'transfer' ? '받는 계정을 골라 주세요.' : '입금 계정을 골라 주세요. (돈이 들어오는 계정이에요)');
    if (t === 'transfer' && F.from === F.to) return bad('보내는 계정과 받는 계정이 같아요.');
    var budget = t === 'budget' ? F.amount : (t === 'expense' ? (F.budget || 0) : 0);
    if (t === 'expense' && F.repeat === '고정' && !budget) budget = F.amount;
    var row = {
      id: F.id || U.uid(), date: F.date, type: t, repeat: F.repeat, category: t === 'transfer' ? '' : F.category, usage: F.usage,
      budget: budget, amount: t === 'budget' ? 0 : F.amount, from: (t === 'expense' || t === 'transfer') ? F.from : '', to: (t === 'income' || t === 'transfer') ? F.to : '',
      memo1: F.memo1, memo2: F.memo2, rev: F.orig ? F.orig.rev : 0
    };
    var orig = F.orig, wasNew = F.isNew;
    var saved = await St.save(row);
    var undo = function () { if (wasNew) St.remove(saved.id); else St.save(orig); };
    if (more) {
      UI.toast('저장했어요 · 계속 입력하세요', { kind: 'ok', action: { label: '되돌리기', fn: undo } });
      var keep = { type: t, date: F.date };
      F = blank(keep); F.repeat = row.repeat; $('#f-memo1').value = ''; $('#f-memo2').value = ''; $('#f-budget').value = ''; $('#f-usage').value = ''; $('#f-amount').value = ''; err.textContent = '';
      defaultAccounts(); refresh(); setTimeout(function () { $('#f-amount').focus(); }, 30);
    } else {
      UI.closeSheet();
      UI.toast(wasNew ? '저장했어요' : '수정했어요', { kind: 'ok', action: { label: '되돌리기', fn: undo } });
    }
  };
  UI.actions['f-del'] = async function () {
    var r = F.orig; if (!r) return;
    if (!(await UI.confirm('이 내역을 삭제할까요?\n' + (r.usage || r.category) + ' · ' + U.won(r.type === 'budget' ? r.budget : r.amount), { danger: true, ok: '삭제' }))) return;
    await St.remove(r.id); UI.closeSheet();
    UI.toast('삭제했어요', { action: { label: '되돌리기', fn: function () { St.save(r); } } });
  };
  UI.actions['f-copy'] = function () {
    var r = F.orig; if (!r) return;
    UI.closeSheet();
    var f = fromRow(r); f.id = ''; f.isNew = true; f.orig = null; f.date = UI.derive().today; f.manual = { cat: true, from: true, to: true, repeat: true };
    open(f);
  };

})(typeof window !== 'undefined' ? window : globalThis);
