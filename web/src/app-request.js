/** Same-origin JSON APIs protected by Access must return 401, not a CORS login redirect. */
export async function appRequest(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store', credentials: 'same-origin', redirect: 'manual',
    signal: AbortSignal.timeout(20000), ...options,
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...options.headers },
  });
  if (response.status === 401 || response.type === 'opaqueredirect' || response.redirected) {
    throw Object.assign(new Error('SIGN_IN_REQUIRED'), { status: 401 });
  }
  if (!response.ok) {
    let data = {}; try { data = await response.json(); } catch { /* Non-JSON error pages retain their HTTP status. */ }
    throw Object.assign(new Error(data.error || 'SERVICE_UNAVAILABLE'), { status: response.status, details: data.details });
  }
  const type = response.headers?.get?.('content-type') || '';
  if (type.includes('text/html')) throw Object.assign(new Error('SIGN_IN_REQUIRED'), { status: 401 });
  return response.json();
}
