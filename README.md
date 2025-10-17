# Add to NotebookLM (Chromium Extension)

Add the current page you're viewing to a new Google NotebookLM notebook as a source. One click from the toolbar (or right‑click) opens NotebookLM, creates a new notebook if needed, and attempts to add the page URL as a source automatically. If automation is blocked by UI changes or permissions, the extension copies the URL and shows a brief in‑page helper so you can paste it into NotebookLM quickly.

## Features
- Open NotebookLM in a new tab and add the current page's URL as a source
- Creates a new notebook when you're not already in one
- Popup button and context menu entries (page and link)
- Best‑effort UI automation with sensible fallbacks

## Requirements
- A Chromium‑based browser (Chrome, Edge, Brave, etc.)
- Access to `https://notebooklm.google.com/` with a Google account

## Install (Developer Mode)
1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Toggle on "Developer mode" (top right).
4. Click "Load unpacked" and select the `extension` folder inside this repository.

You should now see "Add to NotebookLM" in your extensions list.

## Usage
- Toolbar button: Click the extension icon. It will open NotebookLM in a new tab and attempt to create a new notebook (if you're not already in one) and add the current page as a source.
- Context menu:
  - Right‑click on a page and choose "Add this page to NotebookLM".
  - Right‑click a link and choose "Add this link to NotebookLM" to add the link target instead.

If automation can't find the "Add source" UI, the extension copies the URL to your clipboard and shows a helper overlay in the NotebookLM tab with instructions to paste.

## How it works
- Background service worker (`extension/background.js`) opens `https://notebooklm.google.com/` and coordinates messaging.
- Content script (`extension/content.js`) runs on NotebookLM pages, attempting to:
  1) create a new notebook if you're on the home or list view,
  2) open the "Add source" flow,
  3) detect a URL input and fill it with the source URL, and
  4) confirm the action.
- A simple popup (`extension/popup.html`, `extension/popup.js`) triggers the background action for the active tab.

## Permissions explained
- `activeTab`, `tabs`: Read the URL of the current tab to send to NotebookLM.
- `scripting`: Inject the content script if needed.
- `contextMenus`: Provide right‑click actions.
- `clipboardWrite`: Copy the URL in fallback scenarios.
- Host permission: `https://notebooklm.google.com/*` so the content script can operate in NotebookLM.

## Notes and limitations
- NotebookLM's UI may change over time; the extension uses text and role heuristics to locate relevant controls. If something breaks, try updating to the latest version or file an issue.
- You must be signed in to Google in your browser. The extension does not handle authentication flows.
- The extension does not collect or transmit data anywhere; it only opens NotebookLM and automates within that page.

## Development
- Edit files inside the `extension` folder. After changes, go to `chrome://extensions` and click "Reload" on the extension card.
- Open DevTools for the "Service Worker" in `chrome://extensions` to see logs from `background.js`. Use the target NotebookLM tab's DevTools to view `content.js` logs.

## Uninstall
- Visit `chrome://extensions`, disable or remove "Add to NotebookLM".
