export const OWNER = 'chris.norman@hotmail.com';
const windows = [1, 7, 30, 90, 180];
const channels = ['stable', 'beta', 'development', 'private-beta', 'public-beta'];
const sources = ['cloud_inventory', 'on_prem_inventory', 'deployment_scope', 'cached_inventory', 'unavailable'];
const confidences = ['complete', 'partial', 'lower_bound', 'stale', 'unavailable'];
function number(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw Error('invalid aggregate');
  return value;
}
function rows(value, limit) {
  if (!Array.isArray(value) || value.length > limit) throw Error('invalid aggregate');
  return value;
}
function category(value, allowed) { if (!allowed.includes(value)) throw Error('invalid category'); return value; }
// Explicit projection: even an accidental upstream schema expansion cannot leak raw data.
export function projectAggregate(data, days) {
  if (!data || data.days !== days) throw Error('invalid aggregate');
  return {
    days,
    activity: { active_installations: number(data.activity.active_installations), new_installations: number(data.activity.new_installations) },
    daily: rows(data.daily, 180).map(r => {
      if (typeof r.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) throw Error('invalid day');
      return { day: r.day, heartbeats: number(r.heartbeats) };
    }),
    versions: rows(data.versions, 100).map(r => {
      if (typeof r.version !== 'string' || r.version.length > 32 || !/^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/.test(r.version)) throw Error('invalid version');
      return { version: r.version, channel: category(r.channel, channels), installations: number(r.installations) };
    }),
    versions_truncated: data.versions_truncated === true,
    endpoints: {
      reporting_installations: number(data.endpoints.reporting_installations), endpoint_reach: number(data.endpoints.endpoint_reach),
      median: data.endpoints.median === null ? null : number(data.endpoints.median),
      p95: data.endpoints.p95 === null ? null : number(data.endpoints.p95),
    },
    sources: rows(data.sources, 25).map(r => ({ source: category(r.source, sources), confidence: category(r.confidence, confidences), installations: number(r.installations) })),
    quality: { missing_counts: number(data.quality.missing_counts), uncertain_counts: number(data.quality.uncertain_counts), suspicious_versions: number(data.quality.suspicious_versions) },
  };
}
export function createHandler({ authenticate, aggregate, origins = ['https://ce-deploy.voipnorm.com'], now = () => new Date().toISOString() }) {
  return async request => {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    if (origin && origins.includes(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
    const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !origins.includes(origin)) return response({ error: 'forbidden_origin' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization') || '');
    if (!match) return response({ error: 'unauthorized' }, 401);
    let user;
    try { user = await authenticate(match[1]); } catch { return response({ error: 'authentication_unavailable' }, 503); }
    if (!user) return response({ error: 'unauthorized' }, 401);
    if (user.is_anonymous || !user.email_confirmed_at || user.email?.toLowerCase() !== OWNER) return response({ error: 'forbidden' }, 403);
    if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
    let body;
    try {
      // Stream with a hard byte cap; Content-Length is not trusted.
      const reader = request.body?.getReader(); let length = 0; let input = '';
      if (reader) { const decoder = new TextDecoder(); while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > 128) { await reader.cancel(); throw Error(); } input += decoder.decode(value, { stream: true }); } input += decoder.decode(); }
      body = JSON.parse(input);
      if (!body || Object.keys(body).some(k => k !== 'days') || !windows.includes(body.days)) throw Error();
    } catch { return response({ error: 'invalid_request' }, 400); }
    try { return response({ ...projectAggregate(await aggregate(body.days), body.days), updated_at: now() }); }
    catch { return response({ error: 'dashboard_unavailable' }, 503); }
  };
}
