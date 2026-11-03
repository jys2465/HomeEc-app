/* 노트 · 일정 · 저금통 저장소 — 이 기기(localStorage)에 두고 시트의 notes / events / goals 탭과 동기화.
 *  표가 작아서 '마지막에 고친 것이 이김(updated)' 방식. 지운 것은 deleted 표시로 주고받습니다. */
(function (root) {
  'use strict';
  var AB = root.AB, U = AB.util, Sy = AB.sync;
  var X = AB.side = {}, KEY = 'ab.side', subs = [], busy = false;
  var db = { notes: {}, events: {}, goals: {}, q: [], since: 0 };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || 'null'); if (raw) db = Object.assign(db, raw); } catch (e) { /* 무시 */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 무시 */ } subs.forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } }); }
  X.on = function (f) { subs.push(f); };
  X.version = 0;
  function bump() { X.version++; }
  X.list = function (t) { var m = db[t] || {}; return Object.keys(m).map(function (k) { return m[k]; }).filter(function (r) { return !r.deleted; }); };
  X.get = function (t, id) { var r = (db[t] || {})[id]; return r && !r.deleted ? r : null; };
  X.put = function (t, row) {
    var r = Object.assign({}, row, { id: row.id || ('n' + U.uid()), updated: Date.now(), deleted: 0 });
    db[t][r.id] = r; db.q = db.q.filter(function (x) { return !(x.t === t && x.id === r.id); }); db.q.push({ t: t, id: r.id, op: 'put' });
    bump(); save(); kick(); return r;
  };
  X.del = function (t, id) {
    var r = db[t][id]; if (!r) return null; var before = Object.assign({}, r);
    r.deleted = 1; r.updated = Date.now();
    db.q = db.q.filter(function (x) { return !(x.t === t && x.id === id); }); db.q.push({ t: t, id: id, op: 'del' });
    bump(); save(); kick(); return before;
  };
  X.pending = function () { return db.q.length; };
  var kt = null;
  function kick() { clearTimeout(kt); kt = setTimeout(function () { X.sync(); }, 1500); }
  X.sync = async function () {
    if (busy || !Sy.configured() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { ok: false };
    busy = true;
    var sent = db.q.slice(0, 300), puts = [], dels = [];
    var sentKey = {};
    sent.forEach(function (x) { var r = db[x.t][x.id]; if (!r) return; sentKey[x.t + '|' + x.id] = r.updated; if (x.op === 'del') dels.push({ t: x.t, id: x.id, ts: r.updated }); else puts.push({ t: x.t, row: Object.assign({}, r) }); });
    try {
      var res = await Sy.call({ a: 'side', since: db.since, puts: puts, dels: dels }, 30000);
      if (!res || !res.ok) return { ok: false, err: res && res.err };
      Object.keys(res.rows || {}).forEach(function (t) {
        if (!db[t]) db[t] = {};
        (res.rows[t] || []).forEach(function (r) {
          var mine = db[t][r.id];
          if (mine && Number(mine.updated) > Number(r.updated)) return; // 내 것이 더 최근이면 유지
          db[t][r.id] = r;
        });
      });
      // 보낸 뒤 그 사이에 또 고치지 않은 것만 큐에서 뺌
      db.q = db.q.filter(function (x) { var k = x.t + '|' + x.id; return !(k in sentKey) || (db[x.t][x.id] && db[x.t][x.id].updated !== sentKey[k]); });
      db.since = res.now || Date.now();
      bump(); save(); return { ok: true };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
    finally { busy = false; }
  };
  X.wipe = function () { db = { notes: {}, events: {}, goals: {}, q: [], since: 0 }; bump(); save(); };

  /* 일정 펼치기: 반복(매주·매월·매년)을 기간 안의 날짜로 */
  X.eventsIn = function (start, end) {
    var out = [];
    X.list('events').forEach(function (e) {
      var d0 = String(e.start || '').slice(0, 10); if (!U.parse(d0)) return;
      var rep = e.repeat || '', push = function (d) { if (d >= start && d <= end) out.push({ ev: e, date: d, time: String(e.start || '').slice(11, 16) }); };
      if (!rep) { push(d0); return; }
      for (var d = d0, n = 0; d <= end && n < 800; n++) {
        push(d);
        if (rep === '매주') d = U.addDays(d, 7);
        else if (rep === '매월') { var p = U.parse(d0), q = U.parse(d); var m = U.shiftMonth(q.y + '-' + U.pad(q.m), 1), r = U.parse(m + '-01'); d = U.ymd(r.y, r.m, Math.min(p.d, U.daysInMonth(r.y, r.m))); }
        else if (rep === '매년') { var a = U.parse(d), o = U.parse(d0); d = U.ymd(a.y + 1, o.m, Math.min(o.d, U.daysInMonth(a.y + 1, o.m))); }
        else break;
      }
    });
    return out.sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
  };
})(typeof window !== 'undefined' ? window : globalThis);
