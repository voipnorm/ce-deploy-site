// Explicitly creates and removes one disposable Auth account. Never prints credentials or raw telemetry.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const cli = process.env.SUPABASE_CLI || '../CE-Deploy3.0/node_modules/.bin/supabase';
const keys = JSON.parse(execFileSync(cli,['projects','api-keys','--project-ref','qgnnceoecflhbimcmrya','--output','json','--reveal'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const anon=keys.find(k=>k.name==='anon').api_key, service=keys.find(k=>k.name==='service_role').api_key;
const base='https://qgnnceoecflhbimcmrya.supabase.co';
async function request(path,{method='GET',key=anon,token,body}={}){
 return fetch(base+path,{method,headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
}
let id;
try {
 for(const token of [undefined,'invalid-token']){
  const r=await request('/functions/v1/internal-telemetry-dashboard',{method:'POST',token,body:{days:30}});assert.equal(r.status,401);console.log('PASS hosted 401: '+(token?'invalid token':'missing token'));
 }
 const email=`dashboard-test-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
 const created=await request('/auth/v1/admin/users',{method:'POST',key:service,token:service,body:{email,password,email_confirm:true}});assert.equal(created.status,200);
 id=(await created.json()).id;assert.ok(id);
 const login=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});assert.equal(login.status,200);
 const jwt=(await login.json()).access_token;assert.ok(jwt);
 const denied=await request('/functions/v1/internal-telemetry-dashboard',{method:'POST',token:jwt,body:{days:30}});assert.equal(denied.status,403);console.log('PASS hosted 403: real authenticated non-owner');
 for(const token of [undefined,jwt]){
  for(const table of ['installations','installation_snapshots','ingest_daily_counters','telemetry_activity_summary','telemetry_daily_trend','telemetry_version_adoption','telemetry_endpoint_summary','telemetry_observation_sources','telemetry_data_quality']){
   const r=await request(`/rest/v1/${table}?select=*&limit=1`,{token});assert.ok([401,403].includes(r.status),`${table} unexpectedly readable`);
  }
  const r=await request('/rest/v1/rpc/telemetry_dashboard',{method:'POST',token,body:{p_days:30}});assert.ok([401,403].includes(r.status));
 }
 console.log('PASS hosted privacy: anonymous and authenticated direct table/view/RPC reads denied');
} finally {
 if(id){const cleanup=await request('/auth/v1/admin/users/'+id,{method:'DELETE',key:service,token:service});assert.ok(cleanup.ok,'Test Auth account cleanup required');console.log('Disposed of synthetic test account.');}
}
