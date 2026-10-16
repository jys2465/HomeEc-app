/* 로컬 저장소 — IndexedDB.
 *  rows      : 원장(내역) 전체
 *  ops       : 아직 서버에 못 보낸 변경 큐 (행 변경과 '같은 트랜잭션'으로 기록 → 서로 어긋나지 않음)
 *  meta      : rev(마지막으로 받은 서버 버전), 기기 ID, 설정(cfg) 등
 *  conflicts : 서버가 '더 최신'이라며 채택하지 않은 내 변경(되살리기용)
 */
(function (root) {
  'use strict';
  var AB = root.AB = root.AB || {};
  var U = AB.util;
  var St = AB.store = {};

  var DB_NAME = 'GagyebuV2', db = null;
  var mem = { rows: [], byId: {}, meta: {}, ops: [], conflicts: [], version: 0 };
  var listeners = [];

  var FIELDS = ['date', 'type', 'repeat', 'category', 'usage', 'budget', 'amount', 'from', 'to', 'memo1', 'memo2'];

  function open() {
    return new Promise(function (res, rej) {
      var rq = root.indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = function () {
        var d = rq.result;
        if (!d.objectStoreNames.contains('rows')) d.createObjectStore('rows', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('ops')) d.createObjectStore('ops', { keyPath: 'seq', autoIncrement: true });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('conflicts')) d.createObjectStore('conflicts', { keyPath: 'cid', autoIncrement: true });
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }

  function tx(stores, mode, work) {
    return new Promise(function (res, rej) {
      var t = db.transaction(stores, mode), out;
      try { out = work(t); } catch (e) { try { t.abort(); } catch (_) { /* 무시 */ } rej(e); return; }
      t.oncomplete = function () { res(out); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error || new Error('저장이 중단되었어요')); };
    });
  }
  function getAll(store) {
    return new Promise(function (res, rej) {
      var rq = db.transaction(store, 'readonly').objectStore(store).getAll();
      rq.onsuccess = function () { res(rq.result || []); };
      rq.onerror = function () { rej(rq.error); };
    });
  }

  function norm(o) {
    return {
      id: String(o.id), date: String(o.date || ''), type: o.type || 'expense', repeat: o.repeat === '고정' ? '고정' : '변동',
      category: String(o.category || ''), usage: String(o.usage || ''), budget: Number(o.budget) || 0, amount: Number(o.amount) || 0,
      from: String(o.from || ''), to: String(o.to || ''), memo1: String(o.memo1 || ''), memo2: String(o.memo2 || ''),
      rev: Number(o.rev) || 0, ts: Number(o.ts) || 0
    };
  }
  function opRow(r) { var o = {}; FIELDS.forEach(function (k) { o[k] = r[k]; }); return o; }
  St.norm = norm;

  var localListeners = [];
  function emit() { mem.version++; listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  /** 사용자가 직접 바꾼 경우에만 호출(→ 동기화 예약). 서버 응답 반영은 포함하지 않아 무한 반복을 막음 */
  function emitLocal() { emit(); localListeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  St.on = function (fn) { listeners.push(fn); };
  St.onLocal = function (fn) { localListeners.push(fn); };
  St.version = function () { return mem.version; };

  async function reloadMem() {
    var rows = await getAll('rows'), ops = await getAll('ops'), meta = await getAll('meta'), conf = await getAll('conflicts');
    mem.rows = rows.filter(function (r) { return r.date; });
    mem.byId = {}; mem.rows.forEach(function (r) { mem.byId[r.id] = r; });
    mem.ops = ops.sort(function (a, b) { return a.seq - b.seq; });
    mem.meta = {}; meta.forEach(function (m) { mem.meta[m.key] = m.value; });
    mem.conflicts = conf;
  }

  St.init = async function () {
    db = await open();
    await reloadMem();
    if (!mem.meta.dev) await St.setMeta('dev', 'd' + U.uid().slice(1, 9));
    emit();
  };

  St.rows = function () { return mem.rows; };
  St.get = function (id) { return mem.byId[id] || null; };
  St.count = function () { return mem.rows.length; };
  St.meta = function (k) { return mem.meta[k]; };
  St.setMeta = async function (k, v) {
    await tx(['meta'], 'readwrite', function (t) { t.objectStore('meta').put({ key: k, value: v }); });
    mem.meta[k] = v;
  };

  function findOp(id, kind) { for (var i = mem.ops.length - 1; i >= 0; i--) if (mem.ops[i].id === id && mem.ops[i].op === kind) return mem.ops[i]; return null; }

  /** 내역 저장(추가/수정). 행 + 변경 큐를 한 트랜잭션으로 기록. */
  St.save = async function (input) { return St.saveMany([input]).then(function (r) { return r[0]; }); };

  St.saveMany = async function (inputs, opts) {
    opts = opts || {};
    var now = Date.now(), saved = [], newOps = [];
    var delOpsToDrop = [];
    var plans = inputs.map(function (inp) {
      var prev = mem.byId[inp.id], row = norm(inp);
      row.ts = now; row.rev = prev ? prev.rev : (Number(inp.rev) || 0);
      var delOp = findOp(row.id, 'del'); if (delOp) delOpsToDrop.push(delOp.seq);
      return { row: row, base: prev ? prev.rev : 0, queued: findOp(row.id, 'put') };
    });
    await tx(['rows', 'ops'], 'readwrite', function (t) {
      var rs = t.objectStore('rows'), os = t.objectStore('ops');
      delOpsToDrop.forEach(function (seq) { os.delete(seq); });
      plans.forEach(function (p) {
        rs.put(p.row); saved.push(p.row);
        if (p.queued) { p.queued.row = opRow(p.row); p.queued.ts = now; if (opts.bulk) p.queued.bulk = true; os.put(p.queued); }
        else {
          var op = { op: 'put', id: p.row.id, ts: now, base: p.base, row: opRow(p.row), bulk: !!opts.bulk };
          var rq = os.add(op); rq.onsuccess = function () { op.seq = rq.result; };
          newOps.push(op);
        }
      });
    });
    await reloadMem(); emitLocal();
    return saved;
  };

  St.remove = function (id) { return St.removeMany([id]); };
  St.removeMany = async function (ids, opts) {
    opts = opts || {};
    var now = Date.now(), dropSeqs = [], delOps = [];
    ids.forEach(function (id) {
      mem.ops.forEach(function (o) { if (o.id === id && o.op === 'put') dropSeqs.push(o.seq); });
      delOps.push({ op: 'del', id: id, ts: now, bulk: !!opts.bulk || ids.length > 25 });
    });
    await tx(['rows', 'ops'], 'readwrite', function (t) {
      var rs = t.objectStore('rows'), os = t.objectStore('ops');
      dropSeqs.forEach(function (s) { os.delete(s); });
      ids.forEach(function (id) { rs.delete(id); });
      delOps.forEach(function (o) { os.add(o); });
    });
    await reloadMem(); emitLocal();
  };

  /* ───────── 변경 큐 ───────── */
  St.pendingOps = function (limit) { return mem.ops.slice(0, limit || 200); };
  St.pendingCount = function () { return mem.ops.length; };

  /**
   * 서버 응답 반영: 전체(full) 교체 또는 변경분(changes) 적용 → 보낸 큐 삭제 → rev 갱신.
   * 그 사이 새로 쌓인(아직 안 보낸) 변경은 화면에 계속 보이도록 위에 다시 덮어 둡니다.
   */
  St.applyServer = async function (res, sentSeqs) {
    var fromServer = function (o) { var r = norm(o); return r; };
    var conflicts = res.conflicts || [];
    await tx(['rows', 'ops', 'meta', 'conflicts'], 'readwrite', function (t) {
      var rs = t.objectStore('rows');
      if (res.full) { rs.clear(); (res.rows || []).forEach(function (r) { if (r.date) rs.put(fromServer(r)); }); }
      else (res.changes || []).forEach(function (c) {
        if (c.op === 'del') rs.delete(c.id);
        else if (c.row) rs.put(fromServer(Object.assign({}, c.row, { id: c.id, rev: c.rev, ts: c.ts })));
      });
      conflicts.forEach(function (c) {
        if (c.theirs) rs.put(fromServer(Object.assign({}, c.theirs, { id: c.id, rev: c.theirsRev, ts: Date.now() })));
        t.objectStore('conflicts').add({ id: c.id, mine: c.mine, theirs: c.theirs, at: Date.now() });
      });
      (sentSeqs || []).forEach(function (s) { t.objectStore('ops').delete(s); });
      var ms = t.objectStore('meta');
      ms.put({ key: 'rev', value: res.rev }); ms.put({ key: 'synced', value: true }); ms.put({ key: 'lastSync', value: Date.now() });
    });
    await reloadMem();
    // 남은(아직 안 보낸) 변경을 화면용으로 다시 덮어쓰기
    if (mem.ops.length) {
      await tx(['rows'], 'readwrite', function (t) {
        var rs = t.objectStore('rows');
        mem.ops.forEach(function (o) {
          if (o.op === 'del') rs.delete(o.id);
          else { var cur = mem.byId[o.id]; rs.put(norm(Object.assign({}, cur || {}, o.row, { id: o.id, rev: cur ? cur.rev : 0, ts: o.ts }))); }
        });
      });
      await reloadMem();
    }
    emit();
  };

  /* ───────── 충돌 보관함 ───────── */
  St.conflicts = function () { return mem.conflicts; };
  St.dismissConflict = async function (cid) {
    await tx(['conflicts'], 'readwrite', function (t) { t.objectStore('conflicts').delete(cid); });
    await reloadMem(); emit();
  };

  /* ───────── 설정(계정·항목 등) ───────── */
  St.cfg = function () { return mem.meta.cfg || {}; };
  St.saveCfg = async function (cfg) {
    cfg = Object.assign({}, cfg, { ts: Date.now() });
    await tx(['meta'], 'readwrite', function (t) { var m = t.objectStore('meta'); m.put({ key: 'cfg', value: cfg }); m.put({ key: 'cfgDirty', value: true }); });
    mem.meta.cfg = cfg; mem.meta.cfgDirty = true; emitLocal();
  };
  St.applyServerCfg = async function (json, ts) {
    var cfg; try { cfg = JSON.parse(json); } catch (e) { return; }
    cfg.ts = ts;
    await tx(['meta'], 'readwrite', function (t) { var m = t.objectStore('meta'); m.put({ key: 'cfg', value: cfg }); m.put({ key: 'cfgDirty', value: false }); });
    mem.meta.cfg = cfg; mem.meta.cfgDirty = false; emit();
  };
  St.cfgSaved = async function () { await St.setMeta('cfgDirty', false); };

  /** 이 기기의 로컬 데이터를 모두 지움 (PIN 분실 시 등). 서버(시트) 데이터는 그대로 */
  St.wipe = function () {
    return new Promise(function (res) {
      try { db.close(); } catch (e) { /* 무시 */ }
      var rq = root.indexedDB.deleteDatabase(DB_NAME);
      rq.onsuccess = rq.onerror = rq.onblocked = function () { res(); };
    });
  };

})(typeof window !== 'undefined' ? window : globalThis);
