// Content script injected into https://notebooklm.google.com/*

(function () {
  const NS = "[AddToNotebookLM]";

  function log(...args) {
    console.log(NS, ...args);
  }
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  async function waitForCondition(predicate, timeoutMs = 12000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = predicate();
      if (result) return result;
      await sleep(intervalMs);
    }
    return null;
  }

  function textContent(el) {
    return (el.textContent || "").trim().replace(/\s+/g, " ");
  }

  function byTextCandidates(root, tagNames, texts) {
    const lowerTexts = texts.map((t) => t.toLowerCase());
    const matches = [];
    for (const tag of tagNames) {
      const els = root.querySelectorAll(tag);
      for (const el of els) {
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        const title = (el.getAttribute("title") || "").toLowerCase();
        const txt = textContent(el).toLowerCase();
        if ([aria, title, txt].some((s) => lowerTexts.some((t) => s.includes(t)))) {
          matches.push(el);
        }
      }
    }
    return matches;
  }

  function clickElement(el) {
    try {
      el.scrollIntoView({ block: "center", inline: "center" });
    } catch (_) {}
    el.click();
  }

  function setInputValue(input, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(input.__proto__, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setContentEditable(el, value) {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  async function tryCreateNewNotebook() {
    const container = document;
    const createButtons = byTextCandidates(container, [
      'button', 'div[role="button"]', 'a', 'span', 'div'
    ], [
      'new notebook', 'create', 'new', 'start a new notebook', 'blank', 'plus', 'add'
    ]);
    for (const btn of createButtons) {
      try {
        clickElement(btn);
        // Heuristic: wait for notebook route to load
        const ok = await waitForCondition(() => location.pathname.includes('/notebook'), 8000);
        if (ok !== null) return true;
      } catch (_) {}
    }

    // Try keyboard shortcut (if any in app) - noop if unsupported
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true }));
    } catch (_) {}

    const ok = await waitForCondition(() => location.pathname.includes('/notebook'), 4000);
    return ok !== null;
  }

  async function tryOpenAddSource() {
    const addButtons = byTextCandidates(document, [
      'button', 'div[role="button"]', 'a', 'span', 'div'
    ], [
      'add source', 'add a source', 'add', 'source', 'website', 'url', 'web'
    ]);
    for (const btn of addButtons) {
      try {
        clickElement(btn);
        // If this opened a dialog/sheet, we should see inputs or source type choices
        const ok = await waitForCondition(() => document.querySelector('input, textarea, [contenteditable="true"], dialog, [role="dialog"], [role="menu"], [role="listbox"]'), 5000);
        if (ok) return true;
      } catch (_) {}
    }
    return false;
  }

  function findUrlInputCandidate() {
    // Prefer inputs that look like URL fields
    const inputs = Array.from(document.querySelectorAll('input[type="url"], input[type="text"], textarea'));
    const ranked = inputs
      .map((el) => ({ el, score: scoreUrlInput(el) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (ranked[0]) return ranked[0].el;

    // Fallback: contenteditable that looks like a field
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    if (editables[0]) return editables[0];

    return null;
  }

  function scoreUrlInput(el) {
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    let score = 0;
    const keywords = ['url', 'link', 'website', 'web', 'paste'];
    for (const k of keywords) {
      if (placeholder.includes(k)) score += 2;
      if (name.includes(k)) score += 1;
      if (aria.includes(k)) score += 2;
    }
    // Prefer visible inputs
    const rect = el.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 20) score += 1;
    return score;
  }

  async function tryChooseWebsiteSourceType() {
    // Some UIs show a picker of source types
    const candidates = byTextCandidates(document, ['button', 'div', 'a', 'span'], [
      'website', 'web', 'url', 'link'
    ]);
    for (const el of candidates) {
      try {
        clickElement(el);
        await sleep(400);
        // If clicking changes inputs shown, consider it success
        const input = await waitForCondition(() => findUrlInputCandidate(), 2000);
        if (input) return true;
      } catch (_) {}
    }
    return false;
  }

  async function confirmAdd() {
    const btns = byTextCandidates(document, ['button', 'div[role="button"]', 'a', 'span', 'div'], [
      'add', 'done', 'save', 'insert', 'create', 'upload'
    ]);
    for (const b of btns) {
      try {
        clickElement(b);
        await sleep(400);
        return true;
      } catch (_) {}
    }
    return false;
  }

  async function showHelpOverlayAndCopy(url) {
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      log('Clipboard write failed:', err);
    }
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.55)';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const panel = document.createElement('div');
    panel.style.background = '#fff';
    panel.style.padding = '20px 24px';
    panel.style.borderRadius = '12px';
    panel.style.maxWidth = '560px';
    panel.style.boxShadow = '0 12px 40px rgba(0,0,0,0.35)';
    panel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

    const title = document.createElement('div');
    title.textContent = 'Add this URL to NotebookLM';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.marginBottom = '8px';

    const msg = document.createElement('div');
    msg.innerHTML = 'We copied the page URL to your clipboard. Click <b>Add source</b> here in NotebookLM and paste (Ctrl/Cmd+V).';
    msg.style.fontSize = '14px';
    msg.style.color = '#333';

    const urlBox = document.createElement('code');
    urlBox.textContent = url;
    urlBox.style.display = 'block';
    urlBox.style.marginTop = '12px';
    urlBox.style.padding = '10px 12px';
    urlBox.style.border = '1px solid #ddd';
    urlBox.style.borderRadius = '8px';
    urlBox.style.wordBreak = 'break-all';
    urlBox.style.background = '#fafafa';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Got it';
    closeBtn.style.marginTop = '14px';
    closeBtn.style.padding = '8px 12px';
    closeBtn.style.borderRadius = '8px';
    closeBtn.style.border = '1px solid #ccc';
    closeBtn.style.background = '#fff';
    closeBtn.addEventListener('click', () => overlay.remove());

    panel.appendChild(title);
    panel.appendChild(msg);
    panel.appendChild(urlBox);
    panel.appendChild(closeBtn);
    overlay.appendChild(panel);

    document.body.appendChild(overlay);
  }

  async function handleAddSourceFlow(sourceUrl) {
    log('Starting flow with URL:', sourceUrl);

    // If already in a notebook, proceed; else try to create a new one
    if (!location.pathname.includes('/notebook')) {
      const created = await tryCreateNewNotebook();
      log('Created new notebook?', created);
      if (!created) {
        await showHelpOverlayAndCopy(sourceUrl);
        return { ok: false, reason: 'create_notebook_failed' };
      }
      // Give time for notebook editor to mount
      await sleep(1500);
    }

    // Open Add Source UI
    let opened = await tryOpenAddSource();
    if (!opened) {
      // Maybe the UI shows source-type first; attempt choosing website
      await tryChooseWebsiteSourceType();
      opened = await tryOpenAddSource();
    }

    // Try choosing website type explicitly (harmless if not present)
    await tryChooseWebsiteSourceType();

    const input = await waitForCondition(() => findUrlInputCandidate(), 6000);
    if (!input) {
      await showHelpOverlayAndCopy(sourceUrl);
      return { ok: false, reason: 'url_input_not_found' };
    }

    try {
      if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
        setInputValue(input, sourceUrl);
      } else if (input.getAttribute('contenteditable') === 'true') {
        setContentEditable(input, sourceUrl);
      } else {
        input.focus();
        document.execCommand('insertText', false, sourceUrl);
      }
    } catch (err) {
      log('Failed to set input value', err);
      await showHelpOverlayAndCopy(sourceUrl);
      return { ok: false, reason: 'set_value_failed' };
    }

    await sleep(200);

    const confirmed = await confirmAdd();
    if (!confirmed) {
      // Try pressing Enter key in case it's handled by the form
      try { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } catch (_) {}
      await sleep(500);
    }

    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'ADD_NOTEBOOK_SOURCE' && message?.sourceUrl) {
      handleAddSourceFlow(message.sourceUrl)
        .then((res) => sendResponse(res))
        .catch((err) => {
          console.error(NS, 'Flow error', err);
          sendResponse({ ok: false, error: String(err) });
        });
      return true; // keep channel open
    }
    return undefined;
  });
})();
