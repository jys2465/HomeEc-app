/* 최근 변경 3건 — 저장·수정·삭제를 기록해 두고, 건마다 되돌리기 / 다시 하기.
 *  store.saveMany / removeMany 를 감싸서 '바꾸기 전'과 '바꾼 뒤'를 함께 남깁니다(이 기기에만 저장).
 *  되돌리기·다시 하기 자체는 기록하지 않습니다. */
(function (root) {
  'use strict';
  var AB = root.AB, St = AB.store;
  var H = AB.history = {}, KEY = 'ab.hist', MAX = 3, quiet = 0, list = [], subs = [];
  try { list = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { list = []; }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* 무시 */ } subs.forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } }); }
  function clone(r) { return r ? JSON.parse(JSON.stringify(r)) : null; }
  function label(r) { return r ? (r.usage || r.category || ({ expense: '지출', income: '수입', transfer: '이체', budget: '예산' })[r.type] || '내역') : '내역'; }
  function amt(r) { return r ? (r.type === 'budget' ? r.budget : r.amount) || 0 : 0; }
  function push(e) { list.unshift(e); list = list.slice(0, MAX); persist(); }

  var saveMany = St.saveMany, removeMany = St.removeMany;
  St.saveMany = async function (inputs, opts) {
    var before = quiet ? null : inputs.map(function (i) { return clone(i && i.id ? St.get(i.id) : null); });
    var res = await saveMany.call(St, inputs, opts);
    if (!quiet && res && res.length) {
      var items = res.map(function (r, i) { return { before: before[i], after: clone(r) }; });
      var allNew = items.every(function (x) { return !x.before; }), one = items[0];
      push({ id: Date.now() + '' + Math.random().toString(36).slice(2, 6), at: Date.now(), op: allNew ? '저장' : '수정', undone: false,
        title: items.length > 1 ? label(one.after) + ' 외 ' + (items.length - 1) + '건' : label(one.after),
        sub: items.length > 1 ? items.length + '건' : (one.before && amt(one.before) !== amt(one.after) ? AB.util.num(amt(one.before)) + ' → ' + AB.util.num(amt(one.after)) + '원' : AB.util.num(amt(one.after)) + '원'),
        items: items });
    }
    return res;
  };
  St.removeMany = async function (ids, opts) {
    var before = quiet ? null : ids.map(function (id) { return clone(St.get(id)); }).filter(Boolean);
    var res = await removeMany.call(St, ids, opts);
    if (!quiet && before && before.length) push({ id: Date.now() + 'd', at: Date.now(), op: '삭제', undone: false,
      title: before.length > 1 ? label(before[0]) + ' 외 ' + (before.length - 1) + '건' : label(before[0]),
      sub: before.length > 1 ? before.length + '건' : AB.util.num(amt(before[0])) + '원', items: before.map(function (b) { return { before: b, after: null }; }) });
    return res;
  };

  /* 한 건을 되돌리거나(undo) 다시 하기(redo) */
  H.toggle = async function (id) {
    var e = list.filter(function (x) { return x.id === id; })[0]; if (!e) return null;
    var target = e.undone ? 'after' : 'before', puts = [], dels = [];
    e.items.forEach(function (it) {
      var want = it[target], other = it[target === 'before' ? 'after' : 'before'];
      if (want) { var cur = St.get(want.id); puts.push(Object.assign({}, want, { rev: cur ? cur.rev : want.rev })); }
      else if (other) dels.push(other.id);
    });
    quiet++;
    try { if (puts.length) await saveMany.call(St, puts); if (dels.length) await removeMany.call(St, dels); }
    finally { quiet--; }
    e.undone = !e.undone; persist(); return e;
  };
  H.undoAll = async function () { for (var i = 0; i < list.length; i++) if (!list[i].undone) await H.toggle(list[i].id); };
  H.list = function () { return list.slice(); };
  H.activeCount = function () { return list.filter(function (x) { return !x.undone; }).length; };
  H.on = function (f) { subs.push(f); };
  H.clear = function () { list = []; persist(); };
})(typeof window !== 'undefined' ? window : globalThis);
