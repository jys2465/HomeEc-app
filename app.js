/* 앱 시작 — PIN 잠금 · 서비스 워커 · 부팅 순서 */
(function (root) {
  'use strict';
  var AB = root.AB, U = AB.util, St = AB.store, Sy = AB.sync, UI = AB.ui;
  AB.VERSION = '2.0.0';
  var $ = function (s) { return document.querySelector(s); };

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* 무시 */ }
    return null;
  }

  /* ───────────── PIN (소금 + PBKDF2 해시. 원문 PIN은 저장하지 않음) ───────────── */
  var L = AB.lock = {};
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  async function hashPin(pin, saltHex, iter) {
    var enc = new TextEncoder();
    if (root.crypto && root.crypto.subtle) {
      var salt = new Uint8Array(saltHex.match(/../g).map(function (h) { return parseInt(h, 16); }));
      var key = await root.crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
      return hex(await root.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, key, 256));
    }
    var h = 2166136261, s = saltHex + pin; // https 가 아닌 환경(로컬 테스트)용 대체 — 실제 배포(HTTPS)에서는 사용되지 않음
    for (var r = 0; r < 20000; r++) for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return 'x' + h.toString(16);
  }
  function stored() { try { return JSON.parse(ls('ab.pin') || 'null'); } catch (e) { return null; } }
  L.hasPin = function () { return !!stored(); };
  L.setPin = async function (pin) {
    var salt = hex(root.crypto.getRandomValues(new Uint8Array(16))), iter = 150000;
    ls('ab.pin', JSON.stringify({ salt: salt, iter: iter, len: pin.length, hash: await hashPin(pin, salt, iter) }));
  };
  L.verify = async function (pin) { var p = stored(); return !!p && (await hashPin(pin, p.salt, p.iter)) === p.hash; };

  var lk = { mode: 'unlock', buf: '', first: '', busy: false };
  var AVATAR = 'assets/photo.jpg';

  function lockHtml() {
    var setup = lk.mode === 'setup', msg;
    var until = +(ls('ab.until') || 0), wait = Math.ceil((until - Date.now()) / 1000);
    if (setup) msg = lk.first ? 'PIN을 한 번 더 입력하세요' : '앱을 잠글 PIN을 정해 주세요 (숫자 4~8자리)';
    else msg = wait > 0 ? 'PIN을 여러 번 틀렸어요. ' + wait + '초 뒤에 다시 시도하세요' : 'PIN을 입력하세요';
    var len = setup ? Math.max(lk.buf.length, 4) : (stored() ? stored().len : 4);
    var dots = ''; for (var i = 0; i < len; i++) dots += '<i class="' + (i < lk.buf.length ? 'f' : '') + '"></i>';
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(function (k) { return '<button type="button" data-k="' + k + '" aria-label="' + (k === 'C' ? '모두 지우기' : k === '⌫' ? '한 칸 지우기' : k) + '">' + k + '</button>'; }).join('');
    return '<img class="avatar" id="lk-avatar" src="' + AVATAR + '" alt="" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'avatar\',innerHTML:\'<div style=&quot;font-size:40px;line-height:78px&quot;>📒</div>\'}))">' +
      '<h2>' + (setup ? 'PIN 설정' : '가계부 잠금') + '</h2><p id="lk-msg">' + msg + '</p><div class="pin-dots" id="lk-dots">' + dots + '</div><div class="keypad">' + keys + '</div>' +
      (setup ? '<button type="button" class="btn" id="lk-ok" style="margin-top:18px;min-width:180px;background:#fff;color:#234A42" ' + (lk.buf.length >= 4 ? '' : 'disabled') + '>' + (lk.first ? '확인' : '다음') + '</button>' : '<button type="button" class="link" id="lk-forgot">PIN을 잊었어요</button>');
  }
  function draw() { var el = $('#lock'); el.innerHTML = lockHtml(); el.hidden = false; }

  L.show = function (mode) { lk.mode = mode; lk.buf = ''; lk.first = ''; draw(); };
  L.lockNow = function () { if (!L.hasPin()) return; UI.closeSheet(); L.show('unlock'); $('#app').setAttribute('aria-hidden', 'true'); };

  function unlocked() {
    $('#lock').hidden = true; $('#lock').innerHTML = ''; $('#app').hidden = false; $('#app').removeAttribute('aria-hidden');
    UI.render(); Sy.start();
  }
  async function submit() {
    if (lk.busy) return; lk.busy = true;
    try {
      if (lk.mode === 'setup') {
        if (!lk.first) { lk.first = lk.buf; lk.buf = ''; draw(); return; }
        if (lk.first !== lk.buf) { lk.first = ''; lk.buf = ''; draw(); $('#lk-msg').textContent = '두 번 입력한 PIN이 달라요. 처음부터 다시 정해 주세요'; return; }
        await L.setPin(lk.buf); ls('ab.fail', '0'); unlocked(); return;
      }
      var until = +(ls('ab.until') || 0);
      if (until > Date.now()) { lk.buf = ''; draw(); return; }
      if (await L.verify(lk.buf)) { ls('ab.fail', '0'); ls('ab.until', '0'); unlocked(); return; }
      var f = (+(ls('ab.fail') || 0)) + 1; ls('ab.fail', String(f));
      if (f >= 5) { ls('ab.until', String(Date.now() + Math.min(300, 15 * (f - 4)) * 1000)); }
      lk.buf = ''; draw();
      var dots = $('#lk-dots'); if (dots) { dots.classList.add('shake'); }
      $('#lk-msg').textContent = f >= 5 ? 'PIN을 여러 번 틀렸어요. 잠시 후 다시 시도하세요' : 'PIN이 맞지 않아요 (' + f + '/5)';
      if (navigator.vibrate) navigator.vibrate(60);
    } finally { lk.busy = false; }
  }
  function press(k) {
    if (lk.busy) return; // PIN 확인 중에 들어온 입력은 무시(숫자가 뒤섞이는 것 방지)
    if (k === 'C') lk.buf = ''; else if (k === '⌫') lk.buf = lk.buf.slice(0, -1);
    else if (lk.buf.length < 8) lk.buf += k;
    else return;
    var p = stored();
    if (lk.mode === 'unlock' && p && lk.buf.length === p.len) { draw(); submit(); return; }
    var msg = $('#lk-msg') && $('#lk-msg').textContent; draw(); if ($('#lk-msg') && msg && lk.mode === 'unlock') $('#lk-msg').textContent = msg;
  }
  function bindLock() {
    $('#lock').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-k]');
      if (b) { press(b.dataset.k); return; }
      if (e.target.id === 'lk-ok' && lk.buf.length >= 4) { submit(); return; }
      if (e.target.id === 'lk-forgot') {
        if (await UI.confirm('PIN을 잊으셨나요?\n이 기기의 내역·설정·시트 연결 정보를 모두 지우고 처음부터 다시 시작합니다.\n(구글 시트의 데이터는 그대로 있어요. 다시 연결하면 모두 돌아옵니다.)', { danger: true, ok: '이 기기 초기화' })) {
          await St.wipe(); ['ab.url', 'ab.token', 'ab.pin', 'ab.fail', 'ab.until', 'ab.lockSec', 'ab.theme'].forEach(function (k) { ls(k, null); }); location.reload();
        }
      }
    });
    document.addEventListener('keydown', function (e) {
      if ($('#lock').hidden) return;
      if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Enter' && lk.mode === 'setup' && lk.buf.length >= 4) submit();
    });
    var hiddenAt = 0;
    document.addEventListener('visibilitychange', function () {
      if (!L.hasPin() || !$('#lock').hidden) return;
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      var sec = ls('ab.lockSec'); sec = sec === null ? 60 : +sec;
      if (sec >= 0 && hiddenAt && Date.now() - hiddenAt >= sec * 1000) L.lockNow();
    });
  }

  /* ───────────── 서비스 워커 ───────────── */
  function registerSW() {
    if (!('serviceWorker' in navigator) || !/^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.protocol + '//' + location.hostname)) return;
    var reloaded = false, hadController = !!navigator.serviceWorker.controller; // 처음 설치될 때는 새로고침하지 않음
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (reloaded || !hadController) return; reloaded = true; location.reload(); });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function offer(w) { UI.toast('새 버전이 준비됐어요', { ms: 12000, action: { label: '지금 적용', fn: function () { w.postMessage({ type: 'SKIP_WAITING' }); } } }); }
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
      setInterval(function () { reg.update().catch(function () { /* 오프라인 */ }); }, 60 * 60 * 1000);
    }).catch(function (e) { console.warn('서비스 워커 등록 실패', e); });
  }

  /* ───────────── 시작 ───────────── */
  async function boot() {
    UI.applyTheme(ls('ab.theme') || 'auto');
    try { await St.init(); }
    catch (e) {
      $('#lock').innerHTML = '<h2>저장소를 열 수 없어요</h2><p>사파리의 "비공개 브라우징"이거나 저장 공간이 막혀 있을 수 있어요.<br>' + U.esc(e.message || e) + '</p>'; return;
    }
    UI.init(); bindLock(); registerSW();
    L.show(L.hasPin() ? 'unlock' : 'setup');
    $('#fab').addEventListener('click', function () { UI.openAdd(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

})(typeof window !== 'undefined' ? window : globalThis);
