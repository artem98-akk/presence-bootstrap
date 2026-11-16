// ==UserScript==
// @name         NAUROK AI
// @namespace    naurok-thin
// @version      3.2.1
// @match        *://naurok.com.ua/*
// @match        *://naurok.ua/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      79-76-123-117.sslip.io
// @connect      generativelanguage.googleapis.com
// @run-at       document-start
// ==/UserScript==
(() => {
  'use strict';
  if (window.__NAUROK_AI_V3__) return;
  window.__NAUROK_AI_V3__ = true;
  document.querySelectorAll('#nk,#pai-trigger,#pai-settings-zone,#pai-sheet').forEach((n) => n.remove());
  const SERVER = 'https://79-76-123-117.sslip.io';
  const SUPPORT_FALLBACK = 'https://t.me/bypassadminxz';
  const GM = globalThis.GM?.xmlHttpRequest ?? globalThis.GM_xmlhttpRequest;
  const DEFAULTS = { apiKey: '', model: 'gemini-3.5-flash-lite', style: 'glass', speed: 'fast', left: 12, bottom: 12 };
  const get = (k, d) => { try { return typeof GM_getValue === 'function' ? GM_getValue('nk_' + k, d) : JSON.parse(localStorage.getItem('nk_' + k) ?? 'null') ?? d; } catch { return d; } };
  const set = (k, v) => { try { if (typeof GM_setValue === 'function') GM_setValue('nk_' + k, v); else localStorage.setItem('nk_' + k, JSON.stringify(v)); } catch {} };
  const settings = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, get(k, DEFAULTS[k])]));
  let device = get('device', '');
  let access = null;
  let cfg = null;
  let cfgExpiresAt = 0;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function api(path, body, method = 'POST', extra = {}) {
    const headers = { 'content-type': 'application/json', ...(device ? { 'x-device': device } : {}), ...extra };
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
  async function refreshAccess() {
    try {
      await ensureDevice();
      access = await api('/api/me/access', undefined, 'GET');
      if (access.state === 'trial' || access.state === 'paid') {
        cfg = await api('/api/client/config', undefined, 'GET');
        cfgExpiresAt = Number(cfg.expiresAt) || 0;
      } else { cfg = null; cfgExpiresAt = 0; }
    } catch { access = null; cfg = null; cfgExpiresAt = 0; }
  }

  const style = document.createElement('style');
  style.textContent = `#nk-left,#nk-right{position:fixed;width:44px;height:44px;border:0;background:transparent;opacity:0;z-index:2147483000;touch-action:manipulation;padding:0;margin:0}
#nk-left{left:12px;bottom:calc(12px + env(safe-area-inset-bottom))}#nk-right{top:calc(12px + env(safe-area-inset-top));right:12px}
#nk-sheet{position:fixed;inset:0;z-index:2147483100;background:#08080a;color:#f5f5f7;display:flex;flex-direction:column;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
#nk-sheet[hidden]{display:none}.nk-scroll{flex:1;overflow:auto;padding:22px 18px 10px;max-width:560px;width:100%;margin:0 auto;box-sizing:border-box}
.nk-h{font-size:26px;font-weight:800;letter-spacing:-.04em;margin:0 0 6px}.nk-sub{color:#8b8b95;font-size:13px;line-height:1.5;margin:0 0 20px}
.nk-sec{background:#101013;border:1px solid #24242b;border-radius:18px;padding:16px;margin-bottom:12px}.nk-l{display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8b8b95;margin:0 0 7px}
.nk-in{width:100%;box-sizing:border-box;background:#18181d;border:1px solid #2c2c35;border-radius:10px;color:#fff;padding:11px;font:600 14px Inter,system-ui;outline:none}.nk-in.bad{border-color:#ff5a5a}
.nk-b{display:block;width:100%;box-sizing:border-box;border:0;border-radius:11px;padding:12px;margin-top:8px;font:700 14px Inter,system-ui;cursor:pointer;text-align:center;text-decoration:none;background:#d3fb3e;color:#08080a}.nk-b.alt{background:#1d1d24;color:#fff}.nk-b:disabled{opacity:.45}
.nk-row{display:flex;gap:8px}.nk-row>*{flex:1}.nk-pill{border:1px solid #2c2c35;background:#18181d;color:#8b8b95;border-radius:9px;padding:9px;font:600 12px Inter,system-ui;cursor:pointer}.nk-pill.on{border-color:#d3fb3e;color:#d3fb3e;background:#151a0e}
.nk-status{color:#b9b9c2;font-size:12px;line-height:1.6;margin:0}.nk-status b{color:#d3fb3e}.nk-actions{display:flex;gap:8px;padding:12px 18px calc(12px + env(safe-area-inset-bottom));max-width:560px;width:100%;margin:0 auto;box-sizing:border-box}
.nk-actions button{flex:1;padding:13px;border-radius:11px;border:0;font:700 14px Inter,system-ui}.nk-cancel{background:#1d1d24;color:#fff}.nk-save{background:#d3fb3e;color:#08080a}
#nk-answer.nk-alert{top:50%;left:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);width:min(90vw,520px);background:#101013;border:1px solid #2a2a33;border-radius:22px;padding:24px;box-shadow:0 24px 80px #000b}
.nk-alert .nk-a{font-size:26px;color:#fff;line-height:1.2;margin:0 0 12px;font-weight:700}.nk-alert .nk-e{font-size:18px;color:#f0f0f2;line-height:1.35;font-weight:600}.nk-alert .nk-x{margin-top:18px;justify-content:flex-end}.nk-alert .nk-x button{flex:0 0 auto;border:0;background:none;color:#4da3ff;font-size:18px;font-weight:600;padding:0}
#nk-answer{position:fixed;left:10px;right:10px;bottom:calc(66px + env(safe-area-inset-bottom));z-index:2147483001;background:#101013f2;border:1px solid #2a2a33;border-radius:18px;padding:16px;color:#f5f5f7;font-family:Inter,system-ui;box-shadow:0 20px 60px #000a;box-sizing:border-box}
#nk-answer.nk-card{top:50%;bottom:auto;left:50%;right:auto;transform:translate(-50%,-50%);width:min(360px,92vw)}
#nk-answer.nk-toast{bottom:calc(66px + env(safe-area-inset-bottom))}#nk-answer.nk-glass{bottom:0;border-radius:20px 20px 0 0;padding-bottom:calc(16px + env(safe-area-inset-bottom))}
#nk-answer b{font-size:10px;letter-spacing:.12em;color:#8b8b95;text-transform:uppercase}.nk-a{font-size:22px;font-weight:800;color:#d3fb3e;margin:6px 0;line-height:1.2}.nk-e{font-size:13px;color:#b9b9c2;line-height:1.45}.nk-x{display:flex;gap:8px;margin-top:12px}.nk-x button{flex:1;padding:9px;border-radius:9px;border:1px solid #2c2c35;background:#18181d;color:#fff;font:600 12px Inter,system-ui}`;
  const styleRoot = document.head || document.documentElement;
  if (styleRoot) styleRoot.appendChild(style); else addEventListener('DOMContentLoaded', () => document.head?.appendChild(style), { once: true });

  let sheet = null;
  let answer = null;
  function accessText() {
    if (!access) return 'Проверяю доступ…';
    if (access.state === 'paid') return `Доступ: <b>оплачен</b>${access.expiresAt ? ` · осталось ${Math.ceil((access.expiresAt - Date.now()) / 86400000)} дн.` : ''}`;
    if (access.state === 'trial') return `Пробный: <b>24 часа</b>${access.expiresAt ? ` · осталось ${Math.max(0, Math.ceil((access.expiresAt - Date.now()) / 3600000))} ч.` : ''}`;
    if (access.state === 'expired') return 'Доступ <b>закончился</b>';
    return 'Доступа нет';
  }
  function openSettings(message = '') {
    if (!sheet) {
      sheet = el('div'); sheet.id = 'nk-sheet'; sheet.hidden = true;
      document.body.appendChild(sheet);
    }
    const models = (cfg?.models || []).map((m) => `<option value="${esc(m.id)}"${m.id === settings.model ? ' selected' : ''}>${esc(m.label || m.id)}</option>`).join('');
    sheet.innerHTML = `<div class="nk-scroll">
      <h2 class="nk-h">NAUROK AI</h2><p class="nk-sub">${accessText()}${message ? `<br><span style="color:#ff6b6b">${esc(message)}</span>` : ''}</p>
      <div class="nk-sec"><label class="nk-l">2. Ключ доступа</label><input id="nk-license" class="nk-in" placeholder="NK-…" autocomplete="off"><button class="nk-b" id="nk-act">Активировать ключ</button><button class="nk-b alt" id="nk-trial">Попробовать 24 часа</button><a class="nk-b alt" href="${cfg?.supportUrl || SUPPORT_FALLBACK}" target="_blank" rel="noopener">Купить доступ</a></div>
      <div class="nk-sec"><label class="nk-l">1. Свой Gemini API-ключ</label><input id="nk-apikey" class="nk-in" type="password" value="${esc(settings.apiKey)}" placeholder="AIza… или AQ.…" autocomplete="off"><p class="nk-status" style="margin-top:7px">Ключ хранится в браузере и уходит только в Google. Получить: <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#d3fb3e">aistudio.google.com</a></p></div>
      <div class="nk-sec"><label class="nk-l">Модель</label><select id="nk-model" class="nk-in">${models || '<option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite</option>'}</select><label class="nk-l" style="margin-top:12px">Скорость</label><div class="nk-row"><button class="nk-pill" data-speed="fast">⚡ Быстро</button><button class="nk-pill" data-speed="accurate">🎯 Точно</button></div></div>
      <div class="nk-sec"><label class="nk-l">Стиль ответа</label><div class="nk-row" style="flex-wrap:wrap"><button class="nk-pill" data-style="glass">Glass</button><button class="nk-pill" data-style="card">Card</button><button class="nk-pill" data-style="toast">Toast</button><button class="nk-pill" data-style="alert">Alert</button></div><p class="nk-status" style="margin-top:8px">Настройки хранятся в браузере. Ключ Gemini на наш сервер не отправляется.</p></div>
      </div><div class="nk-actions"><button class="nk-cancel" id="nk-close">Закрыть</button><button class="nk-save" id="nk-save">Сохранить</button></div>`;
    sheet.hidden = false;
    const keySec = sheet.querySelector('#nk-apikey')?.closest('.nk-sec');
    const licSec = sheet.querySelector('#nk-license')?.closest('.nk-sec');
    if (keySec && licSec && keySec.parentNode === licSec.parentNode) keySec.parentNode.insertBefore(keySec, licSec);
    const mark = (type, value) => sheet.querySelectorAll(`[data-${type}]`).forEach((b) => b.classList.toggle('on', b.dataset[type] === value));
    mark('speed', settings.speed); mark('style', settings.style);
    sheet.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => { settings.speed = b.dataset.speed; mark('speed', settings.speed); });
    sheet.querySelectorAll('[data-style]').forEach((b) => b.onclick = () => { settings.style = b.dataset.style; mark('style', settings.style); });
    sheet.querySelector('#nk-close').onclick = () => { sheet.hidden = true; };
    sheet.querySelector('#nk-save').onclick = () => { settings.apiKey = sheet.querySelector('#nk-apikey').value.trim(); settings.model = sheet.querySelector('#nk-model').value; for (const k of Object.keys(DEFAULTS)) set(k, settings[k]); sheet.hidden = true; };
    sheet.querySelector('#nk-act').onclick = async (e) => { const key = sheet.querySelector('#nk-license').value.trim(); if (!key) return; e.target.disabled = true; try { await ensureDevice(); await api('/api/license/activate', { key }); await refreshAccess(); openSettings('Ключ активирован'); } catch (err) { openSettings(err.code === 'device_limit' ? 'Лимит устройств' : err.code === 'expired' ? 'Срок истёк' : 'Ключ недействителен'); } e.target.disabled = false; };
    sheet.querySelector('#nk-trial').onclick = async (e) => { e.target.disabled = true; try { await ensureDevice(); await api('/api/trial/start', {}); await refreshAccess(); openSettings('Пробный доступ активирован'); } catch (err) { openSettings(err.code === 'trial_used' ? 'Пробный уже использован' : err.message); } e.target.disabled = false; };
  }

  function closeAnswer() { document.querySelectorAll('#nk-answer').forEach((n) => n.remove()); answer = null; }
  function renderAnswer({ styleName = settings.style, loading = false, text = '', explanation = '', error = '', retry = null }) {
    closeAnswer();
    if (styleName === 'alert' && !loading) {
      answer = el('div'); answer.id = 'nk-answer'; answer.className = 'nk-alert';
      answer.innerHTML = '<div class="nk-a">' + (error ? 'Ошибка' : 'Відповідь: ' + esc(text)) + '</div><div class="nk-e">' + esc(error ? error : explanation) + '</div><div class="nk-x"><button id="nk-close-a">Закрыть</button></div>';
      document.body.appendChild(answer);
      answer.querySelector('#nk-close-a').onclick = closeAnswer;
      return;
    }
    answer = el('div'); answer.id = 'nk-answer'; answer.className = `nk-${styleName}`;
    answer.innerHTML = loading ? '<b>NAUROK AI</b><div class="nk-a">Думаю…</div>' : `<b>NAUROK AI</b><div class="nk-a">${esc(error || text)}</div><div class="nk-e">${esc(explanation)}</div><div class="nk-x"><button id="nk-copy">Копировать</button><button id="nk-close-a">Закрыть</button></div>`;
    document.body.appendChild(answer);
    if (!loading) {
      answer.querySelector('#nk-close-a').onclick = closeAnswer;
      answer.querySelector('#nk-copy').onclick = () => navigator.clipboard?.writeText(text);
    }
    if (styleName === 'toast' && !loading) { const box = answer; setTimeout(() => { if (answer === box) closeAnswer(); }, 4000); }
  }

  function extract() {
    const opts = [];
    for (const n of document.querySelectorAll(cfg.selectors?.option || 'label, li, button')) {
      if (n.closest('#nk-sheet,#nk-answer,#nk-left,#nk-right')) continue;
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 300) opts.push({ t, p: n.parentElement });
    }
    const groups = new Map();
    for (const o of opts) { if (!groups.has(o.p)) groups.set(o.p, []); groups.get(o.p).push(o.t); }
    let best = null;
    for (const [p, list] of groups) {
      const uniq = [...new Set(list)].slice(0, 8);
      if (uniq.length < 2) continue;
      let q = '';
      let node = p;
      for (let depth = 0; depth < 5 && node; depth += 1, node = node.parentElement) {
        q = (node.textContent || '').replace(/\s+/g, ' ').trim();
        for (const t of uniq) q = q.split(t).join(' ');
        q = q.replace(/\s+/g, ' ').trim().slice(0, 1500);
        if (q.length >= 8) break;
      }
      if (q.length < 8) continue;
      if (!best || uniq.length > best.options.length) best = { question: q, options: uniq };
    }
    if (best) return best;
    for (const n of document.querySelectorAll(cfg.selectors?.question || 'h1,h2,h3')) {
      const q = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (q.length >= 8) return { question: q.slice(0, 1500), options: [] };
    }
    return { question: '', options: [] };
  }

  function promptFor(question, options) {
    const list = options.map((v, i) => `${String.fromCharCode(65 + i)}) ${v}`).join('\n');
    return String(cfg.prompt).replaceAll('{{question}}', question).replaceAll('{{options}}', list ? 'Варианты:\n' + list : 'Вариантов нет.');
  }

  async function askOwn(question, options) {
    const key = settings.apiKey;
    if (GM) return new Promise((resolve, reject) => GM({ method: 'POST', url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`, headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, data: JSON.stringify({ contents: [{ parts: [{ text: promptFor(question, options) }] }], generationConfig: { temperature: 0.1, maxOutputTokens: settings.speed === 'accurate' ? 2500 : 1800, responseMimeType: 'application/json' } }), timeout: 30000,
      onload: (r) => { try { const d = JSON.parse(r.responseText); const t = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('\n'); if (!t) throw new Error('Пустой ответ'); resolve(t); } catch (e) { reject(e); } }, onerror: () => reject(new Error('Gemini недоступен')), ontimeout: () => reject(new Error('Таймаут Gemini')) }));
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts: [{ text: promptFor(question, options) }] }] }) });
    const d = await r.json(); if (!r.ok) throw new Error('Ключ Gemini неверный'); return (d.candidates?.[0]?.content?.parts || []).map((p) => p.text).join('\n');
  }

  function parseAnswer(text) {
    const raw = String(text || '').trim(); const a = raw.indexOf('{'); const b = raw.lastIndexOf('}');
    if (a !== -1 && b > a) {
      try {
        const d = JSON.parse(raw.slice(a, b + 1));
        const af = cfg.answerRules?.answerField || 'answer';
        const arr = (Array.isArray(d[af]) ? d[af] : [d[af]]).map(String).filter(Boolean);
        if (arr.length) return { answer: arr, explanation: String(d[cfg.answerRules?.explanationField || 'explanation'] || ''), type: d[cfg.answerRules?.typeField || 'type'] || 'single' };
      } catch {}
    }
    return { answer: [raw.slice(0, 120)], explanation: '', type: 'open' };
  }
  function mapAnswer(arr, options) {
    return arr.map((v) => {
      const m = /^[A-H]$/i.exec(v);
      if (!m) return v;
      const i = m[0].toUpperCase().charCodeAt(0) - 65;
      return options[i] ? `${m[0].toUpperCase()}) ${options[i]}` : m[0].toUpperCase();
    });
  }

  async function ask() {
    if (!access || !['trial', 'paid'].includes(access.state)) return openSettings('Нужен доступ или пробный период');
    if (!settings.apiKey) return openSettings('Вставь свой Gemini-ключ (aistudio.google.com/app/apikey)');
    try { if (!cfg || !cfgExpiresAt || Date.now() >= cfgExpiresAt) await refreshAccess(); } catch { return renderAnswer({ error: 'Не удалось обновить конфигурацию доступа' }); }
    if (!cfg) return openSettings('Конфигурация доступа не получена');
    const c = extract(); const question = c.question || window.prompt('Вопрос не найден. Введи его:'); if (!question) return;
    renderAnswer({ loading: true });
    try {
      const text = await askOwn(question, c.options);
      const p = parseAnswer(text);
      renderAnswer({ text: mapAnswer(p.answer, c.options).join(', '), explanation: p.explanation });
    } catch (e) { renderAnswer({ error: e.message || 'Gemini недоступен' }); }
  }

  function applyPos() { if (left) { left.style.left = settings.left + 'px'; left.style.bottom = `calc(${settings.bottom}px + env(safe-area-inset-bottom))`; } }
  let left, right;
  function mount() {
    if (!/\/test(\/|$)/.test(location.pathname)) return;
    document.querySelectorAll('#nk,#pai-trigger,#pai-settings-zone,#pai-sheet,.pai-answer,.nai-answer').forEach((n) => n.remove());
    if (document.getElementById('nk-left')) return;
    left = el('button'); left.id = 'nk-left'; left.setAttribute('aria-label', 'NAUROK AI'); left.onclick = () => { if (access && ['trial', 'paid'].includes(access.state)) ask(); else openSettings(); }; document.body.appendChild(left);
    right = el('button'); right.id = 'nk-right'; right.setAttribute('aria-label', 'Настройки NAUROK AI'); right.onclick = () => openSettings(); document.body.appendChild(right);
    applyPos(); refreshAccess();
  }
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount, { once: true });
  if (window.__NAUROK_AI_TEST__) {
    window.__NAUROK_AI__ = { parseAnswer, mapAnswer, extract, setCfg: (value) => { cfg = value; }, getCfg: () => cfg };
  }
})();
