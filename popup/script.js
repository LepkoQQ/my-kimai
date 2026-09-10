const currentDomainEl = document.querySelector(".current-domain");
const permissionButtonEl = document.querySelector(".permission-button");

let currentPermissionPattern = null;
let currentPermissionGranted = false;

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tabs[0];
}

function getPermissionPattern(urlString) {
  const url = new URL(urlString);
  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }
  return `*://${url.host}/*`;
}

async function initialize() {
  try {
    const currentTab = await getCurrentTab();
    if (!currentTab?.url) {
      throw new Error("Restricted page");
    }

    currentPermissionPattern = getPermissionPattern(currentTab.url);
    if (!currentPermissionPattern) {
      throw new Error("Invalid domain");
    }

    const url = new URL(currentTab.url);
    currentDomainEl.textContent = url.host;

    const alreadyGranted = await chrome.permissions.contains({
      origins: [currentPermissionPattern],
    });

    if (alreadyGranted) {
      currentPermissionGranted = true;
      currentDomainEl.classList.add("granted");
      currentDomainEl.classList.remove("error");
      currentDomainEl.textContent = `${url.host}`;
      permissionButtonEl.disabled = false;
      permissionButtonEl.textContent = "👎";
      return;
    }

    currentPermissionGranted = false;
    currentDomainEl.classList.remove("granted");
    currentDomainEl.classList.remove("error");
    currentDomainEl.textContent = `${url.host}`;
    permissionButtonEl.disabled = false;
    permissionButtonEl.textContent = "👍";
  } catch (error) {
    currentPermissionGranted = false;
    currentDomainEl.classList.remove("granted");
    currentDomainEl.classList.add("error");
    currentDomainEl.textContent = `${error.message}`;
    permissionButtonEl.disabled = true;
    permissionButtonEl.textContent = "👍";
    console.error(error);
  }
}

permissionButtonEl.addEventListener("click", async () => {
  if (!currentPermissionPattern) {
    return;
  }

  permissionButtonEl.disabled = true;

  try {
    if (!currentPermissionGranted) {
      chrome.permissions.request({
        origins: [currentPermissionPattern],
      });
    } else {
      chrome.permissions.remove({
        origins: [currentPermissionPattern],
      });
    }
    // The permission request may cause this popup to close and terminate this
    // script, so we always just close the popup for consistency. Use
    // permission events in a background script to continue the flow.
    window.close();
  } catch (error) {
    currentDomainEl.classList.remove("granted");
    currentDomainEl.classList.add("error");
    console.error(error);
  }
});

initialize();
