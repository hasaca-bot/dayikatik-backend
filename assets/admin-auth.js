(() => {
  window.escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  // Memory only: reloading the page requires login; no shared secret is shipped to browsers.
  let token = null;
  let expiresAt = 0;
  const nativeFetch = window.fetch.bind(window);
  window.adminSession = {
    active: () => !!token && Date.now() < expiresAt,
    async login(password) {
      const response = await window.fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
      });
      if (!response.ok) throw new Error(response.status === 503 ? 'Yönetici girişi yapılandırılmamış.' : 'Giriş başarısız. Şifrenizi kontrol edip tekrar deneyin.');
      const session = await response.json();
      token = session.token; expiresAt = session.expiresAt;
    },
    async logout() {
      try { await window.fetch('/api/auth/logout', { method: 'POST' }); }
      finally { token = null; expiresAt = 0; window.reservationsData = []; window.ordersData = []; }
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
      window.reservationsData = []; window.ordersData = [];
      document.getElementById('adminPanelOverlay')?.classList.remove('open');
      if (typeof window.openAdminLogin === 'function') window.openAdminLogin();
    }
    return response;
  };
})();
