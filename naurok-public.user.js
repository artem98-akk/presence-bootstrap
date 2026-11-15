// ==UserScript==
// @name         Naurok AI — Public
// @namespace    naurok-public
// @version      1.0.0
// @description  Присутствие + AI-ответы. Сервер и токен задаются в настройках, код править не нужно.
// @match        *://naurok.com.ua/*
// @match        *://naurok.ua/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const win = window;
  const doc = document;

  const DEFAULTS = {
    server: '',
    token: '',
    speed: 'fast',
    style: 'glass',
    stealth: 'soft',
    posLeft: 12,
    posBottom: 12
  };
  const HEARTBEAT_MS = 15_000;
  const LONG_PRESS_MS = 500;
  const TOAST_MS = 4_000;
  const REATTACH_MS = 300;
  const STYLE_IDS = ['glass', 'card', 'toast', 'alert'];
  const SPEED_IDS = ['fast', 'accurate'];
  const STEALTH_IDS = ['off', 'soft', 'hard'];

  const gm = globalThis.GM?.xmlHttpRequest ?? globalThis.GM_xmlhttpRequest;
  const newId = () =>
    globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const sessionId = newId();
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  function storageGet(name, fallback) {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(`pai_${name}`, fallback);
    } catch {
      /* ignore */
    }
    try {
      const raw = win.localStorage.getItem(`pai_${name}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function storageSet(name, value) {
    try {
      if (typeof GM_setValue === 'function') return GM_setValue(`pai_${name}`, value);
    } catch {
      /* ignore */
    }
    try {
      win.localStorage.setItem(`pai_${name}`, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  function sanitize(name, value) {
    if (name === 'speed') return SPEED_IDS.includes(value) ? value : DEFAULTS.speed;
    if (name === 'style') return STYLE_IDS.includes(value) ? value : DEFAULTS.style;
    if (name === 'stealth') return STEALTH_IDS.includes(value) ? value : DEFAULTS.stealth;
    if (name === 'posLeft' || name === 'posBottom') {
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : DEFAULTS[name];
    }
    if (name === 'server') return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
    if (name === 'token') return typeof value === 'string' ? value.trim() : '';
    return value;
  }

  let settings = Object.fromEntries(
    Object.keys(DEFAULTS).map((name) => [name, sanitize(name, storageGet(name, DEFAULTS[name]))])
  );
  let ready = false;

  function isTestPage() {
    return /\/test(\/|$)/.test(win.location.pathname);
  }
  function hasConfig() {
    return Boolean(settings.server) && settings.token.length >= 20;
  }
  function providerLabel() {
    return 'gemini · server';
  }

  /* ---------------------------- HTTP ------------------------------- */

  function httpJson(method, path, body) {
    const url = `${settings.server}${path}`;
    const headers = {
      'content-type': 'application/json',
      'x-presence-token': settings.token
    };
    const payload = body === undefined ? undefined : JSON.stringify(body);

    if (gm) {
      return new Promise((resolve, reject) => {
        try {
          gm({
            method,
            url,
            headers,
            data: payload,
            timeout: 30_000,
            onload: (response) => {
              let data = {};
              try {
                data = response.responseText ? JSON.parse(response.responseText) : {};
              } catch {
                /* ignore */
              }
              if (response.status >= 200 && response.status < 300) resolve(data);
              else
                reject(
                  Object.assign(new Error(data.error || `HTTP ${response.status}`), {
                    status: response.status,
                    data
                  })
                );
            },
            onerror: () => reject(new Error('Сервер недоступен')),
            ontimeout: () => reject(new Error('Таймаут сервера'))
          });
        } catch (err) {
          reject(err);
        }
      });
    }

    return fetch(url, { method, headers, body: payload }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw Object.assign(new Error(data.error || `HTTP ${response.status}`), {
          status: response.status,
          data
        });
      }
      return data;
    });
  }

  function postPresence(kind, detail) {
    if (!hasConfig()) return;
    httpJson('POST', '/api/events', {
      events: [
        {
          sessionId,
          ts: Date.now(),
          kind,
          source: 'userscript-public',
          detail: detail === undefined ? null : detail
        }
      ]
    }).catch(() => {});
  }

  /* -------------------------- presence ----------------------------- */

  let away = false;
  let awaySince = null;

  function go(reason) {
    if (away) return;
    away = true;
    awaySince = Date.now();
    postPresence('away_start', { reason });
  }
  function back(reason) {
    if (!away) return;
    const ms = Math.max(0, Date.now() - awaySince);
    away = false;
    awaySince = null;
    postPresence('away_end', { reason, ms });
  }

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') go('tab_hidden');
    else back('tab_visible');
  });
  win.addEventListener('blur', () => {
    const active = doc.activeElement;
    if (active && active.tagName === 'IFRAME') return;
    go('window_blur');
  });
  win.addEventListener('focus', () => back('window_focus'));
  win.addEventListener('pagehide', () => back('pagehide'));
  win.addEventListener('pageshow', () => {
    if (doc.visibilityState === 'hidden') go('pageshow_hidden');
    else back('pageshow_visible');
  });
  win.setInterval(() => postPresence('heartbeat', { away }), HEARTBEAT_MS);

  /* --------------------------- styles ------------------------------ */

  const CSS = `
#pai-trigger,#pai-settings-zone{position:fixed;width:44px;height:44px;border-radius:50%;opacity:0;pointer-events:auto;z-index:2147483000;touch-action:manipulation;-webkit-tap-highlight-color:transparent;background:transparent;border:0;padding:0;margin:0;outline:none;user-select:none}
#pai-trigger{left:12px;bottom:calc(12px + env(safe-area-inset-bottom))}
#pai-settings-zone{top:calc(12px + env(safe-area-inset-top));right:12px}
#pai-trigger.pai-moving{opacity:.6;border:1px solid #fff}
#pai-sheet{position:fixed;inset:0;z-index:2147483100;background:#111;color:#fff;display:flex;flex-direction:column;border-radius:20px 20px 0 0;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
#pai-sheet[hidden]{display:none}
.pai-scroll{flex:1;overflow-y:auto;padding:20px 20px 8px}
.pai-title{font-size:22px;font-weight:700;margin:0 0 22px}
.pai-section{margin-bottom:20px}
.pai-label{display:block;font-size:11px;letter-spacing:1px;color:#8a8a8a;text-transform:uppercase;margin-bottom:8px}
.pai-input{width:100%;height:52px;background:#1c1c1e;border:1px solid transparent;border-radius:12px;color:#fff;font-size:15px;padding:0 14px;outline:none;box-sizing:border-box}
.pai-input.pai-bad{border-color:#ff453a}
.pai-hint{color:#8a8a8a;font-size:12px;margin-top:6px;line-height:1.35}
.pai-error{color:#ff453a;font-size:12px;margin-top:6px}
.pai-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pai-card{height:76px;background:#1c1c1e;border:2px solid transparent;border-radius:14px;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-family:inherit;font-size:14px;cursor:pointer}
.pai-card small{color:#8a8a8a;font-size:11px}
.pai-card.pai-on{border-color:#fff}
.pai-pills{display:flex;gap:8px}
.pai-pill{flex:1;height:38px;border-radius:999px;background:#1c1c1e;border:1px solid #2c2c2e;color:#8a8a8a;font-family:inherit;font-size:12px;cursor:pointer}
.pai-pill.pai-on{background:#fff;color:#000;border-color:#fff;font-weight:600}
.pai-actions{display:flex;gap:10px;padding:12px 20px calc(12px + env(safe-area-inset-bottom));background:#111}
.pai-btn{flex:1;height:50px;border-radius:12px;border:0;font-family:inherit;font-size:14px;cursor:pointer}
.pai-close{background:#2c2c2e;color:#fff}
.pai-save{background:#fff;color:#000;font-weight:600}
.pai-answer{position:fixed;z-index:2147482900;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-sizing:border-box;pointer-events:none}
.pai-answer>*{pointer-events:auto}
.pai-glass{left:0;right:0;bottom:0;padding:18px 20px calc(18px + env(safe-area-inset-bottom));background:rgba(20,20,22,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:20px 20px 0 0}
.pai-cardstyle{left:50%;top:50%;transform:translate(-50%,-50%);width:min(340px,88vw);background:#1c1c1e;border-radius:16px;padding:18px}
.pai-toast{left:12px;right:12px;bottom:calc(70px + env(safe-area-inset-bottom));background:#1c1c1e;border-radius:12px;padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
.pai-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:10px}
.pai-head b{font-size:15px}
.pai-head span{font-size:11px;color:#8a8a8a}
.pai-value{font-size:20px;font-weight:700;margin:0 0 6px}
.pai-reason{font-size:13px;color:#b8b8b8;margin:0;line-height:1.4}
.pai-text{font-size:16px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
.pai-act{display:flex;gap:10px;margin-top:14px}
.pai-act button{flex:1;height:44px;border-radius:10px;border:0;background:#2c2c2e;color:#fff;font-family:inherit;font-size:14px;cursor:pointer}
.pai-act button.pai-primary{background:#fff;color:#000;font-weight:600}
.pai-skeleton i{display:block;height:12px;border-radius:6px;background:#2c2c2e;margin-bottom:10px;animation:pai-pulse 1.2s infinite}
.pai-skeleton i:nth-child(2){width:80%}.pai-skeleton i:nth-child(3){width:60%}
@keyframes pai-pulse{0%,100%{opacity:.45}50%{opacity:1}}
.pai-err{color:#ff453a;font-size:14px;line-height:1.4}
.pai-manual{width:100%;min-height:96px;background:#1c1c1e;color:#fff;border:1px solid #2c2c2e;border-radius:10px;padding:10px;font-family:inherit;font-size:14px;box-sizing:border-box}
`;
  function injectCss() {
    if (doc.getElementById('pai-public-css')) return;
    const style = doc.createElement('style');
    style.id = 'pai-public-css';
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function el(tag, cls, text) {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  /* ------------------------ trigger/sheet -------------------------- */

  let trigger = null;
  let settingsZone = null;
  let sheet = null;
  let answerEl = null;
  let toastTimer = null;
  let observer = null;
  let reattachTimer = null;
  let lastReattach = 0;
  let draft = null;

  function applyPosition() {
    if (!trigger) return;
    trigger.style.left = `${settings.posLeft}px`;
    trigger.style.bottom = `calc(${settings.posBottom}px + env(safe-area-inset-bottom))`;
  }
  function applyStealth() {
    if (!trigger) return;
    trigger.style.display = settings.stealth === 'hard' && !isTestPage() ? 'none' : '';
  }

  function attach() {
    const host = doc.body || doc.documentElement;
    if (!host) return;
    if (trigger && !trigger.isConnected) host.appendChild(trigger);
    if (settingsZone && !settingsZone.isConnected) host.appendChild(settingsZone);
    if (sheet && !sheet.hidden && !sheet.isConnected) host.appendChild(sheet);
    if (answerEl && !answerEl.isConnected) host.appendChild(answerEl);
    applyStealth();
  }

  function scheduleAttach() {
    if (!doc.body) return;
    if (reattachTimer) return;
    const wait = Math.max(0, REATTACH_MS - (Date.now() - lastReattach));
    reattachTimer = win.setTimeout(() => {
      reattachTimer = null;
      lastReattach = Date.now();
      attach();
    }, wait);
  }

  function buildSheet() {
    sheet = el('div');
    sheet.id = 'pai-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="pai-scroll">
        <div class="pai-title">⚡ Naurok AI</div>
        <div class="pai-section">
          <label class="pai-label" for="pai-server">СЕРВЕР</label>
          <input id="pai-server" class="pai-input" type="url" placeholder="https://your-server.example" spellcheck="false">
          <div class="pai-error" id="pai-server-error" hidden>Адрес должен начинаться с http:// или https://</div>
        </div>
        <div class="pai-section">
          <label class="pai-label" for="pai-token">ТОКЕН</label>
          <input id="pai-token" class="pai-input" type="password" placeholder="pai_…" autocomplete="off" spellcheck="false">
          <div class="pai-hint">Создай токен в панели сервера → «Токены». Он даёт доступ только к твоим данным.</div>
          <div class="pai-error" id="pai-token-error" hidden>Токен слишком короткий</div>
        </div>
        <div class="pai-section">
          <div class="pai-label">СКОРОСТЬ</div>
          <div class="pai-cards">
            <button type="button" class="pai-card" data-speed="fast">⚡ Быстро<small>~1–2 сек</small></button>
            <button type="button" class="pai-card" data-speed="accurate">🎯 Точно<small>~3–5 сек</small></button>
          </div>
        </div>
        <div class="pai-section">
          <div class="pai-label">СТИЛЬ ОТВЕТА</div>
          <div class="pai-cards">
            <button type="button" class="pai-card" data-style="glass">🪟 Glass<small>снизу</small></button>
            <button type="button" class="pai-card" data-style="card">🌑 Card<small>по центру</small></button>
            <button type="button" class="pai-card" data-style="toast">🍞 Toast<small>4 сек</small></button>
            <button type="button" class="pai-card" data-style="alert">🔔 Alert<small>системный</small></button>
          </div>
        </div>
        <div class="pai-section">
          <div class="pai-label">РЕЖИМ</div>
          <div class="pai-pills">
            <button type="button" class="pai-pill" data-stealth="off">off</button>
            <button type="button" class="pai-pill" data-stealth="soft">soft</button>
            <button type="button" class="pai-pill" data-stealth="hard">hard</button>
          </div>
        </div>
        <div class="pai-hint" id="pai-status"></div>
      </div>
      <div class="pai-actions">
        <button type="button" class="pai-btn pai-close" id="pai-cancel">Закрыть</button>
        <button type="button" class="pai-btn" id="pai-check" style="flex:.8">Проверить</button>
        <button type="button" class="pai-btn pai-save" id="pai-save">Сохранить</button>
      </div>`;
    sheet.querySelector('#pai-cancel').addEventListener('click', closeSheet);
    sheet.querySelector('#pai-check').addEventListener('click', testConnection);
    sheet.querySelector('#pai-save').addEventListener('click', saveSheet);
    sheet.querySelectorAll('[data-speed]').forEach((button) =>
      button.addEventListener('click', () => {
        draft.speed = button.dataset.speed;
        mark('speed', draft.speed);
      })
    );
    sheet.querySelectorAll('[data-style]').forEach((button) =>
      button.addEventListener('click', () => {
        draft.style = button.dataset.style;
        mark('style', draft.style);
      })
    );
    sheet.querySelectorAll('[data-stealth]').forEach((button) =>
      button.addEventListener('click', () => {
        draft.stealth = button.dataset.stealth;
        mark('stealth', draft.stealth);
      })
    );
  }

  function mark(kind, value) {
    const selector =
      kind === 'speed' ? '[data-speed]' : kind === 'style' ? '[data-style]' : '[data-stealth]';
    sheet.querySelectorAll(selector).forEach((button) => {
      const attr = kind === 'speed' ? 'speed' : kind === 'style' ? 'style' : 'stealth';
      button.classList.toggle('pai-on', button.dataset[attr] === value);
    });
  }

  function openSheet() {
    injectCss();
    if (!sheet) buildSheet();
    draft = { server: settings.server, token: settings.token, speed: settings.speed, style: settings.style, stealth: settings.stealth };
    sheet.querySelector('#pai-server').value = settings.server;
    sheet.querySelector('#pai-token').value = settings.token;
    sheet.querySelector('#pai-server-error').hidden = true;
    sheet.querySelector('#pai-token-error').hidden = true;
    sheet.querySelector('#pai-status').textContent = '';
    mark('speed', draft.speed);
    mark('style', draft.style);
    mark('stealth', draft.stealth);
    const host = doc.body || doc.documentElement;
    if (sheet.parentNode !== host) host.appendChild(sheet);
    sheet.hidden = false;
    attach();
  }

  function closeSheet() {
    if (sheet) sheet.hidden = true;
  }

  function saveSheet() {
    const server = sheet.querySelector('#pai-server').value.trim().replace(/\/+$/, '');
    const token = sheet.querySelector('#pai-token').value.trim();
    let bad = false;
    if (!/^https?:\/\//.test(server)) {
      sheet.querySelector('#pai-server-error').hidden = false;
      sheet.querySelector('#pai-server').classList.add('pai-bad');
      bad = true;
    }
    if (token.length < 20) {
      sheet.querySelector('#pai-token-error').hidden = false;
      sheet.querySelector('#pai-token').classList.add('pai-bad');
      bad = true;
    }
    if (bad) return;

    settings = { ...settings, server, token, speed: draft.speed, style: draft.style, stealth: draft.stealth };
    for (const name of Object.keys(DEFAULTS)) storageSet(name, settings[name]);
    closeSheet();
    applyPosition();
    applyStealth();
    postPresence('hook_state', { attached: true, href: win.location.href });
  }

  async function testConnection() {
    const status = sheet.querySelector('#pai-status');
    const server = sheet.querySelector('#pai-server').value.trim().replace(/\/+$/, '');
    const token = sheet.querySelector('#pai-token').value.trim();
    if (!/^https?:\/\//.test(server) || token.length < 20) {
      status.textContent = 'Заполни сервер и токен.';
      return;
    }
    const previous = { server: settings.server, token: settings.token };
    settings.server = server;
    settings.token = token;
    status.textContent = 'Проверяю…';
    try {
      const data = await httpJson('GET', '/api/ai/runs');
      status.textContent = `Связь есть. Осталось AI: ${data.usage?.remaining ?? '?'}/${data.usage?.limit ?? '?'}`;
    } catch (err) {
      status.textContent = `Ошибка: ${err.message}`;
    } finally {
      settings.server = previous.server;
      settings.token = previous.token;
    }
  }

  function onTriggerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const sx = event.clientX;
    const sy = event.clientY;
    const baseLeft = settings.posLeft;
    const baseBottom = settings.posBottom;
    let long = false;
    let moved = false;
    const timer = win.setTimeout(() => {
      long = true;
      trigger.classList.add('pai-moving');
    }, LONG_PRESS_MS);
    const move = (ev) => {
      if (!long) {
        if (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10) win.clearTimeout(timer);
        return;
      }
      moved = true;
      settings.posLeft = Math.round(clamp(baseLeft + ev.clientX - sx, 0, win.innerWidth - 44));
      settings.posBottom = Math.round(clamp(baseBottom - (ev.clientY - sy), 0, win.innerHeight - 44));
      applyPosition();
    };
    const finish = () => {
      win.clearTimeout(timer);
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', finish);
      doc.removeEventListener('pointercancel', finish);
      trigger.classList.remove('pai-moving');
      if (long) {
        storageSet('posLeft', settings.posLeft);
        storageSet('posBottom', settings.posBottom);
        return;
      }
      if (!moved) {
        if (isTestPage() && hasConfig()) askCurrent();
        else openSheet();
      }
    };
    doc.addEventListener('pointermove', move, { passive: true });
    doc.addEventListener('pointerup', finish);
    doc.addEventListener('pointercancel', finish);
  }

  function mount() {
    injectCss();
    if (!trigger) {
      trigger = el('button');
      trigger.id = 'pai-trigger';
      trigger.type = 'button';
      trigger.setAttribute('aria-label', 'Naurok AI');
      trigger.addEventListener('pointerdown', onTriggerDown);
      trigger.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    if (!settingsZone) {
      settingsZone = el('button');
      settingsZone.id = 'pai-settings-zone';
      settingsZone.type = 'button';
      settingsZone.addEventListener('pointerup', (e) => {
        e.preventDefault();
        openSheet();
      });
    }
    attach();
    applyPosition();
    if (!observer && doc.body && typeof win.MutationObserver === 'function') {
      observer = new win.MutationObserver(scheduleAttach);
      observer.observe(doc.body, { childList: true, subtree: true });
    }
  }

  /* --------------------------- context ----------------------------- */

  function textOf(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function collectContext() {
    const candidates = [];
    for (const node of doc.querySelectorAll('label, li, button, [role="button"], a, [class*="answer"], [class*="variant"], [class*="option"]')) {
      if (node.closest('#pai-trigger,#pai-settings-zone,#pai-sheet,.pai-answer')) continue;
      if (node.closest('[hidden]')) continue;
      const text = textOf(node);
      if (!text || text.length > 300) continue;
      if (!node.parentElement) continue;
      candidates.push({ text, parent: node.parentElement });
    }
    const groups = new Map();
    for (const item of candidates) {
      if (!groups.has(item.parent)) groups.set(item.parent, []);
      groups.get(item.parent).push(item);
    }
    let best = null;
    for (const [parent, items] of groups) {
      const texts = [...new Set(items.map((i) => i.text))];
      if (texts.length < 2 || texts.length > 10) continue;
      let question = '';
      let node = parent;
      for (let depth = 0; depth < 6 && node; depth += 1, node = node.parentElement) {
        let value = textOf(node);
        for (const option of texts) value = value.split(option).join(' ');
        value = value.replace(/\s+/g, ' ').trim();
        if (value.length >= 10) {
          question = value.slice(0, 1200);
          break;
        }
      }
      if (!question) continue;
      let score = texts.length + Math.min(10, Math.floor(question.length / 20));
      if (parent.tagName === 'UL' || parent.tagName === 'OL') score += 5;
      if (!best || score > best.score) best = { question, options: texts.slice(0, 8), score };
    }
    if (best) return best;
    for (const selector of ['[class*="question"]', '[class*="task"]', 'h1', 'h2', 'h3']) {
      for (const node of doc.querySelectorAll(selector)) {
        if (node.closest('#pai-sheet')) continue;
        const value = textOf(node);
        if (value.length >= 10 && value.length <= 1200) return { question: value, options: [], score: 0 };
      }
    }
    return { question: '', options: [] };
  }

  /* --------------------------- answer ------------------------------ */

  function clearAnswer() {
    if (toastTimer) {
      win.clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (answerEl) {
      answerEl.remove();
      answerEl = null;
    }
  }

  function answerMarkup(text) {
    const lines = String(text || '').trim().split('\n').map((line) => line.trim()).filter(Boolean);
    const index = lines.findIndex((line) => /^відповідь\s*:/i.test(line));
    if (index !== -1) {
      const value = lines[index].replace(/^відповідь\s*:\s*/i, '');
      const reason = lines.filter((_, i) => i !== index).join(' ');
      return `<p class="pai-value">${esc(value)}</p>${reason ? `<p class="pai-reason">${esc(reason)}</p>` : ''}`;
    }
    return `<div class="pai-text">${esc(text)}</div>`;
  }

  function addButton(parent, label, primary, onClick) {
    const button = el('button', primary ? 'pai-primary' : '', label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    parent.appendChild(button);
  }

  function renderAnswer(options = {}) {
    const style = options.style || settings.style;
    clearAnswer();
    if (style === 'alert') {
      if (!options.loading) win.alert(options.error ? `Ошибка: ${options.error}` : options.text || '');
      return;
    }
    const box = el('div', `pai-answer ${{ glass: 'pai-glass', card: 'pai-cardstyle', toast: 'pai-toast' }[style]}`);
    box.innerHTML = `<div class="pai-head"><b>⚡ Naurok AI</b><span>${esc(options.provider || providerLabel())}</span></div><div class="pai-body"></div><div class="pai-act"></div>`;
    const body = box.querySelector('.pai-body');
    const actions = box.querySelector('.pai-act');
    if (options.loading) {
      body.innerHTML = '<div class="pai-skeleton"><i></i><i></i><i></i></div>';
      addButton(actions, 'Закрыть', false, clearAnswer);
    } else if (options.error) {
      body.innerHTML = `<div class="pai-err">${esc(options.error)}</div>`;
      addButton(actions, 'Повторить', true, () => options.onRetry?.());
      addButton(actions, 'Закрыть', false, clearAnswer);
    } else {
      body.innerHTML = answerMarkup(options.text);
      addButton(actions, 'Копировать', true, () => {
        if (win.navigator?.clipboard) win.navigator.clipboard.writeText(String(options.text || '')).catch(() => {});
      });
      addButton(actions, 'Закрыть', false, clearAnswer);
    }
    (doc.body || doc.documentElement).appendChild(box);
    answerEl = box;
    if (style === 'toast') {
      toastTimer = win.setTimeout(() => {
        if (answerEl === box) clearAnswer();
      }, TOAST_MS);
    }
  }

  function manualPanel() {
    clearAnswer();
    const box = el('div', 'pai-answer pai-cardstyle');
    box.innerHTML = `<div class="pai-head"><b>⚡ Naurok AI</b><span>${esc(providerLabel())}</span></div><textarea class="pai-manual" placeholder="Не нашёл вопрос. Введи его вручную…"></textarea><div class="pai-act"></div>`;
    const area = box.querySelector('textarea');
    const actions = box.querySelector('.pai-act');
    addButton(actions, 'Спросить', true, () => {
      const value = area.value.trim();
      if (value) askCurrent(value);
    });
    addButton(actions, 'Закрыть', false, clearAnswer);
    (doc.body || doc.documentElement).appendChild(box);
    answerEl = box;
  }

  async function askCurrent(manual) {
    if (!hasConfig()) {
      openSheet();
      return;
    }
    const context = manual === undefined ? collectContext() : { question: String(manual), options: [] };
    if (!context.question) {
      manualPanel();
      return;
    }
    renderAnswer({ loading: true });
    try {
      const data = await httpJson('POST', '/api/ai/answer', {
        question: context.question,
        options: context.options,
        speed: settings.speed
      });
      renderAnswer({ text: data.text, provider: `${data.provider} · ${data.model}` });
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        renderAnswer({ error: 'Токен недействителен. Открой настройки и вставь новый.', onRetry: () => openSheet() });
      } else if (err.status === 429) {
        renderAnswer({ error: err.message || 'Лимит AI исчерпан', onRetry: () => askCurrent(manual) });
      } else {
        renderAnswer({ error: err.message || 'Ошибка сервера', onRetry: () => askCurrent(manual) });
      }
    }
  }

  /* ---------------------------- start ------------------------------ */

  postPresence('session_start', { url: win.location.href });
  if (doc.visibilityState === 'hidden') go('initial_hidden');
  ready = true;
  void ready;

  const boot = () => mount();
  if (doc.body) boot();
  else {
    doc.addEventListener('DOMContentLoaded', boot, { once: true });
    win.setTimeout(boot, 0);
  }

  if (win.__PAI_TEST__ === true) {
    win.__PAI__ = {
      get settings() {
        return settings;
      },
      openSettings: openSheet,
      closeSettings: closeSheet,
      isSettingsOpen: () => Boolean(sheet && !sheet.hidden && sheet.isConnected),
      trigger: () => trigger,
      settingsZone: () => settingsZone,
      ask: (question) => askCurrent(question),
      renderAnswer
    };
  }
})();
