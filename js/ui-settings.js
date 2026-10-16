/* 설정 — 시트 연결/동기화, 충돌 보관함, 보안, 계정·항목 관리(이름 바꾸면 내역도 함께), 엑셀, 데이터 도구, 화면 */
(function (root) {
  'use strict';
  var AB = root.AB, U = AB.util, C = AB.calc, St = AB.store, Sy = AB.sync, UI = AB.ui;
  var esc = U.esc, won = U.won, S = UI.S, $ = UI.$;

  UI.applyTheme = function (mode) {
    var el = document.documentElement;
    if (mode === 'light' || mode === 'dark') el.setAttribute('data-theme', mode); else el.removeAttribute('data-theme');
    var dark = mode === 'dark' || (mode !== 'light' && root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#121516' : '#2F5D53');
  };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* 무시 */ } return null; }

  function usageCount(kind, name) {
    return St.rows().filter(function (r) {
      if (kind === 'accounts') return r.from === name || r.to === name;
      if (kind === 'expenses') return (r.type === 'expense' || r.type === 'budget') && r.category === name;
      return r.type === 'income' && r.category === name;
    }).length;
  }

  function statusText(st) {
    if (!st.configured) return '연결 안 됨';
    if (st.state === 'syncing') return '동기화 중…'; if (st.state === 'error') return '오류: ' + st.error; if (st.state === 'offline') return '오프라인';
    return st.pending ? '보낼 변경 ' + st.pending + '건 대기 중' : '최신 상태';
  }

  function render() {
    var d = UI.derive(), st = Sy.status(), conf = St.conflicts(), theme = ls('ab.theme') || 'auto', lockSec = ls('ab.lockSec');
    lockSec = lockSec === null ? '60' : lockSec;
    var h = '<div class="card"><h3>구글 시트 연결 <span class="chip ' + (!st.configured ? '' : st.state === 'error' ? 'bad' : 'ok') + '">' + (st.configured ? (st.state === 'error' ? '오류' : '연결됨') : '미연결') + '</span></h3>' +
      '<div class="field"><label>웹 앱 URL</label><input id="set-url" class="input" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(Sy.getUrl()) + '" autocomplete="off" autocapitalize="off"></div>' +
      '<div class="field"><label>연결 토큰 <span class="faint">(시트 메뉴 &gt; 가계부 v2 &gt; 앱 연결 토큰 보기)</span></label><input id="set-token" class="input" type="password" placeholder="토큰" value="' + esc(Sy.getToken()) + '" autocomplete="off"></div>' +
      '<div class="row"><button class="btn grow" data-act="conn-save">저장하고 연결 테스트</button></div>' +
      '<div class="kvs" style="margin-top:12px"><div><span>상태</span><b>' + esc(statusText(st)) + '</b></div><div><span>마지막 동기화</span><b>' + UI.relTime(st.last) + '</b></div><div><span>이 기기의 내역</span><b class="num">' + d.rows.length + '건</b></div><div><span>서버 버전(rev)</span><b class="num">' + st.rev + '</b></div></div>' +
      '<div class="row" style="margin-top:12px;gap:8px"><button class="btn sm soft grow" data-act="sync">지금 동기화</button><button class="btn sm ghost grow" data-act="resync">서버 기준으로 다시 받기</button>' + (st.configured ? '<button class="btn sm ghost" data-act="conn-clear">연결 끊기</button>' : '') + '</div></div>';

    if (conf.length) {
      h += '<div class="card"><h3>다른 곳에서 먼저 바뀐 내역 <span class="chip near">' + conf.length + '건</span></h3><p class="hint" style="margin-bottom:6px">시트나 다른 기기에서 더 나중에 바꾼 값이 있어서 그 값을 유지했어요. 내 값이 맞다면 되살릴 수 있어요.</p>';
      conf.forEach(function (c) {
        var m = c.mine || {}, t = c.theirs || {};
        h += '<div class="fund-row"><b>' + esc(m.usage || m.category || '내역') + '</b> <span class="muted small">' + esc(m.date || '') + '</span>' +
          '<div class="small num" style="margin:4px 0">내 값 <b>' + U.num(m.type === 'budget' ? m.budget : m.amount) + '원</b> · 유지된 값 <b>' + U.num(t.type === 'budget' ? t.budget : t.amount) + '원</b></div>' +
          '<div class="row" style="gap:8px"><button class="btn sm soft" data-act="conf-keep" data-c="' + c.cid + '">내 값으로 되살리기</button><button class="btn sm ghost" data-act="conf-drop" data-c="' + c.cid + '">버리기</button></div></div>';
      });
      h += '</div>';
    }

    h += '<div class="card"><h3>보안</h3>' +
      '<div class="setrow"><span>자동 잠금</span><select class="select" style="width:auto;min-width:9em" data-ch="lock-sec">' + [['0', '앱을 나가면 바로'], ['30', '30초 후'], ['60', '1분 후'], ['300', '5분 후'], ['-1', '자동 잠금 안 함']].map(function (o) { return '<option value="' + o[0] + '"' + (lockSec === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="setrow"><span>PIN 변경</span><button class="btn sm soft" data-act="pin-change">변경</button></div>' +
      '<div class="setrow"><span>지금 잠그기</span><button class="btn sm ghost" data-act="lock">잠금</button></div>' +
      '<p class="hint" style="margin-top:6px">PIN은 화면을 가리는 잠금이에요(데이터 암호화가 아닙니다). 기기 자체 잠금과 함께 쓰세요.</p></div>';

    h += mgrCard('계정 관리', 'accounts', d.eff.accounts.map(function (a) { return a.name; }), d) + mgrCard('지출 항목 관리', 'expenses', d.eff.expenses, d) + mgrCard('수입 항목 관리', 'incomes', d.eff.incomes, d);

    h += '<div class="card"><h3>데이터</h3>' +
      '<input id="xl-file" type="file" accept=".xlsx,.xls,.csv" data-ch="xl-file" hidden>' +
      '<div class="setrow"><span>엑셀 가져오기 <span class="faint small">(.xlsx/.csv)</span></span><button class="btn sm soft" data-act="xl-pick">파일 선택</button></div>' +
      '<div class="setrow"><span>엑셀로 내보내기(백업)</span><button class="btn sm soft" data-act="xl-export">내려받기</button></div>' +
      '<div class="setrow"><span>정합성 점검 <span class="faint small">수입−지출−잔액</span></span><button class="btn sm soft" data-act="audit">점검</button></div>' +
      '<div class="setrow"><span>' + U.parse(S.month + '-01').m + '월 내역 모두 삭제</span><button class="btn sm ghost" style="color:var(--expense)" data-act="month-del">삭제</button></div>' +
      '<div class="setrow"><span>이 기기 데이터 초기화</span><button class="btn sm ghost" style="color:var(--expense)" data-act="wipe">초기화</button></div></div>';

    h += '<div class="card"><h3>화면</h3><div class="seg">' + [['auto', '자동'], ['light', '라이트'], ['dark', '다크']].map(function (t) { return '<button class="' + (theme === t[0] ? 'on' : '') + '" data-act="theme" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div></div>';
    h += '<p class="hint center faint" style="padding:6px 0 0">통합 가계부 v' + (AB.VERSION || '2') + ' · 시트 = 데이터 보관소 · 앱 = 계산·입력</p>';
    return h;
  }

  function mgrCard(title, kind, names, d) {
    var meta = {}; d.eff.accounts.forEach(function (a) { meta[a.name] = a; });
    var h = '<div class="card"><h3>' + title + '</h3>';
    names.forEach(function (n, i) {
      var a = kind === 'accounts' ? meta[n] : null, cnt = usageCount(kind, n);
      h += '<div class="mgr"><div class="nm">' + esc(n) + (a ? ' <span class="tag">' + C.KIND_LABEL[a.kind] + '</span>' + (a.kind === 'card' && a.billingDay ? '<span class="tag soon">매월 ' + a.billingDay + '일</span>' : '') : '') + '<div class="tiny faint" style="font-weight:400">' + cnt + '건 사용</div></div>' +
        '<button class="mini-btn" data-act="mv" data-t="' + kind + '" data-n="' + esc(n) + '" data-d="-1" ' + (i === 0 ? 'disabled style="opacity:.3"' : '') + ' aria-label="위로">↑</button>' +
        '<button class="mini-btn" data-act="mv" data-t="' + kind + '" data-n="' + esc(n) + '" data-d="1" ' + (i === names.length - 1 ? 'disabled style="opacity:.3"' : '') + ' aria-label="아래로">↓</button>' +
        '<button class="mini-btn" data-act="' + (kind === 'accounts' ? 'acct-edit' : 'cat-ren') + '" data-t="' + kind + '" data-n="' + esc(n) + '" aria-label="편집">✎</button>' +
        (kind === 'accounts' ? '' : '<button class="mini-btn" style="color:var(--expense)" data-act="cat-del" data-t="' + kind + '" data-n="' + esc(n) + '" aria-label="삭제">✕</button>') + '</div>';
    });
    return h + '<button class="btn sm ghost block" style="margin-top:6px" data-act="' + (kind === 'accounts' ? 'acct-add' : 'cat-add') + '" data-t="' + kind + '">＋ 추가</button></div>';
  }

  UI.views.settings = { render: render };

  /* ───── 시트 연결 ───── */
  UI.actions['conn-save'] = async function () {
    var url = $('#set-url').value.trim(), tok = $('#set-token').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/|^http:\/\/(localhost|127\.0\.0\.1)[:\/]/.test(url)) { UI.toast('웹 앱 URL은 https://script.google.com/macros/s/…/exec 형태예요', { kind: 'err', ms: 4500 }); return; }
    if (!tok) { UI.toast('토큰을 입력해 주세요', { kind: 'err' }); return; }
    Sy.setConn(url, tok);
    UI.toast('연결을 확인하는 중…', { ms: 1500 });
    var r = await Sy.ping();
    if (!r.ok) { UI.toast(r.error, { kind: 'err', ms: 6000 }); UI.render(); return; }
    UI.toast('연결됐어요 (시트 ' + r.rows + '행). 내역을 불러올게요.', { kind: 'ok' });
    await UI.runSync({ manual: true, full: !St.meta('synced') });
    UI.render();
  };
  UI.actions['conn-clear'] = async function () {
    if (await UI.confirm('시트 연결을 끊을까요?\n이 기기의 내역은 그대로 남아요.', { danger: true, ok: '연결 끊기' })) { Sy.clearConn(); UI.render(); }
  };
  UI.actions.resync = async function () {
    var n = St.pendingCount();
    if (!(await UI.confirm('시트(서버)에 있는 내용으로 이 기기를 다시 맞춥니다.' + (n ? '\n아직 못 보낸 변경 ' + n + '건은 먼저 보낸 뒤 맞춰요.' : ''), { ok: '다시 받기' }))) return;
    await UI.runSync({ manual: true, full: true });
  };
  UI.actions['conf-keep'] = async function (el) {
    var c = St.conflicts().filter(function (x) { return x.cid === +el.dataset.c; })[0]; if (!c) return;
    await St.save(Object.assign({}, c.mine, { id: c.id })); await St.dismissConflict(c.cid); UI.toast('내 값으로 되살렸어요', { kind: 'ok' });
  };
  UI.actions['conf-drop'] = function (el) { return St.dismissConflict(+el.dataset.c); };

  /* ───── 보안 ───── */
  UI.changes['lock-sec'] = function (el) { ls('ab.lockSec', el.value); UI.toast('저장했어요'); };
  UI.actions['pin-change'] = async function () {
    var cur = await UI.prompt('현재 PIN을 입력하세요', '', { numeric: true }); if (cur === null) return;
    if (!(await AB.lock.verify(cur))) { UI.toast('PIN이 맞지 않아요', { kind: 'err' }); return; }
    var a = await UI.prompt('새 PIN (숫자 4~8자리)', '', { numeric: true }); if (a === null) return;
    if (!/^\d{4,8}$/.test(a)) { UI.toast('숫자 4~8자리로 입력해 주세요', { kind: 'err' }); return; }
    var b = await UI.prompt('새 PIN을 한 번 더 입력하세요', '', { numeric: true }); if (b === null) return;
    if (a !== b) { UI.toast('두 번 입력한 PIN이 달라요', { kind: 'err' }); return; }
    await AB.lock.setPin(a); UI.toast('PIN을 바꿨어요', { kind: 'ok' });
  };
  UI.actions.theme = function (el) { ls('ab.theme', el.dataset.v); UI.applyTheme(el.dataset.v); UI.render(); };

  /* ───── 계정·항목 관리 ───── */
  UI.actions.mv = async function (el) {
    var cfg = UI.cfgDraft(), kind = el.dataset.t, n = el.dataset.n, dir = +el.dataset.d, list = cfg[kind];
    var i = kind === 'accounts' ? list.findIndex(function (a) { return a.name === n; }) : list.indexOf(n), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    var t = list[i]; list[i] = list[j]; list[j] = t; await St.saveCfg(cfg);
  };
  UI.actions['cat-add'] = async function (el) {
    var kind = el.dataset.t, name = (await UI.prompt(kind === 'incomes' ? '새 수입 항목 이름' : '새 지출 항목 이름', '') || '').trim();
    if (!name) return; var cfg = UI.cfgDraft();
    if (cfg[kind].indexOf(name) >= 0) { UI.toast('이미 있는 항목이에요'); return; }
    cfg[kind].push(name); await St.saveCfg(cfg);
  };
  async function renameRows(kind, oldN, newN) {
    var rows = St.rows().filter(function (r) {
      if (kind === 'accounts') return r.from === oldN || r.to === oldN;
      if (kind === 'expenses') return (r.type === 'expense' || r.type === 'budget') && r.category === oldN;
      return r.type === 'income' && r.category === oldN;
    }).map(function (r) {
      var x = Object.assign({}, r);
      if (kind === 'accounts') { if (x.from === oldN) x.from = newN; if (x.to === oldN) x.to = newN; } else x.category = newN;
      return x;
    });
    if (rows.length) await St.saveMany(rows, { bulk: rows.length > 25 });
    return rows.length;
  }
  UI.actions['cat-ren'] = async function (el) {
    var kind = el.dataset.t, old = el.dataset.n, nn = (await UI.prompt('이름 바꾸기', old) || '').trim();
    if (!nn || nn === old) return;
    var cnt = usageCount(kind, old);
    if (cnt && !(await UI.confirm('"' + old + '" → "' + nn + '"\n이 항목을 쓴 내역 ' + cnt + '건도 함께 바뀌어요.', { ok: '바꾸기' }))) return;
    var cfg = UI.cfgDraft(), i = cfg[kind].indexOf(old);
    if (cfg[kind].indexOf(nn) >= 0) cfg[kind].splice(i, 1); else cfg[kind][i] = nn;
    await St.saveCfg(cfg); await renameRows(kind, old, nn); UI.toast('바꿨어요', { kind: 'ok' });
  };
  UI.actions['cat-del'] = async function (el) {
    var kind = el.dataset.t, n = el.dataset.n, cnt = usageCount(kind, n);
    if (cnt) { UI.toast('"' + n + '"은(는) 내역 ' + cnt + '건에 쓰이고 있어요. 이름을 바꾸거나 내역을 먼저 고쳐 주세요.', { kind: 'err', ms: 4500 }); return; }
    if (!(await UI.confirm('"' + n + '" 항목을 삭제할까요?', { danger: true, ok: '삭제' }))) return;
    var cfg = UI.cfgDraft(); cfg[kind] = cfg[kind].filter(function (x) { return x !== n; }); await St.saveCfg(cfg);
  };

  function acctSheet(name) {
    var d = UI.derive(), a = d.eff.accounts.filter(function (x) { return x.name === name; })[0] || { name: '', kind: 'bank', fundable: true, billingDay: 0, payFrom: '' };
    var isNew = !name, payOpts = d.eff.accounts.filter(function (x) { return x.name !== name && (x.kind === 'bank' || x.kind === 'cash'); });
    UI.sheet('<div class="sh-head"><h2>' + (isNew ? '계정 추가' : '계정 편집') + '</h2><button class="icon-btn" data-act="close" aria-label="닫기">' + UI.icon('x') + '</button></div>' +
      '<div class="field"><label>이름</label><input id="ac-name" class="input" value="' + esc(a.name) + '" placeholder="예: 토스뱅크"></div>' +
      '<div class="field"><label>종류</label><select id="ac-kind" class="select" data-ch="ac-kind">' + Object.keys(C.KIND_LABEL).map(function (k) { return '<option value="' + k + '"' + (a.kind === k ? ' selected' : '') + '>' + C.KIND_LABEL[k] + '</option>'; }).join('') + '</select></div>' +
      '<div class="setrow"><span>자금 부족 시 돈을 가져올 수 있는 계정<div class="tiny faint">이체 추천의 출금 후보가 돼요</div></span><label class="switch"><input id="ac-fund" type="checkbox" ' + (a.fundable ? 'checked' : '') + '><i></i></label></div>' +
      '<div id="ac-card" ' + (a.kind === 'card' ? '' : 'hidden') + '><div class="field" style="margin-top:12px"><label>카드 결제일 (매월 며칠)</label><input id="ac-day" class="input num" inputmode="numeric" value="' + (a.billingDay || '') + '" placeholder="예: 14"></div>' +
      '<div class="field"><label>결제 계좌 (카드값이 빠져나가는 계정)</label><select id="ac-pay" class="select"><option value="">선택 안 함</option>' + payOpts.map(function (x) { return '<option value="' + esc(x.name) + '"' + (a.payFrom === x.name ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></div></div>' +
      '<div id="ac-err" class="err-msg"></div><button class="btn block" data-act="ac-save" data-n="' + esc(name) + '">저장</button>' +
      (isNew ? '' : '<button class="btn ghost block" style="margin-top:8px;color:var(--expense)" data-act="ac-del" data-n="' + esc(name) + '">이 계정 삭제</button>'));
  }
  UI.actions['acct-edit'] = function (el) { acctSheet(el.dataset.n); };
  UI.actions['acct-add'] = function () { acctSheet(''); };
  UI.changes['ac-kind'] = function (el) { $('#ac-card').hidden = el.value !== 'card'; $('#ac-fund').checked = el.value === 'bank' || el.value === 'cash'; };
  UI.actions['ac-save'] = async function (el) {
    var old = el.dataset.n, nn = $('#ac-name').value.trim(), err = $('#ac-err');
    if (!nn) { err.textContent = '이름을 입력해 주세요.'; return; }
    var cfg = UI.cfgDraft(), exists = cfg.accounts.some(function (a) { return a.name === nn && a.name !== old; });
    if (exists) { err.textContent = '같은 이름의 계정이 이미 있어요.'; return; }
    var kind = $('#ac-kind').value, day = U.parseInput($('#ac-day').value);
    if (kind === 'card' && day && (day < 1 || day > 31)) { err.textContent = '결제일은 1~31 사이로 입력해 주세요.'; return; }
    var rec = { name: nn, kind: kind, fundable: $('#ac-fund').checked, billingDay: kind === 'card' ? day : 0, payFrom: kind === 'card' ? $('#ac-pay').value : '', hidden: false };
    var i = cfg.accounts.findIndex(function (a) { return a.name === old; });
    if (i >= 0) cfg.accounts[i] = rec; else cfg.accounts.push(rec);
    if (old && old !== nn) { cfg.accounts.forEach(function (a) { if (a.payFrom === old) a.payFrom = nn; }); }
    var cnt = old && old !== nn ? usageCount('accounts', old) : 0;
    if (cnt && !(await UI.confirm('"' + old + '" → "' + nn + '"\n이 계정을 쓴 내역 ' + cnt + '건도 함께 바뀌어요.', { ok: '바꾸기' }))) return;
    await St.saveCfg(cfg); if (old && old !== nn) await renameRows('accounts', old, nn);
    UI.closeSheet(); UI.toast('저장했어요', { kind: 'ok' });
  };
  UI.actions['ac-del'] = async function (el) {
    var n = el.dataset.n, cnt = usageCount('accounts', n);
    if (cnt) { UI.toast('"' + n + '"은(는) 내역 ' + cnt + '건에 쓰이고 있어서 삭제할 수 없어요. 이름을 바꾸거나 내역을 먼저 고쳐 주세요.', { kind: 'err', ms: 4500 }); return; }
    if (!(await UI.confirm('"' + n + '" 계정을 삭제할까요?', { danger: true, ok: '삭제' }))) return;
    var cfg = UI.cfgDraft(); cfg.accounts = cfg.accounts.filter(function (a) { return a.name !== n; }); cfg.accounts.forEach(function (a) { if (a.payFrom === n) a.payFrom = ''; });
    await St.saveCfg(cfg); UI.closeSheet();
  };

  /* ───── 엑셀 ───── */
  var imp = { file: null, parsed: null, replace: false };
  function impSheet() {
    var p = imp.parsed, ms = Object.keys(p.months).sort();
    UI.sheet('<div class="sh-head"><h2>엑셀 가져오기</h2><button class="icon-btn" data-act="close" aria-label="닫기">' + UI.icon('x') + '</button></div>' +
      '<div class="banner ' + (p.rows.length ? 'good' : '') + '"><span>' + (p.rows.length ? '✓' : 'ℹ') + '</span><div><b>새로 추가 ' + p.rows.length + '건 · 중복 건너뜀 ' + p.dupes + '건' + (p.skipped ? ' · 읽지 못한 행 ' + p.skipped + '건' : '') + '</b>시트 "' + esc(p.sheet) + '"' + (p.oldSchema ? ' · 예전 가계부 형식으로 인식' : '') + '</div></div>' +
      (ms.length ? '<div class="chips" style="margin-bottom:10px">' + ms.map(function (m) { return '<span class="chip">' + m + ' · ' + p.months[m] + '건</span>'; }).join('') + '</div>' : '') +
      '<div class="setrow"><span>이 파일에 있는 달의 기존 내역을 먼저 지우고 대체<div class="tiny faint">같은 내역이 중복되는 걸 막고 싶을 때</div></span><label class="switch"><input type="checkbox" data-ch="xl-replace" ' + (imp.replace ? 'checked' : '') + '><i></i></label></div>' +
      '<p class="hint" style="margin:8px 0 12px">가져오기 전에 시트가 자동으로 백업돼요(대량 작업 시). 가져온 뒤 바로 "되돌리기"도 할 수 있어요.</p>' +
      '<button class="btn block" data-act="xl-run" ' + (p.rows.length ? '' : 'disabled') + '>' + p.rows.length + '건 가져오기</button>');
  }
  UI.actions['xl-pick'] = function () { $('#xl-file').click(); };
  UI.changes['xl-file'] = async function (el) {
    var f = el.files && el.files[0]; if (!f) return;
    UI.toast('파일을 읽는 중…', { ms: 1500 });
    try { imp = { file: f, replace: false, parsed: await AB.xio.parseFile(f, St.rows()) }; impSheet(); }
    catch (e) { UI.toast(e.message, { kind: 'err', ms: 5000 }); }
    el.value = '';
  };
  UI.changes['xl-replace'] = async function (el) {
    imp.replace = el.checked; imp.parsed = await AB.xio.parseFile(imp.file, imp.replace ? [] : St.rows()); impSheet();
  };
  UI.actions['xl-run'] = async function () {
    var p = imp.parsed; if (!p || !p.rows.length) return;
    var rep = imp.replace, months = Object.keys(p.months), old = [];
    if (rep) {
      old = St.rows().filter(function (r) { return months.indexOf(r.date.slice(0, 7)) >= 0; });
      if (!(await UI.confirm(months.join(', ') + '의 기존 내역 ' + old.length + '건을 지우고 파일의 ' + p.rows.length + '건으로 대체합니다.\n계속할까요?', { danger: true, ok: '대체' }))) return;
      await St.removeMany(old.map(function (r) { return r.id; }), { bulk: true });
    }
    var saved = await St.saveMany(p.rows, { bulk: true });
    UI.closeSheet();
    UI.toast('가져왔어요 · ' + saved.length + '건', { kind: 'ok', action: { label: '되돌리기', fn: async function () { await St.removeMany(saved.map(function (r) { return r.id; }), { bulk: true }); if (old.length) await St.saveMany(old, { bulk: true }); } } });
  };
  UI.actions['xl-export'] = async function () {
    if (!St.count()) { UI.toast('내보낼 내역이 없어요'); return; }
    var name = await AB.xio.exportRows(St.rows()); UI.toast(name + ' 저장을 시작했어요', { kind: 'ok' });
  };

  /* ───── 데이터 도구 ───── */
  UI.actions['month-del'] = async function () {
    var d = UI.derive(), rows = d.rows.filter(function (r) { return r.date >= d.range.start && r.date <= d.range.end; }), p = U.parse(S.month + '-01');
    if (!rows.length) { UI.toast(p.m + '월에는 지울 내역이 없어요'); return; }
    if (!(await UI.confirm(p.y + '년 ' + p.m + '월 내역 ' + rows.length + '건을 모두 삭제할까요?\n시트에서도 지워집니다. (직후에는 되돌리기 가능)', { danger: true, ok: '모두 삭제' }))) return;
    await St.removeMany(rows.map(function (r) { return r.id; }), { bulk: true });
    UI.toast(rows.length + '건을 삭제했어요', { action: { label: '되돌리기', fn: function () { St.saveMany(rows, { bulk: true }); } }, ms: 8000 });
  };
  UI.actions.wipe = async function () {
    if (!(await UI.confirm('이 기기에 저장된 내역·설정·PIN·시트 연결 정보를 모두 지웁니다.\n시트의 데이터는 그대로 남아요.\n계속할까요?', { danger: true, ok: '초기화' }))) return;
    await St.wipe(); ['ab.url', 'ab.token', 'ab.pin', 'ab.lockSec', 'ab.theme'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } });
    location.reload();
  };

})(typeof window !== 'undefined' ? window : globalThis);
