// P!nterest2Plate Companion — Pinterest Auto-Scroll & Diverse Pin Collector
(() => {
  let cancelled = false;
  let overlayEl = null;

  function showOverlay(text, onStop) {
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.id = 'p2p-pinterest-overlay';
      Object.assign(overlayEl.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '2147483647',
        background: '#1C1917',
        color: '#FAF7F2',
        padding: '12px 16px',
        borderRadius: '16px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        border: '1px solid rgba(255,255,255,0.14)',
      });
      document.body.appendChild(overlayEl);
    }

    overlayEl.innerHTML = '';
    const dot = document.createElement('span');
    Object.assign(dot.style, {
      width: '9px',
      height: '9px',
      borderRadius: '999px',
      background: '#D93B22',
      flexShrink: '0',
    });
    const label = document.createElement('span');
    label.textContent = text;
    label.style.fontWeight = '600';

    overlayEl.appendChild(dot);
    overlayEl.appendChild(label);

    if (onStop) {
      const stopBtn = document.createElement('button');
      stopBtn.textContent = 'Stop & Send';
      Object.assign(stopBtn.style, {
        background: '#D93B22',
        color: '#fff',
        border: 'none',
        borderRadius: '9px',
        padding: '5px 10px',
        fontSize: '11px',
        fontWeight: '700',
        cursor: 'pointer',
      });
      stopBtn.onclick = onStop;
      overlayEl.appendChild(stopBtn);
    }
  }

  function removeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function upgradeImageUrl(src) {
    if (!src) return '';
    return src.replace('/236x/', '/736x/').replace('/474x/', '/736x/');
  }

  function harvestVisiblePins(pinMap) {
    const anchors = document.querySelectorAll('a[href*="/pin/"]');
    for (const a of anchors) {
      const href = a.href ? a.href.split('?')[0] : '';
      const idMatch = href.match(/\/pin\/([^/]+)/);
      if (!idMatch || !idMatch[1]) continue;

      const pinId = idMatch[1];
      if (pinMap.has(pinId)) continue;

      const card = a.closest('[data-test-id="pin"], [data-test-id="pinWrapper"], [role="listitem"]') || a.parentElement;
      const img = a.querySelector('img') || card?.querySelector('img[src*="pinimg.com"]');
      const video = card?.querySelector('video');
      const imageUrl = upgradeImageUrl(img?.src || img?.getAttribute('data-src') || '');
      if (!imageUrl) continue; // Skip nav/icon links without real pin imagery

      const altText = (img?.alt || a.getAttribute('aria-label') || '').trim();
      const videoSrc = video?.src || video?.querySelector('source')?.src || undefined;
      const hasVideoBadge = Boolean(
        video ||
          card?.querySelector('[data-test-id="pinrep-video-duration"], [aria-label*="video" i]'),
      );

      pinMap.set(pinId, {
        pinId,
        pinUrl: href.endsWith('/') ? href : `${href}/`,
        imageUrl,
        title: altText.slice(0, 120) || 'Pinterest Recipe Pin',
        description: altText,
        mediaType: videoSrc || hasVideoBadge ? 'video' : 'image',
        videoUrl: videoSrc && /^https?:\/\//i.test(videoSrc) ? videoSrc : undefined,
      });
    }
  }

  function getBoardName() {
    const h1 = document.querySelector('h1');
    const heading = h1?.textContent?.trim();
    if (heading && heading.length > 1 && heading.length < 80) return heading;
    return (document.title || 'Pinterest Board').replace(/\s*\|\s*Pinterest.*$/i, '').trim() || 'Pinterest Board';
  }

  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function collectPins({ scrollSteps = 8, sampleCount = 12 }) {
    cancelled = false;
    const isSinglePin = /\/pin\/[^/]+/i.test(window.location.pathname);

    if (isSinglePin) {
      const idMatch = window.location.pathname.match(/\/pin\/([^/]+)/);
      const pinId = idMatch ? idMatch[1] : `pin_${Date.now()}`;
      const mainImg =
        document.querySelector('[data-test-id="closeup-image"] img, img[src*="pinimg.com/originals"], img[src*="pinimg.com/736x"]') ||
        document.querySelector('img[src*="pinimg.com"]');
      const video = document.querySelector('video');
      const videoSrc = video?.src || video?.querySelector('source')?.src || undefined;
      const title =
        document.querySelector('h1')?.textContent?.trim() ||
        mainImg?.alt?.trim() ||
        document.title.replace(/\s*\|\s*Pinterest.*$/i, '').trim() ||
        'Pinterest Recipe Pin';

      return {
        ok: true,
        boardName: 'Clipped Pinterest Pin',
        scannedCount: 1,
        sentCount: 1,
        pins: [
          {
            pinId,
            pinUrl: window.location.href.split('?')[0],
            imageUrl: upgradeImageUrl(mainImg?.src || ''),
            title: title.slice(0, 120),
            description: mainImg?.alt?.trim() || '',
            mediaType: videoSrc ? 'video' : 'image',
            videoUrl: videoSrc && /^https?:\/\//i.test(videoSrc) ? videoSrc : undefined,
          },
        ],
      };
    }

    const pinMap = new Map();
    const boardName = getBoardName();
    harvestVisiblePins(pinMap);

    let lastHeight = 0;
    let stagnantCount = 0;

    for (let step = 1; step <= scrollSteps; step++) {
      if (cancelled) break;
      showOverlay(
        `P!nterest2Plate: Scanned ${pinMap.size} pins (scroll ${step}/${scrollSteps})...`,
        () => {
          cancelled = true;
        },
      );

      window.scrollBy({ top: Math.round(window.innerHeight * 1.45), behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 950));
      harvestVisiblePins(pinMap);

      const newHeight = document.documentElement.scrollHeight;
      if (newHeight === lastHeight) {
        stagnantCount++;
        if (stagnantCount >= 3) break; // Reached bottom of board
      } else {
        stagnantCount = 0;
        lastHeight = newHeight;
      }
    }

    removeOverlay();
    const allPins = Array.from(pinMap.values());
    if (allPins.length === 0) {
      return {
        ok: false,
        error: 'No pins detected on this page. Make sure you are viewing a Pinterest board or pin.',
      };
    }

    const sampled = shuffle(allPins).slice(0, Math.min(sampleCount, allPins.length));
    return {
      ok: true,
      boardName,
      scannedCount: allPins.length,
      sentCount: sampled.length,
      pins: sampled,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === 'P2P_CANCEL_COLLECT') {
      cancelled = true;
      removeOverlay();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'P2P_COLLECT_PINTEREST_PINS') {
      collectPins(message.payload || {}).then(sendResponse);
      return true;
    }
  });
})();
