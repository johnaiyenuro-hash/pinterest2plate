const btnOpenApp = document.getElementById('btn-open-app');
const pinterestPageStatus = document.getElementById('pinterest-page-status');
const scrollStepsSelect = document.getElementById('scroll-steps');
const sampleCountSelect = document.getElementById('sample-count');
const btnCollectBoard = document.getElementById('btn-collect-board');
const btnCancelCollect = document.getElementById('btn-cancel-collect');
const collectStatus = document.getElementById('collect-status');

const basketSummary = document.getElementById('basket-summary');
const shopStoreSelect = document.getElementById('shop-store');
const chkAutoAdd = document.getElementById('chk-auto-add');
const btnStartShop = document.getElementById('btn-start-shop');
const shopStatus = document.getElementById('shop-status');

let activeTabId = null;
let isOnPinterest = false;

function showStatus(el, text) {
  el.textContent = text;
  el.classList.remove('hidden');
}

async function initPopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id || null;
  const tabUrl = tab?.url || '';
  isOnPinterest = /^https:\/\/([^/]+\.)?pinterest\.com\//i.test(tabUrl);

  if (isOnPinterest) {
    const isSinglePin = /\/pin\//i.test(tabUrl);
    pinterestPageStatus.textContent = isSinglePin ? 'Single pin detected' : 'Board page ready';
    btnCollectBoard.textContent = isSinglePin ? 'Send This Pin to Plate' : 'Auto-Scroll & Grab Pins';
    btnCollectBoard.disabled = false;
  } else {
    pinterestPageStatus.textContent = 'Open a Pinterest board tab';
    btnCollectBoard.disabled = true;
  }

  chrome.storage.local.get(['p2p_basket', 'p2p_app_origin', 'p2p_shop_session'], (data) => {
    const basket = data.p2p_basket;
    const savedSession = data.p2p_shop_session;
    const sessionPending = (savedSession?.items || []).filter((i) => i.status === 'pending').length;
    const needed = (basket?.items || []).filter((i) => !i.checked);

    if (savedSession?.active && sessionPending > 0) {
      basketSummary.textContent = `Paused: ${sessionPending} items saved`;
      if (['tesco', 'sainsburys', 'ocado', 'asda'].includes(savedSession.store)) {
        shopStoreSelect.value = savedSession.store;
      }
      btnStartShop.disabled = false;
      btnStartShop.textContent = `Resume ${shopStoreSelect.options[shopStoreSelect.selectedIndex].text} (${sessionPending} left)`;
      btnStartShop.dataset.mode = 'resume';
    } else if (needed.length > 0) {
      basketSummary.textContent = `${needed.length} items ready (${basket.mealsCount || 1} meals)`;
      if (basket.store && ['tesco', 'sainsburys', 'ocado', 'asda'].includes(basket.store)) {
        shopStoreSelect.value = basket.store;
      }
      btnStartShop.disabled = false;
      btnStartShop.textContent = `Fill ${shopStoreSelect.options[shopStoreSelect.selectedIndex].text} Trolley (${needed.length})`;
      btnStartShop.dataset.mode = 'start';
    } else {
      basketSummary.textContent = 'Open P!nterest2Plate & select meals';
      btnStartShop.disabled = true;
    }

    btnOpenApp.onclick = () => {
      chrome.tabs.create({ url: data.p2p_app_origin || 'https://pinterest-to-plate.vercel.app' });
    };
  });
}

shopStoreSelect.onchange = () => {
  chrome.storage.local.get(['p2p_basket'], (data) => {
    const needed = (data.p2p_basket?.items || []).filter((i) => !i.checked);
    if (needed.length > 0) {
      btnStartShop.textContent = `Fill ${shopStoreSelect.options[shopStoreSelect.selectedIndex].text} Trolley (${needed.length})`;
    }
  });
};

btnCollectBoard.onclick = () => {
  if (!activeTabId || !isOnPinterest) return;

  const scrollSteps = Number(scrollStepsSelect.value || 8);
  const sampleCount = Number(sampleCountSelect.value || 12);

  btnCollectBoard.disabled = true;
  btnCancelCollect.classList.remove('hidden');
  showStatus(collectStatus, 'Scrolling your Pinterest board to discover diverse pins...');

  chrome.tabs.sendMessage(
    activeTabId,
    {
      type: 'P2P_COLLECT_PINTEREST_PINS',
      payload: { scrollSteps, sampleCount },
    },
    (res) => {
      btnCancelCollect.classList.add('hidden');
      btnCollectBoard.disabled = false;

      if (chrome.runtime.lastError) {
        showStatus(collectStatus, 'Refresh your Pinterest tab once, then click again.');
        return;
      }
      if (!res || !res.ok) {
        showStatus(collectStatus, res?.error || 'Could not collect pins from this page.');
        return;
      }

      showStatus(
        collectStatus,
        `Collected ${res.sentCount} diverse pins (from ${res.scannedCount} scanned)! Opening P!nterest2Plate...`,
      );
      chrome.runtime.sendMessage({
        type: 'P2P_SEND_PINS_TO_APP',
        payload: { pins: res.pins, boardName: res.boardName },
      });
    },
  );
};

btnCancelCollect.onclick = () => {
  if (!activeTabId) return;
  chrome.tabs.sendMessage(activeTabId, { type: 'P2P_CANCEL_COLLECT' });
  btnCancelCollect.classList.add('hidden');
  btnCollectBoard.disabled = false;
  showStatus(collectStatus, 'Stopped scrolling early.');
};

btnStartShop.onclick = () => {
  const store = shopStoreSelect.value;
  const autoAdd = chkAutoAdd.checked;
  const isResume = btnStartShop.dataset.mode === 'resume';
  btnStartShop.disabled = true;
  showStatus(shopStatus, isResume ? 'Resuming your saved trolley list...' : `Opening ${store} and starting Trolley Assistant...`);

  const msg = isResume
    ? { type: 'P2P_RESUME_SHOPPING', payload: { tabId: activeTabId } }
    : { type: 'P2P_START_SHOPPING', payload: { store, autoAdd } };

  chrome.runtime.sendMessage(msg, (res) => {
    if (!res || !res.ok) {
      btnStartShop.disabled = false;
      showStatus(shopStatus, res?.error || 'Could not start shopping session.');
    } else {
      window.close();
    }
  });
};

initPopup();
