function getContentScriptId(pattern) {
  return `domain[${pattern.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}]`;
}

async function hasRegisteredContentScript(pattern) {
  const id = getContentScriptId(pattern);
  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [id],
  });
  return existing.length > 0;
}

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function registerDomain(pattern) {
  if (await hasRegisteredContentScript(pattern)) {
    return;
  }

  const id = getContentScriptId(pattern);
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [pattern],
      runAt: "document_start",
      persistAcrossSessions: true,
      js: ["content.js"],
      world: "MAIN",
    },
  ]);

  const currentTab = await getCurrentTab();
  if (currentTab) {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ["content.js"],
      world: "MAIN",
    });
  }
}

async function unregisterDomain(pattern) {
  if (await hasRegisteredContentScript(pattern)) {
    const id = getContentScriptId(pattern);
    await chrome.scripting.unregisterContentScripts({
      ids: [id],
    });
  }
}

chrome.permissions.onAdded.addListener(async (permissions) => {
  const patterns = permissions.origins || [];
  for (const pattern of patterns) {
    await registerDomain(pattern);
  }
});

chrome.permissions.onRemoved.addListener(async (permissions) => {
  const patterns = permissions.origins || [];
  for (const pattern of patterns) {
    await unregisterDomain(pattern);
  }
});

async function reconcileRegisteredScripts() {
  const permissions = await chrome.permissions.getAll();
  const patterns = permissions.origins || [];
  for (const pattern of patterns) {
    await registerDomain(pattern);
  }
}

// in development permissions persist, but registered content scripts do not,
// so we need to re-register them on startup
reconcileRegisteredScripts();
