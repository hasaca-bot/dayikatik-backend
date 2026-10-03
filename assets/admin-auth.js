(() => {
  window.escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  // Memory only: reloading the page requires login; no shared secret is shipped to browsers.
  let token = null;
  let expiresAt = 0;
  let eventsController = null;
  const nativeFetch = window.fetch.bind(window);
  window.adminSession = {
    active: () => !!token && Date.now() < expiresAt,
    async login(password) {
      window.adminSound.unlock(); // browsers allow audio only after a user action such as this login
      const response = await window.fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error(response.status === 503 ? 'Yönetici girişi yapılandırılmamış.' : 'Giriş başarısız. Şifrenizi kontrol edip tekrar deneyin.');
      const session = await response.json();
      token = session.token; expiresAt = session.expiresAt;
    },
    async logout() {
      eventsController?.abort();
      try { await window.fetch('/api/auth/logout', { method: 'POST' }); }
      finally { token = null; expiresAt = 0; window.reservationsData = []; window.ordersData = []; }
    },
    // Live updates without polling: holds one server-sent event stream open and calls
    // onChange('orders' | 'reservations') when a customer submits one, or 'resync' after a
    // reconnect (notices may have been missed). Waiting costs no database queries.
    async listen(onChange) {
      if (eventsController) return;
      const controller = eventsController = new AbortController();
      let delay = 2000;
      let connectedBefore = false;
      try {
        while (!controller.signal.aborted && window.adminSession.active()) {
          try {
            const response = await window.fetch('/api/admin/events', { signal: controller.signal, headers: { Accept: 'text/event-stream' } });
            if (!response.ok || !response.body) throw new Error('Live updates unavailable: ' + response.status);
            if (connectedBefore) onChange('resync');
            connectedBefore = true;
            delay = 2000;
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
              let end;
              while ((end = buffer.indexOf('\n\n')) >= 0) {
                const type = /^event: *(.+)$/m.exec(buffer.slice(0, end))?.[1];
                buffer = buffer.slice(end + 2);
                if (type === 'orders' || type === 'reservations') onChange(type);
              }
            }
          } catch (error) {
            if (controller.signal.aborted) break;
          }
          if (controller.signal.aborted || !window.adminSession.active()) break;
          // Reconnecting only reaches the web server; back off so an outage is not hammered.
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 2, 60000);
        }
      } finally {
        if (eventsController === controller) eventsController = null;
      }
    }
  };
  // Alert chime for new orders/reservations, generated with Web Audio (no sound file).
  // The on/off choice is remembered per browser.
  let audioContext = null;
  const soundKey = 'adminSoundEnabled';
  window.adminSound = {
    enabled() { try { return localStorage.getItem(soundKey) !== 'off'; } catch { return true; } },
    setEnabled(on) {
      try { localStorage.setItem(soundKey, on ? 'on' : 'off'); } catch {}
      if (on) window.adminSound.unlock();
    },
    unlock() {
      try {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return;
        audioContext = audioContext || new AudioCtor();
        if (audioContext.state === 'suspended') audioContext.resume();
      } catch {}
    },
    // Orders ring three rising notes, reservations two, so they can be told apart by ear.
    play(type) {
      if (!window.adminSound.enabled() || !audioContext) return false;
      try {
        if (audioContext.state === 'suspended') audioContext.resume();
        const notes = type === 'orders' ? [880, 1109, 1319] : [660, 880];
        const start = audioContext.currentTime + 0.02;
        notes.forEach((frequency, i) => {
          const osc = audioContext.createOscillator();
          const gain = audioContext.createGain();
          const at = start + i * 0.22;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(frequency, at);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
          osc.connect(gain).connect(audioContext.destination);
          osc.start(at);
          osc.stop(at + 0.22);
        });
        return true;
      } catch { return false; }
    }
  };

  window.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url || String(input), window.location.href);
    const apiOrigin = new URL(window.API_BASE || '/', window.location.href).origin;
    const isApi = url.origin === apiOrigin && url.pathname.startsWith('/api/');
    if (isApi) {
      const headers = new Headers(options?.headers || (input instanceof Request ? input.headers : undefined));
      headers.delete('Authorization');
      if (window.adminSession.active()) headers.set('Authorization', `Bearer ${token}`);
      options = { ...options, headers };
    }
    const response = await nativeFetch(input, options);
    if (isApi && response.status === 401 && token) {
      token = null; expiresAt = 0;
      eventsController?.abort();
      window.reservationsData = []; window.ordersData = [];
      document.getElementById('adminPanelOverlay')?.classList.remove('open');
      if (typeof window.openAdminLogin === 'function') window.openAdminLogin();
    }
    return response;
  };
})();
