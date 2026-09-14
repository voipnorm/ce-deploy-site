import { SUPABASE_URL, PUBLIC_KEY } from './telemetry-config';
const owner = 'chris.norman@hotmail.com';
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let token = '', email = '', days = 30, generation = 0, expiryTimer: ReturnType<typeof setTimeout>;
const status = (message: string) => { byId('status').textContent = message; };
function clearSession(message = '') {
  generation++; token = ''; clearTimeout(expiryTimer);
  byId('results').replaceChildren(); byId('dashboard').hidden = true; byId('auth-panel').hidden = false;
  byId('code-form').hidden = true; byId('email-form').hidden = false;
  byId<HTMLInputElement>('code').value = ''; byId('updated').textContent = 'No snapshot loaded'; status(message);
}
async function api(path: string, body?: unknown, auth?: string) {
  return fetch(SUPABASE_URL + path, { method: 'POST', cache: 'no-store', credentials: 'omit', headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
}
byId('email-form').addEventListener('submit', async event => {
  event.preventDefault(); email = byId<HTMLInputElement>('email').value.trim().toLowerCase();
  if (email !== owner) { status('This account is not authorized for the private dashboard.'); return; }
  const button = byId<HTMLButtonElement>('send-code'); button.disabled = true; const epoch = ++generation;
  status('Sending sign-in code…');
  try {
    const response = await api('/auth/v1/otp', { email, create_user: false });
    if (epoch !== generation) return;
    if (!response.ok) { status(response.status === 429 ? 'Too many requests. Wait before requesting another code.' : 'Could not send a code. Try again shortly.'); return; }
    byId('email-form').hidden = true; byId('code-form').hidden = false; byId('code').focus(); status('Check your email for the one-time code.');
  } catch { if (epoch === generation) status('Sign-in service unavailable. Check your connection and try again.'); }
  finally { button.disabled = false; }
});
byId('change-email').addEventListener('click', () => clearSession());
byId('code-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = byId<HTMLButtonElement>('verify-code'); button.disabled = true; const epoch = ++generation;
  status('Verifying sign-in…');
  try {
    const response = await api('/auth/v1/verify', { email, token: byId<HTMLInputElement>('code').value.trim(), type: 'email' });
    if (!response.ok) { if (epoch === generation) status('The code is invalid or expired. Try again or request a new code.'); return; }
    const session = await response.json();
    if (epoch !== generation) return;
    if (!session.access_token || session.user?.email?.toLowerCase() !== owner || !session.user?.email_confirmed_at) { clearSession('This account is not authorized.'); return; }
    token = session.access_token;
    const lifetime = Math.min(Number(session.expires_in) || 3600, 3600);
    expiryTimer = setTimeout(() => clearSession('Session expired. Sign in again.'), Math.max(0, lifetime - 10) * 1000);
    byId<HTMLInputElement>('code').value = ''; byId('auth-panel').hidden = true; byId('dashboard').hidden = false;
    await refresh();
  } catch { if (epoch === generation) status('Sign-in service unavailable. Try again.'); }
  finally { button.disabled = false; }
});
byId('sign-out').addEventListener('click', () => { const previous = token; clearSession('Signed out.'); void api('/auth/v1/logout?scope=local', {}, previous).catch(() => {}); });
window.addEventListener('pagehide', () => clearSession());
byId('refresh').addEventListener('click', refresh);
document.querySelectorAll<HTMLButtonElement>('[data-days]').forEach(button => button.addEventListener('click', () => {
  days = Number(button.dataset.days); document.querySelectorAll('[data-days]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); void refresh();
}));
function el(tag: string, text = '', className = '') { const e = document.createElement(tag); e.textContent = text; e.className = className; return e; }
const format = (n: number | null) => n === null ? 'Not available' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);
function metric(label: string, value: number | null, context: string) { const card = el('article', '', 'metric'); card.append(el('span', label), el('strong', format(value)), el('p', context)); return card; }
function panel(title: string) { const p = el('section', '', 'panel'); p.append(el('h2', title)); return p; }
function breakdown(title: string, entries: {label: string, value: number}[]) {
  const p = panel(title), total = entries.reduce((a, r) => a + r.value, 0);
  if (!entries.length) p.append(el('p', 'No observations in this window.'));
  for (const r of entries) { const row = el('div', '', 'bar-row'), label = el('div', '', 'bar-label'); label.append(el('span', r.label), el('span', format(r.value))); const bar = document.createElement('progress'); bar.max = total || 1; bar.value = r.value; bar.setAttribute('aria-label', `${r.label}: ${r.value} installations`); row.append(label, bar); p.append(row); }
  return p;
}
function trend(rows: {day:string,heartbeats:number}[]) {
  const p = panel('Daily accepted heartbeats · UTC');
  p.append(el('p','Accepted requests per day, not unique installations. Today is a partial UTC day.','small'));
  if (!rows.some(r => r.heartbeats)) p.append(el('p','No retained heartbeats in this window.'));
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox','0 0 700 240'); svg.classList.add('chart'); svg.setAttribute('role','img'); svg.setAttribute('aria-label','Daily heartbeat trend; exact values are available in the table below.');
  const max = Math.max(1,...rows.map(r=>r.heartbeats));
  const text = (x:number,y:number,value:string,anchor='start') => { const t = document.createElementNS(ns,'text'); t.setAttribute('x',String(x));t.setAttribute('y',String(y));t.setAttribute('text-anchor',anchor);t.textContent=value;svg.append(t); };
  [0,.5,1].forEach(v=>{ const line=document.createElementNS(ns,'line');line.setAttribute('x1','45');line.setAttribute('x2','680');line.setAttribute('y1',String(200-v*175));line.setAttribute('y2',String(200-v*175));svg.append(line);text(35,205-v*175,format(max*v),'end'); });
  const points=rows.map((r,i)=>[45+i*635/Math.max(1,rows.length-1),200-r.heartbeats/max*175]);
  const line=document.createElementNS(ns,'polyline');line.setAttribute('points',points.map(p=>p.join(',')).join(' '));svg.append(line);
  if(points.length===1){const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',String(points[0][0]));dot.setAttribute('cy',String(points[0][1]));dot.setAttribute('r','4');svg.append(dot);}
  if(rows.length){text(45,230,rows[0].day); if(rows.length>1)text(680,230,rows.at(-1)!.day,'end');}p.append(svg);
  const details=document.createElement('details');details.append(el('summary','View daily values'));const wrap=el('div','','table-wrap'),table=document.createElement('table');const head=document.createElement('thead');const hr=document.createElement('tr');hr.append(el('th','UTC date'),el('th','Accepted heartbeats'));head.append(hr);table.append(head);const body=document.createElement('tbody');rows.forEach(r=>{const tr=document.createElement('tr');tr.append(el('th',r.day),el('td',format(r.heartbeats)));body.append(tr);});table.append(body);wrap.append(table);details.append(wrap);p.append(details);return p;
}
function render(data: any) {
  const root=byId('results');root.replaceChildren();byId('empty').hidden=data.activity.active_installations!==0;
  const stats=el('div','','stats');stats.append(metric('Active installations',data.activity.active_installations,`Seen in the last ${days} day${days===1?'':'s'}`),metric('New installations',data.activity.new_installations,'First seen in this window'),metric('Endpoint reach',data.endpoints.endpoint_reach,`${data.endpoints.reporting_installations} installations reporting counts`),metric('Accepted heartbeats',data.daily.reduce((a:any,r:any)=>a+r.heartbeats,0),'Retained UTC daily counters'));
  const grid=el('div','','grid');grid.append(trend(data.daily),breakdown('Version / channel adoption',data.versions.map((r:any)=>({label:`${r.version} · ${r.channel}`,value:r.installations}))));
  const reach=panel('Endpoint observations');reach.append(el('p','Endpoint reach is the sum reported by active installations. The same endpoint can appear in more than one installation. This is not a unique-device count.'),el('p',`Median: ${format(data.endpoints.median)} · 95th percentile: ${format(data.endpoints.p95)}`),el('p','Counts may reflect partial, cached, or deployment-scope observations.','small'));
  grid.append(reach,breakdown('Observation sources / confidence',data.sources.map((r:any)=>({label:`${r.source.replaceAll('_',' ')} · ${r.confidence.replaceAll('_',' ')}`,value:r.installations}))));
  const warnings=panel('Data quality');warnings.classList.add('full');const list=el('ul','','warnings');
  const q=data.quality;
  if(q.missing_counts)list.append(el('li',`${q.missing_counts} active installations have no endpoint count. Missing counts are not zeros.`));
  if(q.uncertain_counts)list.append(el('li',`${q.uncertain_counts} installations report partial, lower-bound, or stale endpoint observations.`));
  if(q.suspicious_versions)list.append(el('li',`${q.suspicious_versions} installations report a 41.x version, which may be an Electron runtime version. Investigate in Supabase.`));
  if(data.versions_truncated)list.append(el('li','Version breakdown is limited to the top 100 version/channel combinations.'));
  if(!list.childElementCount)list.append(el('li','No flagged values in this window. This does not certify that all telemetry is complete.'));
  warnings.append(list,el('p','Retention or deletion can remove historical counters; missing days are shown as zero retained heartbeats. Rejected and malformed requests are not recorded in these aggregates and cannot be inferred from this chart.','small'));
  grid.append(warnings);root.append(stats,grid);byId('updated').textContent=`Fetched ${new Date(data.updated_at).toLocaleString()}`;
}
async function refresh() {
  if (!token) return; const epoch=++generation, requestedDays=days;
  byId('results').replaceChildren();byId('empty').hidden=true;byId('updated').textContent='Loading snapshot…';status('Loading aggregate telemetry…');
  try {
    const response=await api('/functions/v1/internal-telemetry-dashboard',{days:requestedDays},token);
    if(epoch!==generation)return;
    if(response.status===401){clearSession('Session expired. Sign in again.');return;}
    if(response.status===403){clearSession('Access denied. This account is not authorized.');return;}
    if(!response.ok)throw Error(); const data=await response.json(); if(epoch!==generation)return;
    render(data);status('');
  } catch {if(epoch===generation){byId('results').replaceChildren();byId('updated').textContent='Snapshot unavailable';status('Telemetry is temporarily unavailable. Use Refresh to retry.');}}
}
