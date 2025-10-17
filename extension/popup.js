document.getElementById('add').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = 'Opening NotebookLM…';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'ADD_CURRENT_PAGE' });
    if (res && res.ok) {
      status.textContent = 'Sent to NotebookLM tab. Follow on-screen prompts if needed.';
    } else {
      status.textContent = 'Could not get current page URL.';
    }
  } catch (err) {
    status.textContent = 'Failed to start flow: ' + String(err);
  }
});
