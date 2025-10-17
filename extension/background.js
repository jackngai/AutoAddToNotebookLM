// Background service worker (MV3)

const NOTEBOOKLM_ORIGIN = "https://notebooklm.google.com";

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: "add-page-to-notebooklm",
      title: "Add this page to NotebookLM",
      contexts: ["page", "action"],
    });
    chrome.contextMenus.create({
      id: "add-link-to-notebooklm",
      title: "Add this link to NotebookLM",
      contexts: ["link"],
    });
  } catch (_) {}
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "add-page-to-notebooklm") {
    const sourceUrl = (tab && tab.url) || info.pageUrl;
    if (sourceUrl) await openNotebookLMAndAdd(sourceUrl);
  } else if (info.menuItemId === "add-link-to-notebooklm") {
    const sourceUrl = info.linkUrl || (tab && tab.url) || info.pageUrl;
    if (sourceUrl) await openNotebookLMAndAdd(sourceUrl);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  const sourceUrl = tab && tab.url;
  if (sourceUrl) await openNotebookLMAndAdd(sourceUrl);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ADD_CURRENT_PAGE") {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
      const active = tabs && tabs[0];
      const sourceUrl = active && active.url;
      if (sourceUrl) await openNotebookLMAndAdd(sourceUrl);
      sendResponse({ ok: Boolean(sourceUrl) });
    });
    return true; // keep channel open for async sendResponse
  }
});

async function openNotebookLMAndAdd(sourceUrl) {
  const targetUrl = NOTEBOOKLM_ORIGIN + "/";
  const notebookTab = await chrome.tabs.create({ url: targetUrl, active: true });

  const tabId = notebookTab.id;
  if (!tabId) return;

  await waitForTabComplete(tabId, 60000);

  // Try to message the resident content script first
  try {
    await sendMessageWithTimeout(tabId, { type: "ADD_NOTEBOOK_SOURCE", sourceUrl }, 20000);
    return;
  } catch (_) {
    // Fall through to inject explicitly
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
      world: "ISOLATED",
    });
  } catch (_) {
    // ignore
  }

  // Try messaging again after explicit injection
  try {
    await sendMessageWithTimeout(tabId, { type: "ADD_NOTEBOOK_SOURCE", sourceUrl }, 20000);
  } catch (err) {
    console.warn("Failed to communicate with content script:", err);
  }
}

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function checkDone(changeInfo, updatedTabId, updatedTab) {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(checkDone);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(checkDone);

    const timer = setInterval(async () => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        try { chrome.tabs.onUpdated.removeListener(checkDone); } catch (_) {}
        reject(new Error("Timed out waiting for tab to load"));
      }
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === "complete") {
          clearInterval(timer);
          try { chrome.tabs.onUpdated.removeListener(checkDone); } catch (_) {}
          resolve();
        }
      } catch (_) {}
    }, 500);
  });
}

function sendMessageWithTimeout(tabId, message, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("Message timeout"));
    }, timeoutMs);

    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (done) return;
        clearTimeout(timer);
        done = true;
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      if (done) return;
      clearTimeout(timer);
      done = true;
      reject(err);
    }
  });
}
