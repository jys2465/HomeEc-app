/**
 * ==========================================================================
 *  통합 가계부 v2  ·  Google Apps Script  (시트에 '바인딩'된 스크립트)
 * ==========================================================================
 *  이 스크립트가 하는 일
 *   1) 앱 ↔ 구글시트 동기화 API (웹 앱)  : '변경분'만 주고받습니다. (전체 덮어쓰기 없음)
 *   2) 시트에서 사람이 직접 고친 내용도 변경 이력에 자동 반영 (reconcile)
 *   3) sumary 시트 갱신(기존 filterDataToSummary 기능을 그대로 이어받음)
 *   4) 백업(일일 스냅샷) 및 변경 이력 정리
 *
 *  설치 방법은 같은 폴더의 README.md 를 보세요.
 *  요약: 시트 > 확장 프로그램 > Apps Script > 이 파일 전체 붙여넣기 > 저장 >
 *        setup 실행(권한 허용) > 배포 > 새 배포 > 웹 앱(나로 실행 / 모든 사용자)
 * ==========================================================================
 */

const VERSION = 3;
const SHEET = { DATA: 'data', CHANGES: 'changes', IDS: '_ids', CONFIG: 'config', SUM: 'sumary' };
const NCOL = 11; // data 시트의 A~K (사용일자 … 메모2) — 이 11열의 위치/의미는 절대 바꾸지 않습니다.
const HEADERS = ['사용일자', '유형', '반복성', '계정항목', '사용내역', '예산금액', '확정금액', '출금계정', '입금계정', '메모1', '메모2'];
const META = ['id', 'rev', 'updated', 'time']; // time = 앱에서 입력한 시각(HH:MM). 지문(hash)에는 넣지 않아 시트 직접 수정 감지에 영향 없음 // 이름으로 찾는 보조 열(자동 추가·숨김). L열이 있어도/없어도 상관없습니다.
const DATE_FMT = 'yyyy-mm-dd(aaa)';
const TYPE_KO = { expense: '지출', income: '수입', transfer: '이체', budget: '예산' };
const LIMITS = {
  opsPerCall: 300,      // 한 번에 처리할 변경 수
  delPerCall: 30,       // 한 번에 지울 수 있는 행 (초과 시 bulk 확인 필요)
  delBulk: 600,         // bulk 확인 시 최대
  changesKeep: 8000,    // 변경 이력 보관 건수
  backupKeepDays: 14,   // (자동정리 ON일 때) 일일 백업 보관 일수. 매월 1일분은 계속 보관
  textMax: 200,
  memoMax: 500
};

/* ───────────────────────────── 메뉴 ───────────────────────────── */

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('가계부 v2')
      .addItem('① 초기 설정 / 점검 (setup)', 'setup')
      .addItem('앱 연결 토큰 보기', 'showToken')
      .addItem('구글 캘린더 · Tasks 연동 허용 (linkSetup)', 'linkSetup')
      .addItem('토큰 새로 만들기', 'rotateToken')
      .addSeparator()
      .addItem('요약(sumary) 새로고침', 'filterDataToSummary')
      .addItem('지금 백업(스냅샷) 만들기', 'menuSnapshot')
      .addItem('data 날짜순 정렬 (최신이 위)', 'menuSortData')
      .addItem('ID·변경이력 점검', 'menuDiagnose')
      .addSeparator()
      .addItem('자동 작업 설치/재설치', 'installTriggers')
      .addItem('오래된 백업 자동정리 켜기/끄기', 'togglePrune')
      .addToUi();
  } catch (e) { /* 웹앱 실행 중에는 UI 없음 */ }
}

/* ───────────────────────────── 웹 앱 진입점 ───────────────────────────── */

/** 브라우저에서 URL을 열어 보는 용도(연결 확인). 데이터는 절대 반환하지 않습니다. */
function doGet() {
  return json_({ ok: true, app: 'gagyebu', v: VERSION, time: new Date().toISOString() });
}

function doPost(e) {
  let out;
  try {
    const p = JSON.parse(e.postData.contents);
    if (!checkToken_(p.k)) return json_({ ok: false, err: 'auth' });
    switch (p.a) {
      case 'ping': out = ping_(); break;
      case 'sync': out = sync_(p); break;
      case 'sum': out = { ok: true, sum: sumarySnapshot_() }; break;
      case 'side': out = side_(p); break;
      default: out = { ok: false, err: 'unknown_action' };
    }
  } catch (err) {
    // 오류는 '오류'로만 응답합니다. (빈 데이터를 성공처럼 돌려주면 앱이 로컬을 지울 수 있기 때문)
    out = { ok: false, err: String(err && err.message ? err.message : err) };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(k) {
  const t = props_().getProperty('TOKEN');
  if (!t || !k) return false;
  const a = String(k), b = String(t);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ping_() {
  const env = ensureSchema_();
  return {
    ok: true, v: VERSION, rev: getRev_(env), rows: Math.max(0, env.data.getLastRow() - 1),
    tz: env.ss.getSpreadsheetTimeZone(), scriptTz: Session.getScriptTimeZone()
  };
}

/* ───────────────────────────── 동기화 핵심 ───────────────────────────── */

function sync_(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, err: 'busy' };
  try { return syncLocked_(p); } finally { lock.releaseLock(); }
}

/**
 * 요청: { a:'sync', since:<마지막으로 받은 서버rev, 처음이면 -1>, dev:'기기', ops:[{op:'put'|'del', id, ts, base, row}], bulk?, cfg?, cfgTs?, want?:'sum' }
 * 응답: { ok, rev, changes:[{rev,op,id,ts,row}] | full:true, rows:[...], conflicts, rejected, cfg?, sum? }
 */
function syncLocked_(p) {
  const now = Date.now();
  const env = ensureSchema_();
  const dev = String(p.dev || '').slice(0, 40);
  const slots = loadSlots_(env);
  const items = slots.filter(function (s) { return !s.blank; });
  const reg = loadRegistry_(env);
  let rev = getRev_(env);
  const baseline = (reg.count === 0 && rev === 0); // 맨 처음 한 번: 기존 행을 '이력 없이' 등록만 함
  const log = [];

  // A. 모든 행이 고유한 id를 갖도록 보장 (없거나 중복이면 새로 부여)
  const seen = {};
  let idsChanged = false;
  items.forEach(function (it) {
    if (!it.id || seen[it.id]) { it.id = newId_(); it.fresh = true; idsChanged = true; }
    seen[it.id] = true;
  });
  if (idsChanged) writeCol_(env.data, env.mc.id, slots, function (s) { return s.id || ''; });

  // B. 시트에서 사람이 직접 바꾼 것 감지 (신규/수정/삭제) → 변경 이력에 기록
  const byId = {};
  items.forEach(function (it) { byId[it.id] = it; });
  items.forEach(function (it) {
    it.hash = hash_(it.row);
    if (baseline) return;
    const prev = reg.map[it.id];
    if (it.fresh || prev === undefined || prev !== it.hash) {
      it.rev = ++rev; it.ts = now;
      log.push({ rev: it.rev, op: 'put', id: it.id, row: it.row, ts: it.ts, dev: 'sheet' });
    }
  });
  if (!baseline) {
    Object.keys(reg.map).forEach(function (id) {
      if (!byId[id]) log.push({ rev: ++rev, op: 'del', id: id, ts: now, dev: 'sheet' });
    });
  }

  // C. 앱에서 온 변경 적용 (메모리 상에서 먼저 계산)
  const ops = Array.isArray(p.ops) ? p.ops.slice(0, LIMITS.opsPerCall) : [];
  const conflicts = [], rejected = [];
  const updates = [], deletes = [], inserts = [];
  const delCount = ops.filter(function (o) { return o && o.op === 'del'; }).length;
  const bulk = p.bulk === true;
  if (delCount > LIMITS.delPerCall && !bulk) return { ok: false, err: 'too_many_deletes', limit: LIMITS.delPerCall };
  if (delCount > LIMITS.delBulk) return { ok: false, err: 'too_many_deletes', limit: LIMITS.delBulk };
  if (ops.length && (bulk || delCount > LIMITS.delPerCall)) snapshot_('bulk'); // 대량 작업 전 자동 백업

  ops.forEach(function (o) {
    if (!o || typeof o.id !== 'string' || !/^[\w-]{6,40}$/.test(o.id)) { rejected.push({ id: o && o.id, reason: 'bad_id' }); return; }
    const it = byId[o.id];
    if (o.op === 'del') {
      if (!it) return; // 이미 없음 → 그대로 성공(멱등)
      deletes.push(it);
      delete byId[o.id];
      log.push({ rev: ++rev, op: 'del', id: o.id, ts: now, dev: dev });
      return;
    }
    if (o.op !== 'put') { rejected.push({ id: o.id, reason: 'bad_op' }); return; }
    const row = sanitizeRow_(o.row);
    if (!row) { rejected.push({ id: o.id, reason: 'bad_row' }); return; }
    const ots = Math.min(Number(o.ts) || now, now + 60000);
    if (it) {
      if (sameRow_(it.row, row)) return; // 내용이 같으면 할 일 없음
      const changedElsewhere = it.rev > (Number(o.base) || 0);
      if (changedElsewhere && it.ts > ots) { // 그 사이 다른 곳에서 더 늦게 고쳤다 → 서버 값 유지, 내 값은 충돌로 돌려줌
        conflicts.push({ id: o.id, win: 'server', mine: row, theirs: it.row, theirsRev: it.rev });
        return;
      }
      updates.push({ it: it, oldRow: it.row, newRow: row });
      it.row = row; it.hash = hash_(row); it.rev = ++rev; it.ts = ots;
      log.push({ rev: it.rev, op: 'put', id: o.id, row: row, ts: ots, dev: dev });
    } else {
      const ni = { id: o.id, row: row, rev: ++rev, ts: ots, hash: hash_(row), isNew: true };
      inserts.push(ni); items.push(ni); byId[o.id] = ni;
      log.push({ rev: ni.rev, op: 'put', id: o.id, row: row, ts: ots, dev: dev });
    }
  });

  // D. 시트에 반영 — 바뀐 칸만 쓰고(수식 보존), 삭제는 아래부터, 신규는 맨 위에 한 번에 삽입
  updates.forEach(function (u) { writeChangedCells_(env.data, u.it.rowNum, u.oldRow, u.newRow); });
  deleteRows_(env.data, deletes.map(function (d) { return d.rowNum; }));
  if (inserts.length) insertTop_(env, inserts);

  // E. 다시 읽어서(행 번호가 바뀌었으므로) rev/updated 열을 맞춰 기록 + 등록부 갱신
  let finalSlots = slots;
  if (updates.length || deletes.length || inserts.length || idsChanged || log.length) {
    finalSlots = loadSlots_(env);
    finalSlots.forEach(function (s) {
      if (s.blank) return;
      const it = byId[s.id];
      if (it) { s.rev = it.rev; s.ts = it.ts; if (it.row && it.row.tm && s.row) s.row.tm = it.row.tm; }
    });
    writeCol_(env.data, env.mc.rev, finalSlots, function (s) { return s.blank ? '' : s.rev; });
    writeCol_(env.data, env.mc.updated, finalSlots, function (s) { return s.blank ? '' : s.ts; });
    try { env.data.getRange(2, env.mc.time, Math.max(finalSlots.length, 1), 1).setNumberFormat('@'); } catch (e) { /* 무시 */ }
    writeCol_(env.data, env.mc.time, finalSlots, function (s) { return s.blank || !s.row ? '' : (s.row.tm || ''); });
  }
  saveRegistry_(env, finalSlots);

  // F. 변경 이력 기록
  if (log.length) {
    log.sort(function (a, b) { return a.rev - b.rev; });
    const last = env.changes.getLastRow();
    ensureSize_(env.changes, last + log.length, 7);
    const rows = log.map(function (l) {
      return [l.rev, new Date(now).toISOString(), l.dev, l.op, l.id, l.row ? JSON.stringify(l.row) : '', l.ts];
    });
    env.changes.getRange(last + 1, 1, rows.length, 7).setValues(rows);
  }
  props_().setProperty('REV', String(rev));

  // G. 응답 (since: 마지막으로 받은 서버 rev. 없거나 음수면 '처음' → 전체 전송)
  const sinceRaw = (p.since === undefined || p.since === null || p.since === '') ? -1 : Number(p.since);
  const since = isFinite(sinceRaw) ? sinceRaw : -1;
  const res = { ok: true, v: VERSION, rev: rev, now: now, n: finalSlots.filter(function (s) { return !s.blank; }).length, conflicts: conflicts, rejected: rejected };
  if (!p.lite) {
    const cs = since >= 0 && since <= rev ? changesSince_(env, since, rev) : { list: [], gap: true };
    if (since < 0 || since > rev || cs.gap) {
      res.full = true;
      res.rows = finalSlots.filter(function (s) { return !s.blank && s.id; }).map(function (s) {
        return Object.assign({ id: s.id, rev: s.rev, ts: s.ts }, s.row);
      });
    } else {
      res.changes = cs.list;
    }
  }
  const cfg = cfgSync_(env, p);
  if (cfg) res.cfg = cfg;
  if (p.want === 'sum') res.sum = sumarySnapshot_();
  return res;
}

function changesSince_(env, since, rev) {
  const ch = env.changes, last = ch.getLastRow();
  if (last < 2) return { list: [], gap: since < rev }; // 이력이 비었는데 서버 rev 가 더 앞서 있으면 이어붙일 수 없음
  const n = last - 1;
  const revs = ch.getRange(2, 1, n, 1).getValues();
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >> 1; if ((Number(revs[mid][0]) || 0) > since) hi = mid; else lo = mid + 1; }
  if (lo >= n) return { list: [], gap: since < rev };
  if ((Number(revs[lo][0]) || 0) > since + 1) return { list: [], gap: true }; // 오래된 이력이 정리됨 → 전체 받기
  const rows = ch.getRange(2 + lo, 1, n - lo, 7).getValues();
  const list = rows.map(function (r) {
    const o = { rev: Number(r[0]), op: String(r[3]), id: String(r[4]), ts: Number(r[6]) || 0 };
    if (o.op === 'put') { try { o.row = JSON.parse(r[5]); } catch (e) { o.row = null; } }
    return o;
  }).filter(function (o) { return o.op === 'del' || o.row; });
  return { list: list, gap: false };
}

/* 앱 설정(계정·항목·즐겨찾기 등) — 시트 'config'의 A1(JSON), B1(수정시각)에 보관 */
function cfgSync_(env, p) {
  const sh = env.config;
  let json = String(sh.getRange(1, 1).getValue() || ''), ts = Number(sh.getRange(1, 2).getValue()) || 0;
  if (p.cfg && typeof p.cfg.json === 'string' && Number(p.cfg.ts) > ts && p.cfg.json.length < 45000) {
    try { JSON.parse(p.cfg.json); } catch (e) { return { json: json, ts: ts, rejected: true }; }
    sh.getRange(1, 1).setValue(p.cfg.json);
    sh.getRange(1, 2).setValue(Number(p.cfg.ts));
    return { ts: Number(p.cfg.ts), saved: true };
  }
  if (json && ts > (Number(p.cfgTs) || 0)) return { json: json, ts: ts };
  return null;
}

/* ───────────────────────────── 시트 입출력 도우미 ───────────────────────────── */

function ss_() {
  const s = SpreadsheetApp.getActiveSpreadsheet();
  if (s) return s;
  const id = props_().getProperty('SSID');
  if (!id) throw new Error('SSID 미설정: 시트에서 [가계부 v2 > 초기 설정]을 먼저 실행하세요');
  return SpreadsheetApp.openById(id);
}
function props_() { return PropertiesService.getScriptProperties(); }

function ensureSchema_() {
  const ss = ss_();
  const active = (function () { try { return ss.getActiveSheet(); } catch (e) { return null; } })();
  let data = ss.getSheetByName(SHEET.DATA);
  if (!data) { data = ss.insertSheet(SHEET.DATA, ss.getNumSheets()); data.getRange(1, 1, 1, NCOL).setValues([HEADERS]); }
  const mc = metaCols_(data);
  const changes = getOrCreate_(ss, SHEET.CHANGES, ['rev', 'time', 'dev', 'op', 'id', 'json', 'ts'], false);
  const ids = getOrCreate_(ss, SHEET.IDS, null, true);
  const config = getOrCreate_(ss, SHEET.CONFIG, null, true);
  if (active) { try { ss.setActiveSheet(active); } catch (e) { /* 무시 */ } }
  return { ss: ss, data: data, mc: mc, changes: changes, ids: ids, config: config };
}

/** 시트 격자(기본 1000행×26열)를 넘겨 쓰면 오류가 나므로, 쓰기 전에 필요한 만큼 늘려 둡니다. */
function ensureSize_(sh, rows, cols) {
  const mr = sh.getMaxRows(), mc = sh.getMaxColumns();
  if (rows > mr) sh.insertRowsAfter(mr, rows - mr);
  if (cols > mc) sh.insertColumnsAfter(mc, cols - mc);
}

function getOrCreate_(ss, name, header, hide) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name, ss.getNumSheets());
    if (header) sh.getRange(1, 1, 1, header.length).setValues([header]);
    try { sh.setTabColor('#9AA0A6'); if (hide) sh.hideSheet(); } catch (e) { /* 무시 */ }
  }
  return sh;
}

/** 보조 열(id, rev, updated)을 '헤더 이름'으로 찾고, 없으면 사용 중인 마지막 열 뒤에 만들어 숨깁니다. */
function metaCols_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), NCOL);
  const hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const out = {};
  META.forEach(function (name) {
    let idx = hdr.indexOf(name);
    if (idx < 0) {
      idx = hdr.length;
      ensureSize_(sh, 1, idx + 1);
      sh.getRange(1, idx + 1).setValue(name);
      try { sh.hideColumns(idx + 1); } catch (e) { /* 무시 */ }
      hdr.push(name);
    }
    out[name] = idx + 1;
  });
  return out;
}

function loadSlots_(env) {
  const sh = env.data, mc = env.mc, last = sh.getLastRow();
  if (last < 2) return [];
  const n = last - 1;
  const vals = sh.getRange(2, 1, n, NCOL).getValues();
  const disp = sh.getRange(2, 1, n, 1).getDisplayValues();
  const ids = sh.getRange(2, mc.id, n, 1).getValues();
  const revs = sh.getRange(2, mc.rev, n, 1).getValues();
  const upds = sh.getRange(2, mc.updated, n, 1).getValues();
  const tms = mc.time ? sh.getRange(2, mc.time, n, 1).getDisplayValues() : null;
  const tz = env.ss.getSpreadsheetTimeZone();
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    const date = cellYmd_(v[0], disp[i][0], tz);
    const slot = { rowNum: i + 2, blank: !date, id: String(ids[i][0] || ''), rev: Number(revs[i][0]) || 0, ts: Number(upds[i][0]) || 0, row: null };
    if (date) {
      slot.row = {
        date: date, type: parseType_(v[1]), repeat: str_(v[2]) === '고정' ? '고정' : '변동',
        category: str_(v[3]), usage: str_(v[4]), budget: num_(v[5]), amount: num_(v[6]),
        from: str_(v[7]), to: str_(v[8]), memo1: str_(v[9]), memo2: str_(v[10]),
        tm: tms && /^\d{1,2}:\d{2}$/.test(String(tms[i][0])) ? String(tms[i][0]).padStart(5, '0') : ''
      };
    }
    out.push(slot);
  }
  return out;
}

function writeCol_(sh, col, slots, fn) {
  if (!slots.length) return;
  sh.getRange(2, col, slots.length, 1).setValues(slots.map(function (s) { return [fn(s)]; }));
}

function writeChangedCells_(sh, rowNum, oldRow, newRow) {
  const cols = ['date', 'type', 'repeat', 'category', 'usage', 'budget', 'amount', 'from', 'to', 'memo1', 'memo2'];
  cols.forEach(function (k, i) {
    if (String(oldRow[k]) === String(newRow[k])) return; // 같은 칸은 건드리지 않음 → 수식 보존
    const cell = sh.getRange(rowNum, i + 1);
    if (k === 'type') cell.setValue(TYPE_KO[newRow.type]);
    else cell.setValue(newRow[k]);
    if (k === 'date') cell.setNumberFormat(DATE_FMT);
  });
}

function deleteRows_(sh, rowNums) {
  if (!rowNums.length) return;
  const sorted = rowNums.slice().sort(function (a, b) { return b - a; });
  let i = 0;
  while (i < sorted.length) { // 연속된 행은 한 번에 지움 (아래에서 위로)
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] - 1) j++;
    const start = sorted[j], count = j - i + 1;
    sh.deleteRows(start, count);
    i = j + 1;
  }
}

function insertTop_(env, inserts) {
  const sh = env.data, n = inserts.length, hadRows = sh.getLastRow() >= 2;
  sh.insertRowsAfter(1, n);
  if (hadRows) { // 아래 행의 서식(글꼴·테두리 등)을 새 행에 복사 — 머리글 서식이 번지지 않게
    try { sh.getRange(2 + n, 1, 1, NCOL).copyTo(sh.getRange(2, 1, n, NCOL), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false); } catch (e) { /* 무시 */ }
  }
  const sorted = inserts.slice().sort(function (a, b) { return a.row.date < b.row.date ? 1 : (a.row.date > b.row.date ? -1 : 0); });
  const vals = sorted.map(function (it) { return rowToCells_(it.row); });
  sh.getRange(2, 1, n, NCOL).setValues(vals);
  sh.getRange(2, 1, n, 1).setNumberFormat(DATE_FMT);
  sh.getRange(2, env.mc.id, n, 1).setValues(sorted.map(function (it) { return [it.id]; }));
  sh.getRange(2, env.mc.rev, n, 1).setValues(sorted.map(function (it) { return [it.rev]; }));
  sh.getRange(2, env.mc.updated, n, 1).setValues(sorted.map(function (it) { return [it.ts]; }));
}

function rowToCells_(r) {
  return [r.date, TYPE_KO[r.type] || '지출', r.repeat, r.category, r.usage, r.budget, r.amount, r.from, r.to, r.memo1, r.memo2];
}

function loadRegistry_(env) {
  const sh = env.ids, last = sh.getLastRow(), map = {};
  let count = 0;
  if (last >= 1) {
    sh.getRange(1, 1, last, 2).getValues().forEach(function (r) { if (r[0]) { map[String(r[0])] = String(r[1]); count++; } });
  }
  return { map: map, count: count };
}

function saveRegistry_(env, slots) {
  const sh = env.ids;
  sh.clearContents();
  const rows = [];
  slots.forEach(function (s) { if (!s.blank && s.id) rows.push([s.id, hash_(s.row)]); });
  if (rows.length) { ensureSize_(sh, rows.length, 2); sh.getRange(1, 1, rows.length, 2).setValues(rows); }
}

function getRev_(env) {
  let r = Number(props_().getProperty('REV') || 0);
  const last = env.changes.getLastRow();
  if (last >= 2) { const lr = Number(env.changes.getRange(last, 1).getValue()) || 0; if (lr > r) r = lr; }
  return r;
}

/* ───────────────────────────── 값 변환 ───────────────────────────── */

function str_(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function num_(v) {
  const n = Number(String(v === null || v === undefined ? '' : v).replace(/,/g, ''));
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function cut_(v, max) { return str_(v).slice(0, max); }
function newId_() { return 's' + Utilities.getUuid().replace(/-/g, '').slice(0, 11); }
function makeToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40); }

function parseType_(v) {
  const s = str_(v);
  if (s.indexOf('예산') >= 0) return 'budget';
  if (s.indexOf('수입') >= 0) return 'income';
  if (s.indexOf('이체') >= 0) return 'transfer';
  return 'expense';
}

/** 날짜 칸 → 'YYYY-MM-DD'. '화면에 보이는 문자'를 우선 사용해서 시간대로 하루가 밀리는 문제를 원천 차단합니다. */
function cellYmd_(raw, display, tz) {
  const fromText = parseYmd_(display);
  if (fromText) return fromText;
  if (raw instanceof Date && !isNaN(raw.getTime())) return Utilities.formatDate(raw, tz, 'yyyy-MM-dd');
  return parseYmd_(raw);
}

function parseYmd_(s) {
  s = String(s === null || s === undefined ? '' : s).trim().replace(/\s*\(.*?\)/g, '');
  if (!s) return '';
  let m = s.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return ymd_(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return ymd_(2000 + (+m[1]), +m[2], +m[3]);
  const d = s.replace(/\D/g, '');
  if (d.length === 8) return ymd_(+d.slice(0, 4), +d.slice(4, 6), +d.slice(6, 8));
  return '';
}
function parseDateOnly(x) { return parseYmd_(x); } // 예전 코드 호환용 이름
function ymd_(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return '';
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}
function addDays_(ymd, n) {
  const p = ymd.split('-');
  const t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + t.getUTCDate()).slice(-2);
}
function diffDays_(a, b) {
  const pa = a.split('-'), pb = b.split('-');
  return Math.round((Date.UTC(+pa[0], +pa[1] - 1, +pa[2]) - Date.UTC(+pb[0], +pb[1] - 1, +pb[2])) / 86400000);
}

function sanitizeRow_(r) {
  if (!r || typeof r !== 'object') return null;
  const date = str_(r.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parseYmd_(date)) return null;
  if (['expense', 'income', 'transfer', 'budget'].indexOf(r.type) < 0) return null;
  const out = {
    date: date, type: r.type, repeat: r.repeat === '고정' ? '고정' : '변동',
    category: cut_(r.category, 60), usage: cut_(r.usage, LIMITS.textMax),
    budget: num_(r.budget), amount: num_(r.amount),
    from: cut_(r.from, 40), to: cut_(r.to, 40), memo1: cut_(r.memo1, LIMITS.memoMax), memo2: cut_(r.memo2, LIMITS.memoMax),
    tm: /^\d{2}:\d{2}$/.test(str_(r.tm)) ? str_(r.tm) : ''
  };
  if (out.budget < 0 || out.amount < 0) return null;
  return out;
}

function sameRow_(a, b) {
  const ks = ['date', 'type', 'repeat', 'category', 'usage', 'budget', 'amount', 'from', 'to', 'memo1', 'memo2'];
  for (let i = 0; i < ks.length; i++) if (String(a[ks[i]]) !== String(b[ks[i]])) return false;
  return true;
}

/** 변경 감지용 가벼운 지문(FNV-1a). 앞의 'h'는 시트가 숫자로 바꿔버리지 않게 하는 접두어입니다. */
function hash_(r) {
  const s = [r.date, r.type, r.repeat, r.category, r.usage, r.budget, r.amount, r.from, r.to, r.memo1, r.memo2].join('\u0001');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return 'h' + h.toString(36);
}

/* ───────────────────────────── 초기 설정 / 토큰 ───────────────────────────── */

function setup() {
  const ui = tryUi_();
  const ss = ss_();
  props_().setProperty('SSID', ss.getId());
  ensureSchema_();
  let token = props_().getProperty('TOKEN');
  if (!token) { token = makeToken_(); props_().setProperty('TOKEN', token); }
  const r = sync_({ a: 'sync', since: 0, ops: [], dev: 'setup', lite: true });
  if (!r.ok) throw new Error('초기 점검 실패: ' + r.err);
  installTriggers();
  const tzScript = Session.getScriptTimeZone(), tzSheet = ss.getSpreadsheetTimeZone();
  const msg = '설정 완료 ✔\n\n■ 앱에 입력할 토큰\n' + token +
    '\n\n■ 데이터 행: ' + r.n + '건 (고유 ID 부여 완료)' +
    '\n■ 시간대: 스크립트 ' + tzScript + ' / 시트 ' + tzSheet +
    (tzScript !== tzSheet ? '\n⚠ 두 시간대가 다릅니다. 프로젝트 설정에서 Asia/Seoul로 맞추세요.' : '') +
    '\n\n다음 단계: 배포 > 새 배포 > 웹 앱 (실행: 나 / 액세스: 모든 사용자)';
  if (ui) ui.alert('가계부 v2', msg, ui.ButtonSet.OK); else console.log(msg);
  return msg;
}

function showToken() {
  const ui = tryUi_(), t = props_().getProperty('TOKEN');
  const msg = t ? t : '아직 토큰이 없습니다. 먼저 [① 초기 설정]을 실행하세요.';
  if (ui) ui.alert('앱 연결 토큰', msg, ui.ButtonSet.OK); else console.log(msg);
  return msg;
}

function rotateToken() {
  const ui = tryUi_();
  if (ui) {
    const a = ui.alert('토큰 새로 만들기', '지금 쓰는 모든 기기의 연결이 끊어지고, 새 토큰을 각 기기에 다시 입력해야 합니다. 계속할까요?', ui.ButtonSet.YES_NO);
    if (a !== ui.Button.YES) return;
  }
  const t = makeToken_();
  props_().setProperty('TOKEN', t);
  if (ui) ui.alert('새 토큰', t, ui.ButtonSet.OK); else console.log(t);
}

function tryUi_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }

/* ───────────────────────────── 백업 / 정리 / 자동 작업 ───────────────────────────── */

function bkList_() { try { return JSON.parse(props_().getProperty('BK_LIST') || '[]'); } catch (e) { return []; } }

/** data 시트를 yymmdd(대량 작업 전에는 yymmdd_HHmmss) 이름으로 복사합니다. 내가 만든 백업만 정리 대상이 됩니다. */
function snapshot_(suffix) {
  const ss = ss_(), data = ss.getSheetByName(SHEET.DATA);
  if (!data) return '';
  const tz = ss.getSpreadsheetTimeZone(), now = new Date();
  const base = Utilities.formatDate(now, tz, 'yyMMdd');
  const name = suffix ? base + '_' + Utilities.formatDate(now, tz, 'HHmmss') : base; // 같은 분에 여러 번 만들어도 서로 덮어쓰지 않게 초 단위
  const list = bkList_();
  const old = ss.getSheetByName(name);
  if (old) {
    if (list.indexOf(name) < 0) return name; // 내가 만든 게 아닌 같은 이름의 시트 → 건드리지 않음
    ss.deleteSheet(old);
  }
  const active = (function () { try { return ss.getActiveSheet(); } catch (e) { return null; } })();
  const copy = data.copyTo(ss);
  copy.setName(name);
  try { copy.setTabColor('#9AA0A6'); ss.setActiveSheet(copy); ss.moveActiveSheet(ss.getNumSheets()); if (active) ss.setActiveSheet(active); } catch (e) { /* 무시 */ }
  if (list.indexOf(name) < 0) { list.push(name); props_().setProperty('BK_LIST', JSON.stringify(list)); }
  return name;
}

function pruneBackups_() {
  if (props_().getProperty('PRUNE') !== '1') return 0;
  const ss = ss_(), tz = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const keep = [];
  let removed = 0;
  bkList_().forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const m = name.match(/^(\d{2})(\d{2})(\d{2})/);
    if (!m) { keep.push(name); return; }
    const age = diffDays_(today, '20' + m[1] + '-' + m[2] + '-' + m[3]);
    if (age > LIMITS.backupKeepDays && m[3] !== '01') { ss.deleteSheet(sh); removed++; } else keep.push(name);
  });
  props_().setProperty('BK_LIST', JSON.stringify(keep));
  return removed;
}

function trimChanges_() {
  const ch = getOrCreate_(ss_(), SHEET.CHANGES, ['rev', 'time', 'dev', 'op', 'id', 'json', 'ts'], false);
  const extra = ch.getLastRow() - 1 - LIMITS.changesKeep;
  if (extra > 500) ch.deleteRows(2, extra);
}

function backupDailyData() { return snapshot_(''); } // 예전 트리거 이름 호환

function dailyMaintenance() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    snapshot_('');
    trimChanges_();
    pruneBackups_();
    const env = ensureSchema_();
    const r = refreshSumary_(false);
    if (r && r.ok) props_().setProperty('SUM_REV', String(getRev_(env)));
  } finally { lock.releaseLock(); }
}

/** 매시간: 데이터가 바뀐 경우에만 sumary 를 새로고침 (바뀐 게 없으면 즉시 종료) */
function hourlyRefresh() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const env = ensureSchema_(), rev = getRev_(env);
    if (String(props_().getProperty('SUM_REV')) !== String(rev)) {
      const r = refreshSumary_(false);
      if (r && r.ok) props_().setProperty('SUM_REV', String(rev));
    }
  } finally { lock.releaseLock(); }
}

function installTriggers() {
  const mine = ['dailyMaintenance', 'hourlyRefresh', 'backupDailyData'];
  ScriptApp.getProjectTriggers().forEach(function (t) { if (mine.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(4).create();
  ScriptApp.newTrigger('hourlyRefresh').timeBased().everyHours(1).create();
  const ui = tryUi_();
  if (ui) ui.alert('자동 작업 설치됨', '· 매일 새벽: 백업 + 정리 + sumary 갱신\n· 매시간: 데이터가 바뀌었으면 sumary 갱신', ui.ButtonSet.OK);
}

function togglePrune() {
  const on = props_().getProperty('PRUNE') === '1';
  props_().setProperty('PRUNE', on ? '0' : '1');
  const ui = tryUi_(), msg = on ? '백업 자동정리: 꺼짐' : '백업 자동정리: 켜짐 (' + LIMITS.backupKeepDays + '일 지난 일일 백업 삭제, 매월 1일분은 보관)';
  if (ui) ui.alert(msg); else console.log(msg);
}

function menuSnapshot() {
  const n = snapshot_('manual');
  const ui = tryUi_(); if (ui) ui.alert('백업 완료', '시트 이름: ' + n, ui.ButtonSet.OK);
}

function menuSortData() {
  const ui = tryUi_();
  if (ui && ui.alert('data 정렬', '날짜 내림차순(최신이 위)으로 정렬합니다. 시트에 행 단위 수식이 있다면 확인 후 진행하세요. 계속할까요?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const env = ensureSchema_(), sh = env.data, last = sh.getLastRow();
  if (last < 3) return;
  sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), NCOL)).sort({ column: 1, ascending: false });
  if (ui) ui.alert('정렬 완료');
}

function menuDiagnose() {
  const env = ensureSchema_(), slots = loadSlots_(env), reg = loadRegistry_(env);
  const items = slots.filter(function (s) { return !s.blank; });
  const seen = {}; let dup = 0, noId = 0;
  items.forEach(function (s) { if (!s.id) noId++; else if (seen[s.id]) dup++; seen[s.id] = true; });
  const msg = '데이터 행: ' + items.length + '건\nID 없음: ' + noId + ' / 중복 ID: ' + dup +
    '\n등록부: ' + reg.count + '건\n현재 rev: ' + getRev_(env) + '\n변경 이력: ' + Math.max(0, env.changes.getLastRow() - 1) + '건' +
    '\n(ID 없음·중복은 다음 동기화 때 자동으로 정리됩니다)';
  const ui = tryUi_(); if (ui) ui.alert('점검 결과', msg, ui.ButtonSet.OK); else console.log(msg);
  return msg;
}

/* ───────────────────────────── sumary 시트 (기존 기능 계승) ───────────────────────────── */

/** 기존 버튼/도형에 연결된 이름을 그대로 유지합니다. */
function filterDataToSummary() { return refreshSumary_(true); }

/**
 * sumary 의 B3(시작일)~C3(종료일) 기간 내역을 B25부터 펼치고, D5:D22 자산별 '이월'(E열)을 다시 계산합니다.
 * (이월 = 시작일 전날까지의 [입금계정 합 − 출금계정 합]  ← 기존 filterDataToSummary 와 동일한 계산)
 */
function refreshSumary_(withUi) {
  const t0 = Date.now();
  const say = function (m) { const ui = withUi ? tryUi_() : null; if (ui) ui.alert(m); else console.log(m); };
  const ss = ss_(), ws = ss.getSheetByName(SHEET.SUM), wd = ss.getSheetByName(SHEET.DATA);
  if (!ws || !wd) { say("'sumary' 또는 'data' 시트를 찾을 수 없습니다."); return { ok: false }; }
  const start = parseYmd_(ws.getRange('B3').getDisplayValue());
  const end = parseYmd_(ws.getRange('C3').getDisplayValue());
  if (!start || !end) { say('sumary 시트의 B3(시작일) 또는 C3(종료일) 날짜를 확인해주세요.'); return { ok: false }; }
  const prev = addDays_(start, -1);
  const lastRow = wd.getLastRow();
  if (lastRow < 2) { say('data 시트에 조회할 데이터가 없습니다.'); return { ok: false }; }

  const tz = ss.getSpreadsheetTimeZone();
  const raw = wd.getRange(1, 1, lastRow, NCOL).getValues();
  const disp = wd.getRange(1, 1, lastRow, 1).getDisplayValues();
  const ymds = [''];
  for (let i = 1; i < raw.length; i++) ymds.push(cellYmd_(raw[i][0], disp[i][0], tz));

  // 1) 자산별 이월
  const nameCells = ws.getRange(5, 4, 18, 1).getValues(); // D5:D22
  let total = 0;
  for (let k = 0; k < nameCells.length; k++) {
    const name = str_(nameCells[k][0]);
    if (!name || name === '소계' || name === '합계') continue;
    let sum = 0;
    for (let i = 1; i < raw.length; i++) {
      if (!ymds[i] || ymds[i] > prev) continue;
      const amt = num_(raw[i][6]);
      if (str_(raw[i][8]) === name) sum += amt; // 입금계정 +
      if (str_(raw[i][7]) === name) sum -= amt; // 출금계정 −
    }
    ws.getRange(5 + k, 5).setValue(sum);
    total += sum;
  }
  ws.getRange('E22').setValue(total);
  ws.getRange('C5').setValue(total);

  // 2) 기간 내역 펼치기 (B25:P)
  ensureSize_(ws, 25, 16);
  ws.getRange(25, 2, Math.max(1, ws.getMaxRows() - 24), 15).clearContent().clearFormat(); // 기존 출력 영역 초기화
  const headerMap = {};
  raw[0].forEach(function (h, c) { const name = str_(h); if (name) headerMap[name] = c; });
  const outHeaders = ws.getRange(24, 2, 1, 15).getValues()[0].map(str_);
  const out = [];
  for (let i = 1; i < raw.length; i++) {
    if (!ymds[i] || ymds[i] < start || ymds[i] > end) continue;
    out.push(outHeaders.map(function (h, c) {
      if (!h || headerMap[h] === undefined) return '';
      return c === 0 ? ymds[i] : raw[i][headerMap[h]];
    }));
  }
  if (!out.length) { say('이월금액은 재계산되었으나, 지정한 기간 내에 해당하는 데이터가 없습니다.'); return { ok: true, rows: 0 }; }

  out.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
  const n = out.length;
  ensureSize_(ws, 24 + n, 16);
  ws.getRange(25, 2, n, 15).setValues(out);
  ws.getRange(25, 2, n, 15).setFontFamily('Noto Sans KR').setFontSize(10);
  ws.getRange(25, 2, n, 1).setNumberFormat(DATE_FMT);
  ws.getRange(25, 10, n, 1).setNumberFormat('#,##0');
  [[3, 'C24'], [5, 'E24'], [10, 'J24']].forEach(function (p) { // 머리글 서식을 열에 상속
    const h = ws.getRange(p[1]);
    ws.getRange(25, p[0], n, 1).setBackground(h.getBackground()).setFontColor(h.getFontColor()).setFontWeight('bold');
  });
  for (let r = 0; r < n - 1; r++) { // 날짜가 바뀌는 경계에 점선
    if (out[r][0] !== out[r + 1][0]) ws.getRange(25 + r, 2, 1, 15).setBorder(null, null, true, null, null, null, '#A0A0A0', SpreadsheetApp.BorderStyle.DOTTED);
  }
  ws.getRange(25 + n - 1, 2, 1, 15).setBorder(null, null, true, null, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  const sec = ((Date.now() - t0) / 1000).toFixed(2);
  say('조회 및 서식 적용이 완료되었습니다! (소요 시간: ' + sec + '초)');
  return { ok: true, rows: n, sec: Number(sec) };
}

/** 앱의 '시트 대조'용: sumary 의 현재 값을 읽어 돌려줍니다. (읽기 전용) */
function sumarySnapshot_() {
  const ss = ss_(), ws = ss.getSheetByName(SHEET.SUM);
  if (!ws) return null;
  const d = ws.getRange('B3:D3').getDisplayValues()[0];
  const acc = ws.getRange(5, 4, 18, 5).getValues();   // D5:H22  이름·이월·입금·출금·잔액
  const need = ws.getRange(5, 18, 18, 3).getValues(); // R5:T22  이름·필요금액·부족
  const bud = ws.getRange(5, 9, 18, 8).getValues();   // I5:P22  항목·당월예산·표준사용·표준진도율·누계예산·누계사용·누계사용율·예산-사용
  const needBy = {};
  need.forEach(function (r) { const n = str_(r[0]); if (n) needBy[n] = { need: num_(r[1]), short: num_(r[2]) }; });
  const accounts = [];
  acc.forEach(function (r) {
    const name = str_(r[0]);
    if (!name || name === '소계' || name === '합계') return;
    const nd = needBy[name] || { need: 0, short: 0 };
    accounts.push({ name: name, open: num_(r[1]), in: num_(r[2]), out: num_(r[3]), balance: num_(r[4]), need: nd.need, short: nd.short });
  });
  const budget = [];
  bud.forEach(function (r) {
    const name = str_(r[0]);
    if (!name || name === '소계' || name === '합계') return;
    budget.push({ name: name, planMonth: num_(r[1]), planToDate: num_(r[4]), actual: num_(r[5]), left: num_(r[7]) });
  });
  return {
    start: parseYmd_(d[0]), end: parseYmd_(d[1]), asOf: parseYmd_(d[2]),
    accounts: accounts, budget: budget, deficit: num_(ws.getRange('T3').getValue()), readAt: Date.now()
  };
}


/* ───────────────────── 내 하루장 v3 · 노트 / 일정 / 저금통 ─────────────────────
 *  data 시트의 동기화(sync)와 완전히 따로 돕니다. 표가 작아서 '마지막에 고친 것이 이김(updated 시각)' 방식.
 *  요청: { a:'side', since:<ms>, puts:[{t, row}], dels:[{t, id, ts}] }
 *  응답: { ok, now, rows:{ notes:[...], events:[...], goals:[...] } }  ← since 이후 바뀐 행(지운 행은 deleted:1)
 */
const SIDE = {
  notes:  { head: ['날짜', '종류', '제목', '내용', '기분', '태그', '연결내역', '사진', '비밀', '시각', '할일'], keys: ['date', 'kind', 'title', 'body', 'mood', 'tags', 'link', 'photo', 'secret', 'tm', 'tasks'], keep: ['tasks'] },
  events: { head: ['시작', '끝', '하루종일', '제목', '장소', '반복', '사람', '예상비용', '연결내역', '색', '예산항목', '반복끝', '메모', '구글ID', '구글맞춤'], keys: ['start', 'end', 'allday', 'title', 'place', 'repeat', 'who', 'cost', 'link', 'color', 'category', 'until', 'memo', 'gid', 'gsync'], keep: ['gid', 'gsync'] },
  goals:  { head: ['이름', '목표금액', '목표일', '태그', '모은금액', '메모'], keys: ['name', 'target', 'due', 'tag', 'saved', 'memo'] }
};
const SIDE_META = ['id', 'updated', 'deleted', 'synced']; // updated = 고친 시각(누가 이기는지), synced = 서버에 들어온 시각(since 기준)

function side_(p) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, err: 'busy' };
  try {
    const ss = ss_(), now = Date.now(), since = Number(p.since) || 0, out = {}, errs = {};
    const puts = (p.puts || []).slice(0, 500), dels = (p.dels || []).slice(0, 200);
    Object.keys(SIDE).forEach(function (t) {
      const def = SIDE[t], head = def.head.concat(SIDE_META), sh = getOrCreate_(ss, t, head, false);
      if (sh.getLastRow() < 1) sh.getRange(1, 1, 1, head.length).setValues([head]);
      else { // 열이 늘어난 경우(예: 일정 '색' 추가) 머리줄을 보고 옛 행을 새 칸 순서로 옮김
        const hw = Math.max(sh.getLastColumn(), 1), cur = sh.getRange(1, 1, 1, hw).getValues()[0].map(str_);
        if (cur.join('|') !== head.join('|')) {
          const nOld = sh.getLastRow() - 1, old = nOld > 0 ? sh.getRange(2, 1, nOld, hw).getValues() : [];
          const map = head.map(function (h) { return cur.indexOf(h); });
          const moved = old.map(function (v) { return map.map(function (j) { return j >= 0 ? v[j] : ''; }); });
          ensureSize_(sh, Math.max(nOld + 1, 2), head.length);
          sh.getRange(1, 1, Math.max(nOld + 1, 1), hw).clearContent();
          sh.getRange(1, 1, 1, head.length).setValues([head]);
          if (moved.length) sh.getRange(2, 1, moved.length, head.length).setValues(moved);
        }
      }
      const n = sh.getLastRow() - 1, w = head.length;
      const vals = n > 0 ? sh.getRange(2, 1, n, w).getValues() : [];
      const byId = {};
      vals.forEach(function (v, i) { const id = str_(v[w - 4]); if (id) byId[id] = i; });
      let changed = false;
      puts.filter(function (x) { return x && x.t === t && x.row && x.row.id; }).forEach(function (x) {
        const r = x.row, ts = Math.min(Number(r.updated) || now, now + 60000), i = byId[r.id];
        if (i !== undefined && Number(vals[i][w - 3]) > ts) return; // 시트 쪽이 더 늦게 고쳐졌으면 시트 값 유지
        const line = def.keys.map(function (k) { return cut_(r[k], k === 'body' || k === 'memo' ? 5000 : 300); }).concat([str_(r.id), ts, '', now]);
        if (i !== undefined && def.keep) def.keep.forEach(function (k) { const j = def.keys.indexOf(k); if (!str_(line[j]) && str_(vals[i][j])) line[j] = vals[i][j]; }); // 서버가 붙인 구글ID 등은 앱이 비워 보내도 유지
        if (i === undefined) { byId[r.id] = vals.length; vals.push(line); } else vals[i] = line;
        changed = true;
      });
      dels.filter(function (x) { return x && x.t === t && x.id; }).forEach(function (x) {
        const i = byId[x.id]; if (i === undefined) return;
        vals[i][w - 3] = Math.min(Number(x.ts) || now, now + 60000); vals[i][w - 2] = 1; vals[i][w - 1] = now; changed = true;
      });
      if (t === 'events' && p.gcal) { try { if (gcalSync_(def, vals, byId, w, now)) changed = true; } catch (e) { errs.gcal = String(e && e.message || e); } }
      if (t === 'notes' && p.tasks) { try { if (tasksSync_(def, vals, w, now)) changed = true; } catch (e) { errs.tasks = String(e && e.message || e); } }
      if (changed && vals.length) { ensureSize_(sh, vals.length + 1, w); sh.getRange(2, 1, vals.length, w - 3).setNumberFormat('@'); sh.getRange(2, 1, vals.length, w).setValues(vals); } // 날짜가 시트에서 자동 변환되지 않게 글자 서식
      out[t] = vals.filter(function (v) { return since <= 0 || Number(v[w - 1]) > since; }).map(function (v) {
        const o = {}; def.keys.forEach(function (k, j) { o[k] = v[j] instanceof Date ? Utilities.formatDate(v[j], ss.getSpreadsheetTimeZone(), (k === 'start' || k === 'end') ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd') : v[j]; });
        o.id = str_(v[w - 4]); o.updated = Number(v[w - 3]) || 0; o.deleted = v[w - 2] ? 1 : 0; return o;
      });
    });
    return { ok: true, now: now, rows: out, errs: errs };
  } finally { lock.releaseLock(); }
}


/* ───────────────────── 구글 기본 캘린더 연동 ─────────────────────
 *  앱 → 캘린더: 새 일정은 만들고, 고친 일정(updated > 구글맞춤)은 고치고, 지운 일정은 캘린더에서도 지움.
 *  캘린더 → 앱: 오늘 기준 30일 전 ~ 120일 뒤 일정 중 앱에 없는 것은 새로 들여오고, 캘린더에서 더 늦게 고친 것은 앱에 반영.
 *  반복 일정은 캘린더 '반복 일정'으로 만듭니다. (캘린더에서 들여온 반복 일정은 첫 회만 보입니다) */
function gcalSync_(def, vals, byId, w, now) {
  const cal = CalendarApp.getDefaultCalendar(), K = {}; def.keys.forEach(function (k, j) { K[k] = j; });
  const ID = w - 4, UPD = w - 3, DEL = w - 2, SYN = w - 1;
  let changed = false;
  const toDate = function (s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; };
  const fmt = function (d, withTime) { return Utilities.formatDate(d, Session.getScriptTimeZone(), withTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd'); };
  const desc = function (v) { return [v[K.memo], v[K.who] ? '누구와: ' + v[K.who] : '', v[K.cost] ? '예상 비용: ' + v[K.cost] + '원' : '', '(내 하루장)'].filter(String).join('\n'); };
  const getEv = function (gid) { try { return cal.getEventById(gid); } catch (e) { return null; } };
  const create = function (v) {
    const st = toDate(v[K.start]); if (!st) return null;
    const allday = String(v[K.allday]) === '1' || !/\d{2}:\d{2}/.test(String(v[K.start]));
    let en = toDate(v[K.end]); const opt = { location: str_(v[K.place]), description: desc(v) };
    const rep = str_(v[K.repeat]);
    if (rep) {
      let rule = rep === '매주' ? CalendarApp.newRecurrence().addWeeklyRule() : rep === '매월' ? CalendarApp.newRecurrence().addMonthlyRule() : CalendarApp.newRecurrence().addYearlyRule();
      const until = toDate(v[K.until]); if (until) rule = rule.until(new Date(until.getTime() + 86399000));
      const ser = allday ? cal.createAllDayEventSeries(str_(v[K.title]), st, rule, opt) : cal.createEventSeries(str_(v[K.title]), st, en && en > st ? en : new Date(st.getTime() + 3600000), rule, opt);
      return ser.getId();
    }
    if (allday) { const last = en && en > st ? en : st; return cal.createAllDayEvent(str_(v[K.title]), st, new Date(last.getTime() + 86400000), opt).getId(); }
    return cal.createEvent(str_(v[K.title]), st, en && en > st ? en : new Date(st.getTime() + 3600000), opt).getId();
  };
  const removeG = function (gid) {
    try { const ser = cal.getEventSeriesById(gid); if (ser) { ser.deleteEventSeries(); return; } } catch (e) { /* 반복 아님 */ }
    const ev = getEv(gid); if (!ev) return; try { if (ev.isRecurringEvent()) ev.getEventSeries().deleteEventSeries(); else ev.deleteEvent(); } catch (e) { /* 이미 없음 */ }
  };
  // 1) 앱 → 캘린더
  vals.forEach(function (v) {
    const gid = str_(v[K.gid]), del = !!v[DEL], upd = Number(v[UPD]) || 0, gs = Number(v[K.gsync]) || 0;
    if (str_(v[K.repeat]) === '구글반복') { if (del && gid) { v[K.gid] = ''; v[SYN] = now; changed = true; } return; } // 캘린더에서 온 반복 일정: 앱에서는 보기만 (구글 쪽 반복 전체를 건드리지 않음)
    if (del) { if (gid) { removeG(gid); v[K.gid] = ''; v[K.gsync] = now; v[SYN] = now; changed = true; } return; }
    if (!gid) { const id = create(v); if (id) { v[K.gid] = id; v[K.gsync] = Date.now(); v[SYN] = now; changed = true; } return; }
    if (upd > gs) { removeG(gid); const id2 = create(v); v[K.gid] = id2 || ''; v[K.gsync] = Date.now(); v[SYN] = now; changed = true; } // 고친 일정: 다시 만들어 시간·반복까지 정확히
  });
  // 2) 캘린더 → 앱
  const byG = {}; vals.forEach(function (v, i) { if (str_(v[K.gid])) byG[str_(v[K.gid])] = i; });
  const from = new Date(now - 30 * 86400000), to = new Date(now + 120 * 86400000), seen = {};
  cal.getEvents(from, to).forEach(function (ev) {
    const gid = ev.getId(); if (seen[gid]) return; seen[gid] = 1;
    const allday = ev.isAllDayEvent(), st = allday ? ev.getAllDayStartDate() : ev.getStartTime(), en = allday ? new Date(ev.getAllDayEndDate().getTime() - 86400000) : ev.getEndTime();
    const lu = ev.getLastUpdated().getTime(), i = byG[gid];
    const fields = { start: fmt(st, !allday), end: allday ? (fmt(en, false) > fmt(st, false) ? fmt(en, false) : '') : fmt(en, true), allday: allday ? 1 : 0, title: ev.getTitle(), place: ev.getLocation(), memo: String(ev.getDescription() || '').split('\n').filter(function (l) { return !/^(누구와: |예상 비용: |\(내 하루장\)$)/.test(l); }).join('\n').trim() };
    if (i === undefined) {
      if (/\(내 하루장\)/.test(ev.getDescription() || '')) return; // 앱이 만들었는데 앱에서 지운 일정의 남은 회차 등은 들여오지 않음
      const line = def.keys.map(function () { return ''; }).concat(['g' + Utilities.getUuid().replace(/-/g, '').slice(0, 20), now, '', now]);
      Object.keys(fields).forEach(function (k) { line[K[k]] = fields[k]; }); line[K.gid] = gid; line[K.gsync] = now; line[K.color] = '#4285F4'; line[K.category] = '일정';
      if (ev.isRecurringEvent()) line[K.repeat] = '구글반복';
      byId[line[w - 4]] = vals.length; vals.push(line); changed = true;
    } else if (lu > (Number(vals[i][K.gsync]) || 0) + 60000 && !ev.isRecurringEvent()) {
      const v = vals[i]; Object.keys(fields).forEach(function (k) { v[K[k]] = fields[k]; }); v[K.gsync] = now; v[UPD] = now; v[SYN] = now; changed = true;
    }
  });
  // 3) 캘린더에서 지운 일정 → 앱에서도 지움 (기간 안, 반복 아님, 방금 만든 것 제외)
  const fromS = fmt(from, false), toS = fmt(to, false);
  vals.forEach(function (v) {
    const gid = str_(v[K.gid]); if (!gid || v[DEL] || seen[gid] || str_(v[K.repeat])) return;
    const d0 = String(v[K.start] || '').slice(0, 10); if (!(d0 > fromS && d0 < toS)) return; // 경계일은 판단하지 않음(시간 차이로 잘못 지우지 않게)
    if (Date.now() - (Number(v[K.gsync]) || 0) < 120000) return;
    v[DEL] = 1; v[UPD] = now; v[SYN] = now; v[K.gid] = ''; changed = true;
  });
  return changed;
}

/* ───────────────────── 구글 Tasks(할 일) 연동 ─────────────────────
 *  노트 안의 '☐ 할 일' 줄을 구글 Tasks의 '내 하루장' 목록으로 보내고, 구글에서 완료하면 노트의 줄이 '☑'로 바뀝니다.
 *  (Apps Script 편집기 › 서비스 › Google Tasks API 를 켜야 합니다 — appsscript.json에 이미 들어 있음) */
function tasksSync_(def, vals, w, now) {
  if (typeof Tasks === 'undefined') throw new Error('Google Tasks API 서비스가 꺼져 있어요');
  const K = {}; def.keys.forEach(function (k, j) { K[k] = j; });
  const UPD = w - 3, DEL = w - 2, SYN = w - 1;
  let listId = props_().getProperty('TASKLIST');
  if (listId) { try { Tasks.Tasklists.get(listId); } catch (e) { listId = null; } }
  if (!listId) {
    const ls = (Tasks.Tasklists.list({ maxResults: 100 }).items || []).filter(function (l) { return l.title === '내 하루장'; })[0];
    listId = ls ? ls.id : Tasks.Tasklists.insert({ title: '내 하루장' }).id;
    props_().setProperty('TASKLIST', listId);
  }
  const status = {}; let pageToken = null;
  do { const r = Tasks.Tasks.list(listId, { showCompleted: true, showHidden: true, maxResults: 100, pageToken: pageToken }); (r.items || []).forEach(function (t) { status[t.id] = t.status; }); pageToken = r.nextPageToken; } while (pageToken);
  let changed = false;
  vals.forEach(function (v) {
    if (v[DEL]) return;
    let map = {}; try { map = JSON.parse(str_(v[K.tasks]) || '{}') || {}; } catch (e) { map = {}; }
    const lines = String(v[K.body] || '').split('\n'); let bodyChanged = false, mapChanged = false;
    lines.forEach(function (ln, idx) {
      const m = ln.match(/^(\s*)(☐|☑|- \[ \]|- \[x\])\s*(.+)$/); if (!m) return;
      const text = m[3].trim(), done = m[2] === '☑' || m[2] === '- [x]', id = map[text];
      if (!id) { if (done) return; const t = Tasks.Tasks.insert({ title: text, notes: '내 하루장 노트 · ' + str_(v[K.date]) }, listId); map[text] = t.id; mapChanged = true; return; }
      const gDone = status[id] === 'completed';
      if (gDone && !done) { lines[idx] = m[1] + '☑ ' + text; bodyChanged = true; }
      else if (done && status[id] && !gDone) { try { Tasks.Tasks.patch({ status: 'completed' }, listId, id); } catch (e) { /* 무시 */ } }
    });
    if (bodyChanged) { v[K.body] = lines.join('\n'); v[UPD] = now; }
    if (bodyChanged || mapChanged) { v[K.tasks] = JSON.stringify(map); v[SYN] = now; changed = true; }
  });
  return changed;
}

/** 연동을 처음 켤 때 한 번 실행: 캘린더 · Tasks 권한을 허용하는 창이 뜹니다. */
function linkSetup() {
  CalendarApp.getDefaultCalendar().getName();
  if (typeof Tasks !== 'undefined') Tasks.Tasklists.list({ maxResults: 1 });
  const ui = tryUi_(); if (ui) ui.alert('연동 준비 완료 ✔\n\n앱의 ⋯ › 연동에서 구글 캘린더 · Tasks를 켜세요.');
}
