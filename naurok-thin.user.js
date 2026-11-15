// ==UserScript==
// @name         NAUROK AI — тонкий клиент
// @namespace    naurok-thin
// @version      2.0.0
// @match        *://naurok.com.ua/*
// @match        *://naurok.ua/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      79-76-123-117.sslip.io
// @run-at       document-start
// ==/UserScript==
(() => {
  'use strict';
  const SERVER = 'https://79-76-123-117.sslip.io';
  const TELEGRAM = 'https://t.me/naurokhelper_bot';
  const GM = globalThis.GM?.xmlHttpRequest ?? globalThis.GM_xmlhttpRequest;
  const get = (k, d) => { try { return typeof GM_getValue === 'function' ? GM_getValue(k, d) : JSON.parse(localStorage.getItem('nk_' + k) ?? 'null') ?? d; } catch { return d; } };
  const set = (k, v) => { try { if (typeof GM_setValue === 'function') GM_setValue(k, v); else localStorage.setItem('nk_' + k, JSON.stringify(v)); } catch {} };
  let device = get('device', '');
  let access = null;
  let cfg = { selectors: { option: 'label, li, button, [role="button"]', question: 'h1, h2, h3, [class*="question"]' } };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function api(path, body, method = 'POST') {
    const headers = { 'content-type': 'application/json' };
    if (device) headers['x-device'] = device;
    const url = SERVER + path;
    if (GM) return new Promise((resolve, reject) => GM({ method, url, headers, data: body === undefined ? undefined : JSON.stringify(body), timeout: 30000,
      onload: (r) => { let d = {}; try { d = JSON.parse(r.responseText || '{}'); } catch {} if (r.status >= 200 && r.status < 300) resolve(d); else reject(Object.assign(new Error(d.message || 'Ошибка'), { status: r.status, code: d.code || 'error' })); },
      onerror: () => reject(Object.assign(new Error('Сервер недоступен'), { code: 'network' })), ontimeout: () => reject(Object.assign(new Error('Таймаут'), { code: 'network' })) }));
    return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.message || 'Ошибка'), { status: r.status, code: d.code || 'error' }); return d; });
  }

  async function ensureDevice() {
    if (device) return;
    const fp = [navigator.userAgent, screen.width, screen.height, devicePixelRatio, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language].join('|').slice(0, 180);
    const d = await api('/api/device/register', { fingerprint: fp, ua: navigator.userAgent.slice(0, 250) });
    device = d.deviceSecret; set('device', device);
  }

  async function refresh() {
    try { await ensureDevice(); access = await api('/api/me/access', undefined, 'GET'); if (['trial', 'paid'].includes(access.state)) { cfg = await api('/api/client/config', undefined, 'GET'); closeModal(); } else showActivation(); }
    catch (e) { access = null; showActivation(e.code); }
  }

  const style = document.createElement('style');
  style.textContent = `#nk{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147483000;width:44px;height:44px;border-radius:14px;border:1px solid #34343d;background:#101013;color:#d3fb3e;font:700 13px Inter,system-ui;cursor:pointer;box-shadow:0 8px 24px #0008}
#nk-modal{position:fixed;inset:0;z-index:2147483100;background:#08080ae8;display:flex;align-items:flex-end;justify-content:center;padding:18px;font-family:Inter,system-ui;color:#f6f6f8}
#nk-card{width:min(420px,100%);background:#101013;border:1px solid #24242b;border-radius:24px;padding:22px;box-shadow:0 24px 80px #000a}
#nk-card h2{margin:0 0 8px;font-size:24px;letter-spacing:-.03em}#nk-card p{color:#8b8b95;font-size:14px;line-height:1.5;margin:0 0 16px}
#nk-card input{width:100%;box-sizing:border-box;background:#18181d;border:1px solid #2c2c35;border-radius:12px;color:#fff;padding:13px;font:600 14px Inter,system-ui;letter-spacing:.08em;text-transform:uppercase}
.nk-b{display:block;width:100%;box-sizing:border-box;border:0;border-radius:12px;padding:13px;margin-top:9px;font:700 14px Inter,system-ui;cursor:pointer;text-align:center;text-decoration:none;background:#d3fb3e;color:#08080a}.nk-b.alt{background:#1d1d24;color:#fff}.nk-b:disabled{opacity:.5}
#nk-answer{position:fixed;left:12px;right:12px;bottom:calc(70px + env(safe-area-inset-bottom));z-index:2147483001;background:#101013f2;border:1px solid #2a2a33;border-radius:18px;padding:16px;color:#f6f6f8;font-family:Inter,system-ui;box-shadow:0 20px 60px #000a}
#nk-answer b{font-size:11px;letter-spacing:.12em;color:#8b8b95}.nk-a{font-size:23px;font-weight:800;color:#d3fb3e;margin:6px 0;line-height:1.2}.nk-e{font-size:13px;color:#b9b9c2;line-height:1.45}.nk-x{display:flex;gap:8px;margin-top:12px}.nk-x button{flex:1;padding:9px;border-radius:9px;border:1px solid #2c2c35;background:#18181d;color:#fff;font:600 12px Inter,system-ui}`;
  document.documentElement.appendChild(style);

  let modal = null;
  function showActivation(code = '') {
    closeModal();
    modal = el('div'); modal.id = 'nk-modal';
    modal.innerHTML = `<div id="nk-card"><h2>NAUROK AI</h2><p>Пробный доступ на 24 часа — один раз на устройство. Или введи ключ.</p><input id="nk-key" placeholder="NK-XXXX-XXXX-XXXX-XXXXX" autocomplete="off"><button class="nk-b" id="nk-trial">Попробовать 1 день</button><button class="nk-b alt" id="nk-act">Активировать ключ</button><a class="nk-b alt" href="${TELEGRAM}" target="_blank" rel="noopener">Купить ключ в Telegram</a><p id="nk-err" style="margin:10px 0 0;color:#ff6b6b">${code ? esc(code === 'trial_used' ? 'Пробный уже использован. Нужен ключ.' : code === 'device_limit' ? 'Лимит устройств по ключу.' : code === 'expired' ? 'Срок доступа истёк.' : '') : ''}</p></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#nk-trial').onclick = async (e) => { e.target.disabled = true; try { await ensureDevice(); await api('/api/trial/start', {}); await refresh(); } catch (err) { modal.querySelector('#nk-err').textContent = err.code === 'trial_used' ? 'Пробный уже использован. Нужен ключ.' : err.message; e.target.disabled = false; } };
    modal.querySelector('#nk-act').onclick = async (e) => { const key = modal.querySelector('#nk-key').value.trim(); if (!key) return; e.target.disabled = true; try { await ensureDevice(); await api('/api/license/activate', { key }); await refresh(); } catch (err) { modal.querySelector('#nk-err').textContent = err.code === 'device_limit' ? 'Лимит устройств по ключу.' : err.code === 'expired' ? 'Срок ключа истёк.' : 'Ключ недействителен.'; e.target.disabled = false; } };
  }
  function closeModal() { if (modal) { modal.remove(); modal = null; } }

  function extract() {
    const opts = [];
    for (const n of document.querySelectorAll(cfg.selectors.option)) {
      if (n.closest('#nk,#nk-modal,#nk-answer')) continue;
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 300) opts.push({ t, p: n.parentElement });
    }
    const groups = new Map();
    for (const o of opts) { if (!groups.has(o.p)) groups.set(o.p, []); groups.get(o.p).push(o.t); }
    let best = null;
    for (const [p, list] of groups) {
      const uniq = [...new Set(list)].slice(0, 8);
      if (uniq.length < 2) continue;
      let q = (p.textContent || '').replace(/\s+/g, ' ').trim();
      for (const t of uniq) q = q.split(t).join(' ');
      q = q.replace(/\s+/g, ' ').trim().slice(0, 1500);
      if (q.length < 8) continue;
      if (!best || uniq.length > best.options.length) best = { question: q, options: uniq };
    }
    if (best) return best;
    for (const n of document.querySelectorAll(cfg.selectors.question)) {
      const q = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (q.length >= 8) return { question: q.slice(0, 1500), options: [] };
    }
    return { question: '', options: [] };
  }

  async function ask() {
    if (!['trial', 'paid'].includes(access?.state)) return showActivation(access?.state);
    const c = extract();
    const question = c.question || window.prompt('Вопрос не найден. Введи его вручную:');
    if (!question) return;
    const box = el('div'); box.id = 'nk-answer'; box.innerHTML = '<b>NAUROK AI</b><div class="nk-a">Думаю…</div><div class="nk-e"></div>'; document.body.appendChild(box);
    try {
      const d = await api('/api/client/answer', { question, options: c.options });
      box.innerHTML = `<b>NAUROK AI · ${esc(d.provider || '')}</b><div class="nk-a">${esc(d.answerText.join(', '))}</div><div class="nk-e">${esc(d.explanation || '')}</div><div class="nk-x"><button id="nk-copy">Копировать</button><button id="nk-close">Закрыть</button></div>`;
      box.querySelector('#nk-close').onclick = () => box.remove();
      box.querySelector('#nk-copy').onclick = () => navigator.clipboard?.writeText(d.answerText.join(', '));
    } catch (e) {
      box.innerHTML = `<b>NAUROK AI</b><div class="nk-a">${e.code === 'quota_exhausted' ? 'Лимит на сегодня' : e.code === 'expired' ? 'Доступ закончился' : 'Ошибка'}</div><div class="nk-e">${esc(e.message)}</div>`;
    }
  }

  function mount() {
    if (!/\/test(\/|$)/.test(location.pathname)) return;
    const btn = el('button', '', 'AI'); btn.id = 'nk'; btn.title = 'NAUROK AI';
    btn.onclick = () => { if (!access) showActivation(); else ask(); };
    document.body.appendChild(btn);
    refresh();
  }
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount, { once: true });
})();
