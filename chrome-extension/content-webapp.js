// P!nterest2Plate Companion — Web App Bridge (pinterest-to-plate.vercel.app & localhost:3000)
(() => {
  // Announce presence to the web app
  function announceExtension() {
    window.postMessage({ type: 'P2P_EXTENSION_READY', version: '1.0.0' }, '*');
  }

  announceExtension();
  setTimeout(announceExtension, 800);

  // Listen for basket sync or shopping triggers from the web app
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || !event.data.type) return;

    if (event.data.type === 'P2P_WEBAPP_PING') {
      announceExtension();
      return;
    }

    if (event.data.type === 'P2P_WEBAPP_SYNC_BASKET') {
      chrome.runtime.sendMessage({
        type: 'P2P_SYNC_BASKET',
        payload: event.data.payload,
      });
      return;
    }

    if (event.data.type === 'P2P_WEBAPP_START_SHOPPING') {
      chrome.runtime.sendMessage({
        type: 'P2P_START_SHOPPING',
        payload: event.data.payload,
      });
    }
  });

  // Deliver pending Pinterest pins collected by the extension
  function checkAndDeliverPendingImport() {
    chrome.storage.local.get(['p2p_pending_import'], (data) => {
      const pending = data.p2p_pending_import;
      if (!pending || !Array.isArray(pending.pins) || pending.pins.length === 0) return;
      // Only deliver fresh batches (< 10 minutes old)
      if (Date.now() - (pending.createdAt || 0) > 10 * 60 * 1000) {
        chrome.storage.local.remove('p2p_pending_import');
        return;
      }
      window.postMessage(
        {
          type: 'P2P_EXTENSION_IMPORT_PINS',
          payload: pending,
        },
        '*',
      );
      chrome.storage.local.remove('p2p_pending_import');
    });
  }

  // Deliver on page load (after React hydrates)
  setTimeout(checkAndDeliverPendingImport, 700);

  // Also deliver live when already open in an existing tab
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'P2P_DELIVER_PENDING_IMPORT' && message.payload) {
      window.postMessage(
        {
          type: 'P2P_EXTENSION_IMPORT_PINS',
          payload: message.payload,
        },
        '*',
      );
      chrome.storage.local.remove('p2p_pending_import');
      sendResponse({ ok: true });
    }
  });
})();
