// P!nterest2Plate Companion — MV3 Service Worker
const DEFAULT_APP_URL = 'https://pinterest-to-plate.vercel.app';

const STORE_URLS = {
  tesco: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}`,
  sainsburys: (q) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(q)}`,
  ocado: (q) => `https://www.ocado.com/search?entry=${encodeURIComponent(q)}`,
  asda: (q) => `https://groceries.asda.com/search/${encodeURIComponent(q)}`,
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === 'P2P_SYNC_BASKET') {
    chrome.storage.local.set(
      {
        p2p_basket: message.payload,
        p2p_app_origin: sender.origin || DEFAULT_APP_URL,
      },
      () => sendResponse({ ok: true }),
    );
    return true;
  }

  if (message.type === 'P2P_SEND_PINS_TO_APP') {
    const { pins, boardName } = message.payload || {};
    chrome.storage.local.get(['p2p_app_origin'], (data) => {
      const origin = data.p2p_app_origin || DEFAULT_APP_URL;
      chrome.storage.local.set(
        {
          p2p_pending_import: {
            pins: pins || [],
            boardName: boardName || 'Pinterest Board Selection',
            createdAt: Date.now(),
          },
        },
        async () => {
          const targetUrl = `${origin}/?extImport=1`;
          const existingTabs = await chrome.tabs.query({ url: `${origin}/*` });
          if (existingTabs.length > 0 && existingTabs[0].id) {
            await chrome.tabs.update(existingTabs[0].id, { active: true });
            chrome.tabs.sendMessage(existingTabs[0].id, {
              type: 'P2P_DELIVER_PENDING_IMPORT',
              payload: { pins: pins || [], boardName: boardName || 'Pinterest Board Selection' },
            }).catch(() => {
              chrome.tabs.update(existingTabs[0].id, { url: targetUrl });
            });
          } else {
            await chrome.tabs.create({ url: targetUrl });
          }
          sendResponse({ ok: true, count: (pins || []).length });
        },
      );
    });
    return true;
  }

  if (message.type === 'P2P_START_SHOPPING') {
    const { store, autoAdd } = message.payload || {};
    chrome.storage.local.get(['p2p_basket'], async (data) => {
      const basket = data.p2p_basket;
      const items = (basket?.items || []).filter((i) => !i.checked);
      if (items.length === 0) {
        sendResponse({ ok: false, error: 'No unchecked items in your synced basket.' });
        return;
      }

      const storeKey = STORE_URLS[store] ? store : 'tesco';
      const session = {
        active: true,
        store: storeKey,
        autoAdd: Boolean(autoAdd),
        items: items.map((i) => ({ ...i, status: 'pending' })),
        currentIndex: 0,
        startedAt: Date.now(),
      };

      await chrome.storage.local.set({ p2p_shop_session: session });
      const firstUrl = STORE_URLS[storeKey](session.items[0].ukSearchQuery || session.items[0].name);
      await chrome.tabs.create({ url: firstUrl });
      sendResponse({ ok: true, count: session.items.length });
    });
    return true;
  }

  if (message.type === 'P2P_SHOP_NEXT_ITEM') {
    chrome.storage.local.get(['p2p_shop_session'], async (data) => {
      const session = data.p2p_shop_session;
      if (!session || !session.active) {
        sendResponse({ ok: false });
        return;
      }

      const { statusUpdate, tabId } = message.payload || {};
      if (session.items[session.currentIndex] && statusUpdate) {
        session.items[session.currentIndex].status = statusUpdate;
      }

      const nextIdx = session.items.findIndex((item, idx) => idx > session.currentIndex && item.status === 'pending');
      if (nextIdx === -1) {
        session.active = false;
        session.completedAt = Date.now();
        await chrome.storage.local.set({ p2p_shop_session: session });
        sendResponse({ ok: true, finished: true, session });
        return;
      }

      session.currentIndex = nextIdx;
      await chrome.storage.local.set({ p2p_shop_session: session });

      const nextItem = session.items[nextIdx];
      const nextUrl = STORE_URLS[session.store](nextItem.ukSearchQuery || nextItem.name);
      const targetTabId = tabId || sender.tab?.id;
      if (targetTabId) {
        await chrome.tabs.update(targetTabId, { url: nextUrl });
      }
      sendResponse({ ok: true, finished: false, session });
    });
    return true;
  }

  if (message.type === 'P2P_PAUSE_FOR_LOGIN') {
    chrome.storage.local.get(['p2p_shop_session'], async (data) => {
      const session = data.p2p_shop_session;
      if (session) {
        session.pausedForLogin = true;
        await chrome.storage.local.set({ p2p_shop_session: session });
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'P2P_RESUME_SHOPPING') {
    chrome.storage.local.get(['p2p_shop_session'], async (data) => {
      const session = data.p2p_shop_session;
      if (!session || !session.items || session.items.length === 0) {
        sendResponse({ ok: false, error: 'No saved shopping session to resume.' });
        return;
      }
      session.active = true;
      session.pausedForLogin = false;
      const pendingIdx = session.items.findIndex((i) => i.status === 'pending');
      if (pendingIdx === -1) {
        session.active = false;
        await chrome.storage.local.set({ p2p_shop_session: session });
        sendResponse({ ok: true, finished: true });
        return;
      }
      session.currentIndex = pendingIdx;
      await chrome.storage.local.set({ p2p_shop_session: session });
      const item = session.items[pendingIdx];
      const url = STORE_URLS[session.store](item.ukSearchQuery || item.name);
      const targetTabId = message.payload?.tabId || sender.tab?.id;
      if (targetTabId) {
        await chrome.tabs.update(targetTabId, { url });
      } else {
        await chrome.tabs.create({ url });
      }
      sendResponse({ ok: true, remaining: session.items.filter((i) => i.status === 'pending').length });
    });
    return true;
  }

  if (message.type === 'P2P_STOP_SHOPPING') {
    chrome.storage.local.get(['p2p_shop_session'], async (data) => {
      if (data.p2p_shop_session) {
        data.p2p_shop_session.active = false;
        await chrome.storage.local.set({ p2p_shop_session: data.p2p_shop_session });
      }
      sendResponse({ ok: true });
    });
    return true;
  }
});
