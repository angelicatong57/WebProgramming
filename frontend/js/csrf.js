let cachedCsrfToken = null;

async function getCsrfToken() {
  if (cachedCsrfToken) return cachedCsrfToken;
  const response = await fetch('/api/auth/csrf', {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to get CSRF token (HTTP ${response.status})`);
  }
  const data = await response.json();
  cachedCsrfToken = data.csrfToken;
  return cachedCsrfToken;
}

async function csrfFetch(url, options = {}) {
  const opts = { ...options };
  const method = String(opts.method || 'GET').toUpperCase();

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const token = await getCsrfToken();
    opts.headers = { ...(opts.headers || {}), 'x-csrf-token': token };
  }

  opts.credentials = opts.credentials || 'include';
  return fetch(url, opts);
}

window.getCsrfToken = getCsrfToken;
window.csrfFetch = csrfFetch;
