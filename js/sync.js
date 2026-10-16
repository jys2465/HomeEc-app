/* 동기화 클라이언트 — '변경분'만 주고받고, 서버가 오류일 때는 로컬을 절대 건드리지 않습니다.
 *  - 요청은 text/plain 으로 보냅니다(브라우저 사전요청 OPTIONS 회피 → Apps Script 에서 막히지 않음)
 *  - 서버가 { ok:false } 이면 아무것도 적용하지 않음 (빈 데이터를 성공으로 오해하지 않음)
 *  - 전체 받기 결과가 로컬보다 크게 줄어들면(50% 미만) 사용자 확인 전에는 적용하지 않음
 */
(function (root) {
  'use strict';
  var AB = root.AB = root.AB || {};
  var St = AB.store, U = AB.util;
  var Sy = AB.sync = {};

  var status = { state: 'unconfigured', error: '' };
  var subs = [], running = false, again = false, started = false;

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k) || ''; if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* 무시 */ }
    return '';
  }
  Sy.getUrl = function () { return ls('ab.url'); };
  Sy.getToken = function () { return ls('ab.token'); };
  Sy.setConn = function (url, token) { ls('ab.url', String(url || '').trim()); ls('ab.token', String(token || '').trim()); set(Sy.configured() ? 'idle' : 'unconfigured'); };
  Sy.clearConn = function () { ls('ab.url', null); ls('ab.token', null); set('unconfigured'); };
  Sy.configured = function () { return !!(Sy.getUrl() && Sy.getToken()); };

  function set(state, extra) {
    status = Object.assign({}, status, { state: state, error: '' }, extra || {});
    subs.forEach(function (fn) { try { fn(Sy.status()); } catch (e) { console.error(e); } });
  }
  Sy.status = function () {
    return Object.assign({}, status, { pending: St.pendingCount(), rev: St.meta('rev') || 0, last: St.meta('lastSync') || 0, configured: Sy.configured() });
  };
  Sy.onStatus = function (fn) { subs.push(fn); };

  var ERR = {
    auth: '토큰이 맞지 않아요. 시트에서 [가계부 v2 > 앱 연결 토큰 보기]로 다시 확인해 주세요.',
    busy: '서버가 다른 작업 중이에요. 잠시 후 자동으로 다시 시도합니다.',
    too_many_deletes: '한 번에 너무 많은 내역을 지우려고 해서 서버가 막았어요.',
    unknown_action: '서버 스크립트가 구버전이에요. Code.gs 를 최신으로 바꾸고 새 버전으로 배포해 주세요.'
  };
  function errMsg(e) {
    if (!e) return '알 수 없는 오류';
    if (e.code && ERR[e.code]) return ERR[e.code];
    var m = String(e.message || e);
    if (/Failed to fetch|NetworkError|Load failed|aborted|AbortError/i.test(m)) return '서버에 연결하지 못했어요. 인터넷 연결과 웹 앱 URL(배포 URL)을 확인해 주세요.';
    return m;
  }

  async function call(payload, timeoutMs) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 40000) : null;
    try {
      var res = await fetch(Sy.getUrl(), {
        method: 'POST', redirect: 'follow', cache: 'no-store',
        body: JSON.stringify(Object.assign({ k: Sy.getToken(), v: 2 }, payload)), // Content-Type 은 기본값(text/plain) 그대로
        signal: ctl ? ctl.signal : undefined
      });
      var text = await res.text(), json;
      try { json = JSON.parse(text); } catch (e) { throw new Error('서버 응답을 읽을 수 없어요. 웹 앱 URL이 맞는지, 배포 권한이 "모든 사용자"인지 확인해 주세요.'); }
      return json;
    } finally { if (timer) clearTimeout(timer); }
  }

  /** 연결 테스트 */
  Sy.ping = async function () {
    if (!Sy.configured()) return { ok: false, error: '웹 앱 URL과 토큰을 먼저 입력해 주세요.' };
    try {
      var r = await call({ a: 'ping' }, 20000);
      if (!r.ok) return { ok: false, error: ERR[r.err] || String(r.err) };
      return r;
    } catch (e) { return { ok: false, error: errMsg(e) }; }
  };

  function stripOp(o) { var x = { op: o.op, id: o.id, ts: o.ts }; if (o.op === 'put') { x.base = o.base; x.row = o.row; } return x; }

  /**
   * opts: { full: 전체 다시 받기, force: 줄어듦 경고 무시, wantSum: sumary 값도 함께 받기 }
   * 반환: { ok, conflicts, rejected, sum } 또는 { ok:false, reason:'shrink'|'error'|'busy'|'unconfigured', ... }
   */
  Sy.syncNow = async function (opts) {
    opts = opts || {};
    if (!Sy.configured()) { set('unconfigured'); return { ok: false, reason: 'unconfigured' }; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { set('offline'); return { ok: false, reason: 'offline' }; }
    if (running) { again = true; return { ok: false, reason: 'busy' }; }
    running = true; set('syncing');
    var result = { ok: true, conflicts: 0, rejected: 0 };
    try {
      for (var loop = 0; loop < 10; loop++) {
        var ops = St.pendingOps(200), cfg = St.cfg(), dirty = !!St.meta('cfgDirty');
        var payload = {
          a: 'sync', dev: St.meta('dev'),
          since: (opts.full || !St.meta('synced')) ? -1 : (St.meta('rev') || 0),
          ops: ops.map(stripOp), bulk: ops.some(function (o) { return o.bulk; }), cfgTs: cfg.ts || 0
        };
        if (dirty) { var c = Object.assign({}, cfg); delete c.ts; payload.cfg = { json: JSON.stringify(c), ts: cfg.ts }; }
        if (opts.wantSum && loop === 0) payload.want = 'sum';
        var res = await call(payload);
        if (!res.ok) { var err = new Error(ERR[res.err] || ('서버 오류: ' + res.err)); err.code = res.err; throw err; }
        if (res.full && !opts.force) {
          var local = St.count();
          if (local >= 20 && (res.rows || []).length < local * 0.5) {
            set('idle');
            result = { ok: false, reason: 'shrink', local: local, server: res.rows.length };
            running = false; return result;
          }
        }
        await St.applyServer(res, ops.map(function (o) { return o.seq; }));
        if (res.cfg) { if (res.cfg.json) await St.applyServerCfg(res.cfg.json, res.cfg.ts); else if (res.cfg.saved) await St.cfgSaved(); }
        result.conflicts += (res.conflicts || []).length;
        result.rejected += (res.rejected || []).length;
        if (res.sum) result.sum = res.sum;
        if (!St.pendingCount()) break;
      }
      set('idle');
    } catch (e) {
      var msg = errMsg(e);
      set(e.code === 'busy' ? 'idle' : 'error', { error: msg });
      result = { ok: false, reason: 'error', error: msg, code: e.code };
      if (e.code === 'busy') setTimeout(function () { Sy.syncNow(); }, 4000);
    } finally { running = false; }
    if (again) { again = false; setTimeout(function () { Sy.syncNow(); }, 300); }
    return result;
  };

  Sy.kick = U.debounce(function () { if (Sy.configured()) Sy.syncNow(); }, 1500);

  /** 시작/복귀/온라인/주기적 자동 동기화 연결 */
  Sy.start = function () {
    if (started) return; started = true;
    St.onLocal(function () { Sy.kick(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Sy.configured() && Date.now() - (St.meta('lastSync') || 0) > 20000) Sy.syncNow();
    });
    root.addEventListener('online', function () { if (Sy.configured()) Sy.syncNow(); });
    root.addEventListener('offline', function () { set('offline'); });
    setInterval(function () { if (document.visibilityState === 'visible' && Sy.configured()) Sy.syncNow(); }, 5 * 60 * 1000);
    set(Sy.configured() ? 'idle' : 'unconfigured');
    if (Sy.configured()) Sy.syncNow();
  };

})(typeof window !== 'undefined' ? window : globalThis);
