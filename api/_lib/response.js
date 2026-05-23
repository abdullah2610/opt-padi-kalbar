// Web-standard Response helpers (Vercel Functions modern signature).

const BASE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8'
};

function merge(extra) {
  return { ...BASE_HEADERS, ...(extra ?? {}) };
}

export function ok(data, opts = {}) {
  const body = { success: true, data, ...(opts.meta ? { meta: opts.meta } : {}) };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: merge(opts.headers)
  });
}

export function fail(status, error, opts = {}) {
  const msg = typeof error === 'string' ? error : (error?.message ?? 'Internal error');
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: merge(opts.headers)
  });
}

export function methodNotAllowed(allowed) {
  return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
    status: 405,
    headers: merge({ Allow: allowed.join(', ') })
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: merge() });
}

export function getQuery(request) {
  const url = new URL(request.url);
  const out = {};
  for (const [k, v] of url.searchParams) out[k] = v;
  return out;
}
