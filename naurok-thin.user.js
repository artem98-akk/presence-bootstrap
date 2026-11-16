// ==UserScript==
// @name         Naurok AI — Safari
// @namespace    presence
// @version      3.3.0
// @description  Присутствие + AI-ответы по тапу: невидимые зоны, настройки, четыре стиля
// @match        *://naurok.com.ua/*
// @match        *://naurok.ua/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// @connect      192.168.0.101
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';
  if (window.__PAI_AI_LOADED__) return;
  window.__PAI_AI_LOADED__ = true;
  document.querySelectorAll('#nk,#nk-sheet,#nk-answer').forEach((n) => n.remove());

  const win = window;
  const doc = document;

  /* ------------------------------------------------------------------ */
  /* Константы и настройки по умолчанию                                  */
  /* ------------------------------------------------------------------ */

  const SERVER = 'http://192.168.0.101:8787';
  const TOKEN = 'dev-token';
  const HEARTBEAT_MS = 15000;

  const PREFIX = 'pai_';
  const Z_TRIGGER = 2147483000;
  const Z_ANSWER = 2147482900;
  const Z_SHEET = 2147483100;

  const LONG_PRESS_MS = 500;
  const TOAST_MS = 4000;
  const REATTACH_MS = 300;
  const MIN_KEY_LENGTH = 20;

  const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];

  const SPEEDS = {
    fast: { temperature: 0.1, maxOutputTokens: 800 },
    accurate: { temperature: 0.3, maxOutputTokens: 2000 }
  };

  const SPEED_CARDS = [
    { id: 'fast', emoji: '⚡', title: 'Швидкий', sub: '~1-2 сек' },
    { id: 'accurate', emoji: '🎯', title: 'Точний', sub: '~3-5 сек' }
  ];

  const STYLE_CARDS = [
    { id: 'glass', emoji: '🪟', title: 'Glass', sub: 'знизу екрану' },
    { id: 'card', emoji: '🌑', title: 'Dark card', sub: 'по центру' },
    { id: 'toast', emoji: '🍞', title: 'Toast', sub: 'автозникає 4с' },
    { id: 'alert', emoji: '🔔', title: 'Alert', sub: 'системний' }
  ];

  const STEALTH_MODES = ['off', 'soft', 'hard'];

  const DEFAULTS = {
    key: '',
    model: MODELS[0],
    speed: 'fast',
    style: 'glass',
    stealth: 'soft',
    posLeft: 12,
    posBottom: 12
  };

  /* ------------------------------------------------------------------ */
  /* Хранилище: GM_* или localStorage с префиксом pai_                   */
  /* ------------------------------------------------------------------ */

  function storageGet(name, fallback) {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(name, fallback);
    } catch {
      /* ignore */
    }
    try {
      const raw = win.localStorage.getItem(PREFIX + name);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function storageSet(name, value) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(name, value);
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      win.localStorage.setItem(PREFIX + name, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  function sanitize(name, value) {
    switch (name) {
      case 'model':
        return MODELS.includes(value) ? value : DEFAULTS.model;
      case 'speed':
        return value === 'accurate' || value === 'fast' ? value : DEFAULTS.speed;
      case 'style':
        return STYLE_CARDS.some((card) => card.id === value) ? value : DEFAULTS.style;
      case 'stealth':
        return STEALTH_MODES.includes(value) ? value : DEFAULTS.stealth;
      case 'posLeft':
      case 'posBottom': {
        const n = Number(value);
        return Number.isFinite(n) ? Math.max(0, Math.round(n)) : DEFAULTS[name];
      }
      case 'key':
        return typeof value === 'string' ? value : '';
      default:
        return value;
    }
  }

  function loadSettings() {
    const loaded = {};
    for (const name of Object.keys(DEFAULTS)) {
      loaded[name] = sanitize(name, storageGet(name, DEFAULTS[name]));
    }
    return loaded;
  }

  let settings = loadSettings();

  /* ------------------------------------------------------------------ */
  /* Presence-трекинг (без видимой плашки)                               */
  /* ------------------------------------------------------------------ */

  const gmRequest = globalThis.GM?.xmlHttpRequest ?? globalThis.GM_xmlhttpRequest;
  const newId = () =>
    globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const sessionId = newId();
  let away = false;
  let awaySince = null;
  let exits = 0;
  let totalMs = 0;

  function post(kind, detail) {
    const payload = JSON.stringify({
      events: [
        {
          sessionId,
          ts: Date.now(),
          kind,
          source: 'userscript',
          detail: detail === undefined ? null : detail
        }
      ]
    });
    const headers = { 'content-type': 'application/json', 'x-presence-token': TOKEN };

    try {
      if (gmRequest) {
        gmRequest({ method: 'POST', url: `${SERVER}/api/events`, data: payload, headers });
      } else {
        fetch(`${SERVER}/api/events`, { method: 'POST', body: payload, headers }).catch(() => {});
      }
    } catch {
      /* сеть недоступна — сервер обрежет интервал по таймауту */
    }
  }

  function go(reason) {
    if (away) return;
    away = true;
    awaySince = Date.now();
    exits += 1;
    post('away_start', { reason });
  }

  function back(reason) {
    if (!away) return;
    const ms = Math.max(0, Date.now() - awaySince);
    away = false;
    awaySince = null;
    totalMs += ms;
    post('away_end', { reason, ms });
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

  win.setInterval(() => post('heartbeat', { away }), HEARTBEAT_MS);

  /* ------------------------------------------------------------------ */
  /* Стили                                                               */
  /* ------------------------------------------------------------------ */

  const CSS = `
#pai-trigger, #pai-settings-zone {
  position: fixed; width: 44px; height: 44px; border-radius: 50%;
  opacity: 0; pointer-events: auto; z-index: ${Z_TRIGGER};
  touch-action: manipulation; -webkit-tap-highlight-color: transparent;
  background: transparent; border: 0; padding: 0; margin: 0;
  outline: none; -webkit-user-select: none; user-select: none;
}
#pai-trigger { left: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); }
#pai-settings-zone { top: calc(12px + env(safe-area-inset-top)); right: 12px; }
#pai-trigger.pai-moving {
  opacity: .6; border: 1px solid #fff;
}
#pai-sheet {
  position: fixed; inset: 0; z-index: ${Z_SHEET};
  display: flex; flex-direction: column;
  background: #111; color: #fff; border-radius: 20px 20px 0 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
#pai-sheet[hidden] { display: none; }
.pai-sheet-scroll {
  flex: 1 1 auto; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: 20px 20px 8px;
}
.pai-sheet-title {
  font-size: 22px; line-height: 1.2; font-weight: 700; color: #fff;
  margin: 0 0 24px; text-align: left;
}
.pai-section { margin-bottom: 22px; }
.pai-label {
  display: block; font-size: 11px; line-height: 1.2; letter-spacing: 1px;
  color: #8a8a8a; text-transform: uppercase; margin: 0 0 8px;
}
.pai-field-wrap { position: relative; }
.pai-input, .pai-select {
  display: block; width: 100%; height: 52px; box-sizing: border-box;
  background: #1c1c1e; border: 1px solid transparent; border-radius: 12px;
  color: #fff; font-size: 15px; padding: 0 46px 0 14px; outline: none;
  -webkit-appearance: none; appearance: none;
}
.pai-select { padding-right: 36px; background-image: linear-gradient(45deg, transparent 50%, #8a8a8a 50%), linear-gradient(135deg, #8a8a8a 50%, transparent 50%); background-position: calc(100% - 20px) 24px, calc(100% - 14px) 24px; background-size: 6px 6px, 6px 6px; background-repeat: no-repeat; }
.pai-input.pai-invalid { border-color: #ff453a; }
.pai-eye {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  width: 36px; height: 36px; border: 0; background: transparent; color: #8a8a8a;
  font-size: 18px; line-height: 1; cursor: pointer; padding: 0;
}
.pai-error { color: #ff453a; font-size: 12px; margin-top: 6px; }
.pai-hint { color: #8a8a8a; font-size: 12px; margin-top: 6px; line-height: 1.3; }
.pai-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pai-card {
  height: 88px; box-sizing: border-box; background: #1c1c1e;
  border: 2px solid transparent; border-radius: 14px; color: #fff;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; padding: 6px; cursor: pointer; font-family: inherit;
  -webkit-appearance: none; appearance: none;
}
.pai-card.pai-selected { border-color: #fff; }
.pai-card .pai-emoji { font-size: 20px; line-height: 1.1; }
.pai-card .pai-card-title { font-size: 15px; line-height: 1.2; color: #fff; }
.pai-card .pai-card-sub { font-size: 12px; line-height: 1.2; color: #8a8a8a; }
.pai-pills { display: flex; gap: 8px; }
.pai-pill {
  flex: 1 1 0; height: 40px; border-radius: 999px; background: #1c1c1e;
  border: 1px solid #2c2c2e; color: #8a8a8a; font-size: 13px; cursor: pointer;
  font-family: inherit; -webkit-appearance: none; appearance: none;
}
.pai-pill.pai-selected { background: #fff; color: #000; border-color: #fff; font-weight: 600; }
.pai-actions {
  position: sticky; bottom: 0; display: flex; gap: 12px; flex: 0 0 auto;
  padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
  background: #111;
}
.pai-btn {
  flex: 1 1 0; height: 52px; border-radius: 12px; border: 0;
  font-size: 15px; font-family: inherit; cursor: pointer;
  -webkit-appearance: none; appearance: none;
}
.pai-btn-close { background: #2c2c2e; color: #fff; }
.pai-btn-save { background: #fff; color: #000; font-weight: 600; }

.pai-answer {
  position: fixed; z-index: ${Z_ANSWER}; box-sizing: border-box; color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  pointer-events: none;
}
.pai-answer > * { pointer-events: auto; }
.pai-style-glass {
  left: 0; right: 0; bottom: 0;
  padding: 18px 20px calc(18px + env(safe-area-inset-bottom));
  background: rgba(20, 20, 22, .72); border-radius: 20px 20px 0 0;
  -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
}
.pai-style-card {
  left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(340px, 88vw); background: #1c1c1e; border-radius: 16px; padding: 18px;
}
.pai-style-toast {
  left: 12px; right: 12px; bottom: calc(70px + env(safe-area-inset-bottom));
  background: #1c1c1e; border-radius: 12px; padding: 14px 16px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, .5);
}
.pai-answer-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; margin-bottom: 10px;
}
.pai-answer-title { font-size: 15px; font-weight: 700; }
.pai-answer-provider { font-size: 11px; color: #8a8a8a; }
.pai-answer-value { font-size: 20px; font-weight: 700; margin: 0 0 6px; }
.pai-answer-reason { font-size: 13px; color: #b8b8b8; margin: 0; line-height: 1.4; }
.pai-answer-text { font-size: 16px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.pai-answer-actions { display: flex; gap: 10px; margin-top: 14px; }
.pai-style-glass .pai-answer-actions { padding-left: 52px; }
.pai-answer-btn {
  flex: 1 1 0; height: 44px; border-radius: 10px; border: 0;
  background: #2c2c2e; color: #fff; font-size: 14px; font-family: inherit; cursor: pointer;
  -webkit-appearance: none; appearance: none;
}
.pai-answer-btn.pai-primary { background: #fff; color: #000; font-weight: 600; }
.pai-skeleton { display: flex; flex-direction: column; gap: 10px; }
.pai-skeleton i {
  display: block; height: 12px; border-radius: 6px; background: #2c2c2e;
  animation: pai-pulse 1.2s ease-in-out infinite;
}
.pai-skeleton i:nth-child(2) { width: 80%; }
.pai-skeleton i:nth-child(3) { width: 60%; }
@keyframes pai-pulse { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
.pai-error-text { color: #ff453a; font-size: 14px; line-height: 1.4; }
.pai-manual {
  width: 100%; min-height: 96px; box-sizing: border-box; resize: vertical;
  background: #1c1c1e; color: #fff; border: 1px solid #2c2c2e; border-radius: 10px;
  padding: 10px; font-size: 14px; font-family: inherit; outline: none;
}
`;

  function injectStyles() {
    if (doc.getElementById('pai-styles')) return;
    const style = doc.createElement('style');
    style.id = 'pai-styles';
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  /* ------------------------------------------------------------------ */
  /* DOM-помощники                                                       */
  /* ------------------------------------------------------------------ */

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function isOurNode(node) {
    return Boolean(
      node &&
        node.closest &&
        node.closest('#pai-trigger, #pai-settings-zone, #pai-sheet, #pai-styles, .pai-answer')
    );
  }

  function isTestPage() {
    return /\/test(\/|$)/.test(win.location.pathname);
  }

  function hasKey() {
    return String(settings.key || '').trim().length >= MIN_KEY_LENGTH;
  }

  function providerLabel() {
    return `gemini · ${settings.model}`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /* ------------------------------------------------------------------ */
  /* Триггер и зона настроек                                             */
  /* ------------------------------------------------------------------ */

  let trigger = null;
  let settingsZone = null;
  let observer = null;
  let lastReattach = 0;
  let reattachTimer = null;

  function applyPosition() {
    if (!trigger) return;
    trigger.style.left = `${settings.posLeft}px`;
    trigger.style.bottom = `calc(${settings.posBottom}px + env(safe-area-inset-bottom))`;
  }

  function attachZones() {
    const host = doc.body || doc.documentElement;
    if (!host) return;
    if (trigger && !trigger.isConnected) host.appendChild(trigger);
    if (settingsZone && !settingsZone.isConnected) host.appendChild(settingsZone);
    if (sheet && !sheet.hidden && !sheet.isConnected) host.appendChild(sheet);
    if (answerEl && !answerEl.isConnected) host.appendChild(answerEl);
    applyStealth();
  }

  function scheduleReattach() {
    if (!doc.body) return;
    const now = Date.now();
    if (reattachTimer) return;
    const wait = Math.max(0, REATTACH_MS - (now - lastReattach));
    reattachTimer = win.setTimeout(() => {
      reattachTimer = null;
      lastReattach = Date.now();
      attachZones();
    }, wait);
  }

  function startObserver() {
    if (observer || !doc.body || typeof win.MutationObserver !== 'function') return;
    observer = new win.MutationObserver(() => scheduleReattach());
    observer.observe(doc.body, { childList: true, subtree: true });
  }

  function mount() {
    injectStyles();
    if (!trigger) {
      trigger = el('button', '');
      trigger.id = 'pai-trigger';
      trigger.type = 'button';
      trigger.setAttribute('aria-label', 'Naurok AI');
      trigger.addEventListener('pointerdown', onTriggerPointerDown);
      trigger.addEventListener('contextmenu', (event) => event.preventDefault());
    }
    if (!settingsZone) {
      settingsZone = el('button', '');
      settingsZone.id = 'pai-settings-zone';
      settingsZone.type = 'button';
      settingsZone.setAttribute('aria-label', 'Налаштування Naurok AI');
      settingsZone.addEventListener('pointerup', (event) => {
        event.preventDefault();
        openSheet();
      });
    }
    attachZones();
    applyPosition();
    startObserver();
  }

  function onTriggerPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const baseLeft = settings.posLeft;
    const baseBottom = settings.posBottom;
    let longPressed = false;
    let moved = false;
    let longTimer = null;

    longTimer = win.setTimeout(() => {
      longPressed = true;
      trigger.classList.add('pai-moving');
    }, LONG_PRESS_MS);

    const onMove = (moveEvent) => {
      if (!longPressed) {
        if (Math.abs(moveEvent.clientX - startX) > 10 || Math.abs(moveEvent.clientY - startY) > 10) {
          win.clearTimeout(longTimer);
        }
        return;
      }
      moved = true;
      const left = clamp(baseLeft + (moveEvent.clientX - startX), 0, win.innerWidth - 44);
      const bottom = clamp(baseBottom - (moveEvent.clientY - startY), 0, win.innerHeight - 44);
      settings.posLeft = Math.round(left);
      settings.posBottom = Math.round(bottom);
      applyPosition();
    };

    const finish = () => {
      win.clearTimeout(longTimer);
      doc.removeEventListener('pointermove', onMove);
      doc.removeEventListener('pointerup', finish);
      doc.removeEventListener('pointercancel', finish);
      trigger.classList.remove('pai-moving');

      if (longPressed) {
        storageSet('posLeft', settings.posLeft);
        storageSet('posBottom', settings.posBottom);
        return;
      }
      if (!moved) handleTriggerTap();
    };

    doc.addEventListener('pointermove', onMove, { passive: true });
    doc.addEventListener('pointerup', finish);
    doc.addEventListener('pointercancel', finish);
  }

  function handleTriggerTap() {
    if (isTestPage() && hasKey()) askCurrent();
    else openSheet();
  }

  /* ------------------------------------------------------------------ */
  /* Лист настроек                                                       */
  /* ------------------------------------------------------------------ */

  let sheet = null;
  let draft = null;
  let keyInput = null;
  let keyError = null;
  let eyeButton = null;

  function buildSheet() {
    sheet = el('div', '');
    sheet.id = 'pai-sheet';
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `
      <div class="pai-sheet-scroll">
        <div class="pai-sheet-title">⚡ Naurok AI</div>

        <div class="pai-section">
          <label class="pai-label" for="pai-key">API KEY</label>
          <div class="pai-field-wrap">
            <input id="pai-key" class="pai-input" type="password" placeholder="AIza…"
              autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off">
            <button type="button" class="pai-eye" id="pai-eye" aria-label="Показати ключ">👁</button>
          </div>
          <div class="pai-error" id="pai-key-error" hidden>Ключ має бути не коротшим за ${MIN_KEY_LENGTH} символів</div>
        </div>

        <div class="pai-section">
          <label class="pai-label" for="pai-model">МОДЕЛЬ</label>
          <select id="pai-model" class="pai-select">
            ${MODELS.map((model) => `<option value="${model}">${model}</option>`).join('')}
          </select>
          <div class="pai-hint">gemini-3.5-flash-lite · gemini-1.5-flash · gemini-1.5-pro</div>
        </div>

        <div class="pai-section">
          <div class="pai-label">РЕЖИМ ШВИДКОСТІ</div>
          <div class="pai-cards" id="pai-speed">
            ${SPEED_CARDS.map(
              (card) => `<button type="button" class="pai-card" data-speed="${card.id}">
                <span class="pai-emoji">${card.emoji}</span>
                <span class="pai-card-title">${card.title}</span>
                <span class="pai-card-sub">${card.sub}</span>
              </button>`
            ).join('')}
          </div>
        </div>

        <div class="pai-section">
          <div class="pai-label">СТИЛЬ ВІДПОВІДІ</div>
          <div class="pai-cards" id="pai-style">
            ${STYLE_CARDS.map(
              (card) => `<button type="button" class="pai-card" data-style="${card.id}">
                <span class="pai-emoji">${card.emoji}</span>
                <span class="pai-card-title">${card.title}</span>
                <span class="pai-card-sub">${card.sub}</span>
              </button>`
            ).join('')}
          </div>
        </div>

        <div class="pai-section">
          <div class="pai-label">РЕЖИМ</div>
          <div class="pai-pills" id="pai-stealth">
            ${STEALTH_MODES.map(
              (mode) => `<button type="button" class="pai-pill" data-stealth="${mode}">${mode}</button>`
            ).join('')}
          </div>
        </div>
      </div>

      <div class="pai-actions">
        <button type="button" class="pai-btn pai-btn-close" id="pai-cancel">Закрити</button>
        <button type="button" class="pai-btn pai-btn-save" id="pai-save">Зберегти</button>
      </div>
    `;

    keyInput = sheet.querySelector('#pai-key');
    keyError = sheet.querySelector('#pai-key-error');
    eyeButton = sheet.querySelector('#pai-eye');

    eyeButton.addEventListener('click', () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    });

    keyInput.addEventListener('input', () => {
      keyInput.classList.remove('pai-invalid');
      keyError.hidden = true;
    });

    sheet.querySelector('#pai-model').addEventListener('change', (event) => {
      draft.model = event.target.value;
    });

    sheet.querySelectorAll('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => {
        draft.speed = button.dataset.speed;
        markSelected('#pai-speed [data-speed]', 'data-speed', draft.speed);
      });
    });

    sheet.querySelectorAll('[data-style]').forEach((button) => {
      button.addEventListener('click', () => {
        draft.style = button.dataset.style;
        markSelected('#pai-style [data-style]', 'data-style', draft.style);
      });
    });

    sheet.querySelectorAll('[data-stealth]').forEach((button) => {
      button.addEventListener('click', () => {
        draft.stealth = button.dataset.stealth;
        markSelected('[data-stealth]', 'data-stealth', draft.stealth);
      });
    });

    sheet.querySelector('#pai-cancel').addEventListener('click', closeSheet);
    sheet.querySelector('#pai-save').addEventListener('click', saveFromSheet);
  }

  function markSelected(selector, attribute, value) {
    sheet.querySelectorAll(selector).forEach((node) => {
      node.classList.toggle('pai-selected', node.getAttribute(attribute) === value);
    });
  }

  function refreshSheet() {
    draft = {
      key: settings.key,
      model: settings.model,
      speed: settings.speed,
      style: settings.style,
      stealth: settings.stealth
    };
    keyInput.value = draft.key;
    keyInput.type = 'password';
    keyInput.classList.remove('pai-invalid');
    keyError.hidden = true;
    sheet.querySelector('#pai-model').value = draft.model;
    markSelected('#pai-speed [data-speed]', 'data-speed', draft.speed);
    markSelected('#pai-style [data-style]', 'data-style', draft.style);
    markSelected('[data-stealth]', 'data-stealth', draft.stealth);
  }

  function openSheet() {
    injectStyles();
    if (!sheet) buildSheet();
    refreshSheet();
    const host = doc.body || doc.documentElement;
    if (sheet.parentNode !== host) host.appendChild(sheet);
    sheet.hidden = false;
    attachZones();
  }

  function closeSheet() {
    if (sheet) sheet.hidden = true;
  }

  function saveFromSheet() {
    if (!sheet || sheet.hidden) return;
    const key = keyInput.value.trim();
    if (key.length < MIN_KEY_LENGTH) {
      keyInput.classList.add('pai-invalid');
      keyError.hidden = false;
      return;
    }

    draft.key = key;
    draft.model = sheet.querySelector('#pai-model').value;
    settings = {
      ...settings,
      key: draft.key,
      model: MODELS.includes(draft.model) ? draft.model : settings.model,
      speed: draft.speed,
      style: draft.style,
      stealth: draft.stealth
    };

    for (const name of Object.keys(DEFAULTS)) storageSet(name, settings[name]);

    closeSheet();
    applyPosition();
    applyStealth();
    if (lastAnswer && answerEl) renderAnswer({ text: lastAnswer });
  }

  function applyStealth() {
    if (!trigger) return;
    const hide = settings.stealth === 'hard' && !isTestPage();
    trigger.style.display = hide ? 'none' : '';
    trigger.dataset.stealth = settings.stealth;
  }

  /* ------------------------------------------------------------------ */
  /* Сбор контекста вопроса                                             */
  /* ------------------------------------------------------------------ */

  function visibleText(node) {
    return String(node?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const QUESTION_SELECTORS = [
    '[class*="question"]',
    '[class*="task"]',
    '[class*="prompt"]',
    '.exercise',
    'h1',
    'h2',
    'h3',
    'h4'
  ];

  function stripOptions(text, optionTexts) {
    let result = text;
    for (const option of optionTexts) result = result.split(option).join(' ');
    return result.replace(/\s+/g, ' ').trim();
  }

  function explicitQuestion(node, optionTexts) {
    for (const selector of QUESTION_SELECTORS) {
      let found = null;
      try {
        if (node.matches && node.matches(selector)) found = node;
        else found = node.querySelector ? node.querySelector(selector) : null;
      } catch {
        /* ignore */
      }
      if (!found || isOurNode(found)) continue;
      const text = stripOptions(visibleText(found), optionTexts);
      if (text.length >= 10 && text.length <= 1500) return text;
    }
    return '';
  }

  function findQuestionText(parent, optionTexts) {
    let node = parent;
    for (let depth = 0; depth < 6 && node; depth += 1, node = node.parentElement) {
      const explicit = explicitQuestion(node, optionTexts);
      if (explicit) return explicit;
      const text = stripOptions(visibleText(node), optionTexts);
      if (text.length >= 10 && text.length <= 1500) return text;
    }

    let sibling = parent ? parent.previousElementSibling : null;
    while (sibling) {
      const text = stripOptions(visibleText(sibling), optionTexts);
      if (text.length >= 10 && text.length <= 1500) return text;
      sibling = sibling.previousElementSibling;
    }
    return '';
  }

  function findPageQuestion() {
    for (const selector of QUESTION_SELECTORS) {
      let found = [];
      try {
        found = [...doc.querySelectorAll(selector)];
      } catch {
        continue;
      }
      for (const node of found) {
        if (isOurNode(node)) continue;
        if (node.closest('[hidden]') || node.getAttribute('aria-hidden') === 'true') continue;
        const text = visibleText(node);
        if (text.length >= 10 && text.length <= 1500) return text;
      }
    }
    return '';
  }

  function collectContext() {
    const candidates = [];
    const nodes = doc.querySelectorAll(
      'label, li, button, [role="button"], a, [class*="answer"], [class*="variant"], [class*="option"]'
    );

    for (const node of nodes) {
      if (isOurNode(node)) continue;
      if (node.closest('[hidden]') || node.getAttribute('aria-hidden') === 'true') continue;
      const text = visibleText(node);
      if (!text || text.length > 300) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      candidates.push({ node, text, parent });
    }

    const groups = new Map();
    for (const candidate of candidates) {
      if (!groups.has(candidate.parent)) groups.set(candidate.parent, []);
      groups.get(candidate.parent).push(candidate);
    }

    let best = null;
    for (const [parent, items] of groups) {
      if (items.length < 2 || items.length > 10) continue;
      const texts = [...new Set(items.map((item) => item.text))];
      if (texts.length < 2) continue;

      let score = texts.length;
      if (parent.tagName === 'UL' || parent.tagName === 'OL') score += 5;
      if (parent.querySelector('input[type="radio"], input[type="checkbox"]')) score += 3;
      if (texts.some((text) => /^[А-ЯA-Z][.)]\s/.test(text))) score += 3;

      const question = findQuestionText(parent, texts);
      if (!question) continue;
      score += Math.min(10, Math.floor(question.length / 20));

      if (!best || score > best.score) best = { parent, texts, question, score, multi: Boolean(parent.querySelector('input[type="checkbox"]')) };
    }

    if (best) return { question: best.question, options: best.texts.slice(0, 10), multi: Boolean(best.multi) };

    const question = findPageQuestion();
    return question ? { question, options: [], multi: false } : { question: '', options: [], multi: false };
  }

  /* ------------------------------------------------------------------ */
  /* Генерация ответа                                                    */
  /* ------------------------------------------------------------------ */

  function buildPrompt(context, speed) {
    const lines = [];
    if (context.question) lines.push(`Питання: ${context.question}`);
    if (context.options.length) {
      lines.push('Варіанти:');
      context.options.forEach((option, index) => {
        lines.push(`${String.fromCharCode(65 + index)}) ${option}`);
      });
    }
    const body = lines.join('\n');
    const multi = context.multi ? 'Питання має кілька правильних варіантів. Поверни «Відповідь: A, C» (літери через кому).' : '';
    const open = context.options.length ? '' : 'Якщо відповідь текстова (без варіантів) — поверни «Відповідь: <короткий текст>».';
    if (speed === 'accurate') {
      return `Ти розв'язуєш тест. ${multi} ${open} Перший рядок — «Відповідь: <літера/літери або текст>», другий — коротке обґрунтування до 15 слів. Без вступів.\n\n${body}`;
    }
    return `Ти розв'язуєш тест. ${multi} ${open} Поверни лише рядок «Відповідь: <літера/літери або текст>». Без вступів.\n\n${body}`;
  }

  function httpPost(url, headers, body) {
    if (gmRequest) {
      return new Promise((resolve, reject) => {
        try {
          gmRequest({
            method: 'POST',
            url,
            headers,
            data: body,
            timeout: 30000,
            onload: (response) => {
              if (response.status >= 200 && response.status < 300) {
                resolve(response.responseText || '');
              } else {
                reject(new Error(`HTTP ${response.status}: ${String(response.responseText || '').slice(0, 200)}`));
              }
            },
            onerror: () => reject(new Error('Мережа недоступна')),
            ontimeout: () => reject(new Error('Таймаут запиту'))
          });
        } catch (err) {
          reject(err);
        }
      });
    }

    return fetch(url, { method: 'POST', headers, body }).then(async (response) => {
      const text = await response.text();
      if (!response.ok) {
        let message = text;
        try {
          const parsed = JSON.parse(text);
          message = parsed?.error?.message || text;
        } catch {
          /* ignore */
        }
        throw new Error(`HTTP ${response.status}: ${String(message).slice(0, 200)}`);
      }
      return text;
    });
  }

  async function generateAnswer(context) {
    const key = String(settings.key || '').trim();
    if (key.length < MIN_KEY_LENGTH) throw new Error('Спочатку вкажіть API-ключ у налаштуваннях');

    const speed = SPEEDS[settings.speed] || SPEEDS.fast;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      settings.model
    )}:generateContent`;

    const payload = JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(context, settings.speed) }] }],
      generationConfig: {
        temperature: speed.temperature,
        maxOutputTokens: speed.maxOutputTokens
      }
    });

    const text = await httpPost(
      url,
      { 'content-type': 'application/json', 'x-goog-api-key': key },
      payload
    );

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Некоректна відповідь Gemini');
    }

    const answer = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part?.text)
      .filter((part) => typeof part === 'string' && part.trim())
      .join('\n')
      .trim();

    if (!answer) throw new Error('Модель повернула порожню відповідь');
    return answer;
  }

  /* ------------------------------------------------------------------ */
  /* Рендер ответа                                                       */
  /* ------------------------------------------------------------------ */

  let answerEl = null;
  let toastTimer = null;
  let requestSeq = 0;

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
    const raw = String(text || '').trim();
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    const index = lines.findIndex((line) => /^відповідь\s*:/i.test(line));

    if (index !== -1) {
      const value = lines[index].replace(/^відповідь\s*:\s*/i, '');
      const reason = lines.filter((_, i) => i !== index).join(' ');
      return (
        `<p class="pai-answer-value">${escapeHtml(value)}</p>` +
        (reason ? `<p class="pai-answer-reason">${escapeHtml(reason)}</p>` : '')
      );
    }
    return `<div class="pai-answer-text">${escapeHtml(raw)}</div>`;
  }

  function addButton(parent, label, className, onClick) {
    const button = el('button', `pai-answer-btn${className ? ` ${className}` : ''}`, label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    parent.appendChild(button);
    return button;
  }

  function renderAnswer(options = {}) {
    const style = options.style || settings.style;
    clearAnswer();

    if (style === 'alert') {
      if (options.loading) return null;
      const message = options.error ? `Помилка: ${options.error}` : options.text || '';
      try {
        win.alert(message);
      } catch {
        /* ignore */
      }
      return null;
    }

    const box = el('div', `pai-answer pai-style-${style}`);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Naurok AI');
    box.innerHTML = `
      <div class="pai-answer-head">
        <span class="pai-answer-title">⚡ Naurok AI</span>
        <span class="pai-answer-provider">${escapeHtml(options.provider || providerLabel())}</span>
      </div>
      <div class="pai-answer-body"></div>
      <div class="pai-answer-actions"></div>
    `;

    const body = box.querySelector('.pai-answer-body');
    const actions = box.querySelector('.pai-answer-actions');

    if (options.loading) {
      body.innerHTML = '<div class="pai-skeleton"><i></i><i></i><i></i></div>';
      addButton(actions, 'Закрити', '', clearAnswer);
    } else if (options.error) {
      body.innerHTML = `<div class="pai-error-text">${escapeHtml(options.error)}</div>`;
      addButton(actions, 'Повторити', 'pai-primary', () => {
        if (typeof options.onRetry === 'function') options.onRetry();
      });
      addButton(actions, 'Закрити', '', clearAnswer);
    } else {
      body.innerHTML = answerMarkup(options.text);
      addButton(actions, 'Копіювати', 'pai-primary', () => {
        copyText(String(options.text || ''));
      });
      addButton(actions, 'Закрити', '', clearAnswer);
    }

    const host = doc.body || doc.documentElement;
    host.appendChild(box);
    answerEl = box;

    if (style === 'toast' && !options.loading) {
      toastTimer = win.setTimeout(() => {
        if (answerEl === box) clearAnswer();
      }, TOAST_MS);
    }

    return box;
  }

  function copyText(text) {
    try {
      if (win.navigator?.clipboard?.writeText) {
        win.navigator.clipboard.writeText(text).catch(() => {});
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      const area = doc.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      doc.body.appendChild(area);
      area.select();
      doc.execCommand('copy');
      area.remove();
    } catch {
      /* ignore */
    }
  }

  function renderManualPrompt() {
    clearAnswer();
    const box = el('div', 'pai-answer pai-style-card');
    box.setAttribute('role', 'dialog');
    box.innerHTML = `
      <div class="pai-answer-head">
        <span class="pai-answer-title">⚡ Naurok AI</span>
        <span class="pai-answer-provider">${escapeHtml(providerLabel())}</span>
      </div>
      <textarea class="pai-manual" placeholder="Не вдалося знайти питання. Введіть його вручну…"></textarea>
      <div class="pai-answer-actions"></div>
    `;
    const textarea = box.querySelector('textarea');
    const actions = box.querySelector('.pai-answer-actions');
    addButton(actions, 'Спитати', 'pai-primary', () => {
      const value = textarea.value.trim();
      if (!value) return;
      askCurrent(value);
    });
    addButton(actions, 'Закрити', '', clearAnswer);
    (doc.body || doc.documentElement).appendChild(box);
    answerEl = box;
  }

  async function askCurrent(manualQuestion) {
    const seq = (requestSeq += 1);
    const context =
      manualQuestion === undefined
        ? collectContext()
        : { question: String(manualQuestion), options: [] };

    if (!context.question) {
      renderManualPrompt();
      return;
    }

    renderAnswer({ loading: true });

    try {
      const text = await generateAnswer(context);
      if (seq !== requestSeq) return;
      renderAnswer({ text, provider: providerLabel() });
      lastAnswer = text;
    } catch (error) {
      if (seq !== requestSeq) return;
      renderAnswer({
        error: error?.message || String(error),
        onRetry: () => askCurrent(manualQuestion)
      });
    }
  }

  let lastAnswer = '';

  /* ------------------------------------------------------------------ */
  /* Stealth: мягкое/жёсткое приглушение                                  */
  /* ------------------------------------------------------------------ */

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState !== 'hidden') return;
    if (settings.stealth === 'soft' || settings.stealth === 'hard') clearAnswer();
  });

  win.addEventListener('blur', () => {
    if (settings.stealth === 'hard') {
      clearAnswer();
      closeSheet();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Старт                                                               */
  /* ------------------------------------------------------------------ */

  post('session_start', { url: win.location.href });
  post('hook_state', { attached: true, href: win.location.href });
  if (doc.visibilityState === 'hidden') go('initial_hidden');

  function boot() {
    mount();
    if (doc.body && typeof win.MutationObserver === 'function') startObserver();
  }

  if (doc.body) {
    boot();
  } else {
    doc.addEventListener('DOMContentLoaded', boot, { once: true });
    win.setTimeout(boot, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Тестовый интерфейс (jsdom)                                          */
  /* ------------------------------------------------------------------ */

  if (win.__PAI_TEST__ === true) {
    win.__PAI__ = {
    get settings() {
      return settings;
    },
    DEFAULTS,
    MODELS,
    SPEEDS,
    STYLES: STYLE_CARDS.map((card) => card.id),
    MIN_KEY_LENGTH,
    TOAST_MS,
    openSettings: openSheet,
    closeSettings: closeSheet,
    isSettingsOpen: () => Boolean(sheet && !sheet.hidden && sheet.isConnected),
    renderAnswer,
    ask: (question) => askCurrent(question),
    collectContext,
    buildPrompt,
    trigger: () => trigger,
    settingsZone: () => settingsZone,
    lastAnswer: () => lastAnswer
    };
  }
})();
