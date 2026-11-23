// Pin2Plate (P2P) Companion — UK Supermarket Trolley Assistant (Tesco, Sainsbury's, Ocado, Asda)
(() => {
  const HOST = window.location.hostname;

  function detectStoreKey() {
    if (HOST.includes('tesco.com')) return 'tesco';
    if (HOST.includes('sainsburys.co.uk')) return 'sainsburys';
    if (HOST.includes('ocado.com')) return 'ocado';
    if (HOST.includes('asda.com')) return 'asda';
    return null;
  }

  const CURRENT_STORE = detectStoreKey();
  if (!CURRENT_STORE) return;

  function isOnLoginPage() {
    const href = window.location.href.toLowerCase();
    return (
      /\/(login|signin|sign-in|account\/login|auth|sso|register)/.test(href) ||
      Boolean(document.querySelector('input[type="password"]'))
    );
  }

  function isOnSearchPage() {
    const href = window.location.href.toLowerCase();
    return (
      href.includes('/search') ||
      href.includes('searchresults') ||
      href.includes('query=') ||
      href.includes('entry=')
    );
  }

  function hasSignInPromptModal() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal'));
    return dialogs.some((d) => {
      if (!isVisible(d)) return false;
      const t = (d.textContent || '').toLowerCase();
      return (t.includes('sign in') || t.includes('log in')) && (t.includes('password') || t.includes('email') || t.includes('account'));
    });
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 10 && rect.height > 10;
  }

  function findFirstAddButton() {
    const storeSelectors = {
      tesco: [
        'button[data-auto="add-to-basket"]',
        'button[aria-label*="Add "][aria-label*="basket" i]',
        'button[aria-label*="Add "][aria-label*="trolley" i]',
        'li[class*="product"] button',
      ],
      sainsburys: [
        'button[data-test-id="add-button"]',
        'button[data-testid="add-button"]',
        '.pt__actions button',
        'article button',
      ],
      ocado: [
        'button[data-test="add-button"]',
        'button[aria-label*="Add to trolley" i]',
        '.fop-item button',
      ],
      asda: [
        'button[data-auto-id="btnAdd"]',
        'button[aria-label*="Add "]',
        '.co-item button',
      ],
    };

    const selectors = storeSelectors[CURRENT_STORE] || [];
    for (const sel of selectors) {
      const candidates = Array.from(document.querySelectorAll(sel));
      for (const btn of candidates) {
        if (!isVisible(btn) || btn.disabled) continue;
        const txt = (btn.textContent || '').trim().toLowerCase();
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (
          txt === 'add' ||
          txt === 'add to trolley' ||
          txt === 'add to basket' ||
          (aria.includes('add') && !aria.includes('favourites') && !aria.includes('list') && !aria.includes('filter'))
        ) {
          return btn;
        }
      }
    }

    // Generic safe fallback: first visible primary "Add" button inside main search results
    const main = document.querySelector('main') || document.body;
    const allButtons = Array.from(main.querySelectorAll('button'));
    for (const btn of allButtons) {
      if (!isVisible(btn) || btn.disabled) continue;
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (txt === 'add' || txt === 'add to trolley' || txt === 'add to basket') {
        return btn;
      }
    }
    return null;
  }

  function extractProductTitleNear(btn) {
    const card =
      btn.closest('li, article, [data-auto="product-tile"], [data-test-id*="product"], .fop-item, .co-item') ||
      btn.parentElement?.parentElement;
    if (!card) return '';
    const heading = card.querySelector('h2, h3, a[data-auto="product-tile--title"], [data-test-id="product-tile-description"]');
    return (heading?.textContent || '').trim().slice(0, 80);
  }

  function highlightCard(btn) {
    const card = btn.closest('li, article, .fop-item, .co-item') || btn.parentElement;
    if (card) {
      card.style.outline = '3px solid #2D6A4F';
      card.style.outlineOffset = '3px';
      card.style.borderRadius = '12px';
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async function waitForAddButton(timeoutMs = 7000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const btn = findFirstAddButton();
      if (btn) return btn;
      await new Promise((r) => setTimeout(r, 450));
    }
    return null;
  }

  function renderAssistantPanel(session) {
    const existing = document.getElementById('p2p-trolley-panel');
    if (existing) existing.remove();

    const item = session.items[session.currentIndex];
    const total = session.items.length;
    const done = session.items.filter((i) => i.status === 'added').length;

    const panel = document.createElement('div');
    panel.id = 'p2p-trolley-panel';
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '2147483647',
      width: '340px',
      background: '#FFFFFF',
      color: '#1C1917',
      borderRadius: '20px',
      border: '1px solid #DED5C8',
      boxShadow: '0 20px 50px rgba(28, 25, 23, 0.28)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overflow: 'hidden',
    });

    panel.innerHTML = `
      <div style="background:#1C1917;color:#FAF7F2;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#F97316;font-weight:800;">
            Pin2Plate (P2P) Trolley Assistant
          </div>
          <div style="font-size:12px;font-weight:700;margin-top:2px;">
            Item ${session.currentIndex + 1} of ${total} · ${done} added
          </div>
        </div>
        <button id="p2p-btn-stop" style="background:rgba(255,255,255,0.14);color:#fff;border:none;border-radius:8px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;">
          Stop
        </button>
      </div>
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px;">
        <div>
          <div style="font-size:15px;font-weight:800;color:#1C1917;">${item ? item.name : 'Complete!'}</div>
          ${
            item
              ? `<div style="margin-top:4px;font-size:12px;color:#575049;">
                   Need: <strong style="color:#D93B22;">${item.combinedQty}</strong>
                 </div>`
              : ''
          }
        </div>
        <div id="p2p-match-status" style="font-size:12px;background:#FAF7F2;border:1px solid #E8E1D7;border-radius:10px;padding:8px 10px;color:#443E38;">
          Scanning search results for best match...
        </div>
        <div style="display:flex;gap:8px;">
          <button id="p2p-btn-add-next" style="flex:1;background:#2D6A4F;color:#fff;border:none;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer;">
            Add &amp; Next →
          </button>
          <button id="p2p-btn-skip" style="background:#FAF7F2;color:#443E38;border:1px solid #DED5C8;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:700;cursor:pointer;">
            Skip
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    const statusEl = panel.querySelector('#p2p-match-status');
    const btnAddNext = panel.querySelector('#p2p-btn-add-next');
    const btnSkip = panel.querySelector('#p2p-btn-skip');
    const btnStop = panel.querySelector('#p2p-btn-stop');

    const advance = (statusUpdate) => {
      chrome.runtime.sendMessage({ type: 'P2P_SHOP_NEXT_ITEM', payload: { statusUpdate } }, (res) => {
        if (res?.finished) {
          statusEl.textContent = `All done! ${res.session.items.filter((i) => i.status === 'added').length} items added to your trolley.`;
          btnAddNext.textContent = 'Close';
          btnAddNext.onclick = () => panel.remove();
          btnSkip.style.display = 'none';
        }
      });
    };

    btnStop.onclick = () => {
      chrome.runtime.sendMessage({ type: 'P2P_STOP_SHOPPING' });
      panel.remove();
    };

    btnSkip.onclick = () => advance('skipped');

    return { statusEl, btnAddNext, advance };
  }

  async function initSupermarketAssistant() {
    const data = await chrome.storage.local.get(['p2p_shop_session']);
    const session = data.p2p_shop_session;
    if (!session || !session.active || session.store !== CURRENT_STORE) return;

    const remainingCount = session.items.filter((i) => i.status === 'pending').length;
    const { statusEl, btnAddNext, advance } = renderAssistantPanel(session);

    // Case 1: User is on a Login page — pause safely without losing any items!
    if (isOnLoginPage()) {
      chrome.runtime.sendMessage({ type: 'P2P_PAUSE_FOR_LOGIN' });
      statusEl.textContent = `Sign in to ${CURRENT_STORE.toUpperCase()} first — all ${remainingCount} items are safely saved. Once signed in, click Resume below.`;
      btnAddNext.textContent = `Resume (${remainingCount} left) →`;
      btnAddNext.onclick = () => chrome.runtime.sendMessage({ type: 'P2P_RESUME_SHOPPING' });
      return;
    }

    // Case 2: Supermarket redirected user back to homepage/account after signing in
    if (session.pausedForLogin || !isOnSearchPage()) {
      statusEl.textContent = `Welcome back! All ${remainingCount} items are saved and ready. Click Resume to pick up right where you left off.`;
      btnAddNext.textContent = `Resume Filling Trolley (${remainingCount}) →`;
      btnAddNext.onclick = () => chrome.runtime.sendMessage({ type: 'P2P_RESUME_SHOPPING' });
      return;
    }

    const addBtn = await waitForAddButton(7000);

    if (!addBtn) {
      statusEl.textContent =
        'Could not auto-detect an Add button (check if you are signed in or pick a variant manually). Click "Next →" once added.';
      btnAddNext.textContent = 'Added Manually · Next →';
      btnAddNext.onclick = () => advance('added');
      return;
    }

    const matchName = extractProductTitleNear(addBtn);
    highlightCard(addBtn);

    const doClickAndAdvance = () => {
      btnAddNext.disabled = true;
      const urlBeforeClick = window.location.href;
      statusEl.textContent = `Adding "${matchName || 'top match'}" to your trolley...`;
      addBtn.click();

      // Wait 1.6s and verify we weren't bounced to a Sign-In modal or Login URL before marking added!
      setTimeout(() => {
        if (isOnLoginPage() || hasSignInPromptModal() || (window.location.href !== urlBeforeClick && !isOnSearchPage())) {
          chrome.runtime.sendMessage({ type: 'P2P_PAUSE_FOR_LOGIN' });
          btnAddNext.disabled = false;
          statusEl.textContent = `Sign in required — your ${remainingCount} items are saved! Finish signing in, then click Resume.`;
          btnAddNext.textContent = `Resume (${remainingCount} left) →`;
          btnAddNext.onclick = () => chrome.runtime.sendMessage({ type: 'P2P_RESUME_SHOPPING' });
          return;
        }
        advance('added');
      }, 1600);
    };

    btnAddNext.onclick = doClickAndAdvance;

    if (session.autoAdd) {
      statusEl.textContent = `Matched: "${matchName || 'Top result'}" — adding automatically in 1.2s...`;
      let aborted = false;
      const cancelAuto = () => {
        aborted = true;
      };
      document.getElementById('p2p-btn-stop')?.addEventListener('click', cancelAuto);
      document.getElementById('p2p-btn-skip')?.addEventListener('click', cancelAuto);

      setTimeout(() => {
        if (!aborted) doClickAndAdvance();
      }, 1200);
    } else {
      statusEl.textContent = `Highlighted match: "${matchName || 'Top result'}". Click Add & Next or choose another product.`;
    }
  }

  initSupermarketAssistant();
})();
