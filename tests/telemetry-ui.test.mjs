import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Window } from 'happy-dom';
const page=readFileSync('src/pages/admin/telemetry.astro','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/\{\[1,7,30,90,180\][\s\S]*?\}\)/,'');
const source=readFileSync('src/scripts/telemetry.ts','utf8').replace("import { SUPABASE_URL, PUBLIC_KEY } from './telemetry-config';",'const SUPABASE_URL="https://project.supabase.co", PUBLIC_KEY="public-test-key";');
const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
const empty={days:30,updated_at:'2026-09-14T00:00:00Z',activity:{active_installations:0,new_installations:0},daily:[{day:'2026-09-14',heartbeats:0}],versions:[],endpoints:{reporting_installations:0,endpoint_reach:0,median:null,p95:null},sources:[],quality:{missing_counts:0,uncertain_counts:0,suspicious_versions:0}};
async function harness(t,dashboard=()=>new Response(JSON.stringify(empty))){
 const w=new Window({url:'https://ce-deploy.voipnorm.com/admin/telemetry/'});t.after(()=>w.happyDOM.close());w.document.write(page);let calls=[];
 w.fetch=async(url,opts)=>{calls.push({url,opts});if(url.includes('/logout'))return new Response('{}');if(url.includes('/otp'))return new Response('{}');if(url.includes('/verify'))return new Response(JSON.stringify({access_token:'test-user-session',expires_in:3600,user:{email:'chris.norman@hotmail.com',email_confirmed_at:'x'}}));return dashboard(url,opts);};
 w.eval(js);
 const tick=()=>new Promise(r=>setTimeout(r,10));
 const submit=async id=>{w.document.getElementById(id).dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();};
 const login=async()=>{w.document.getElementById('email').value='chris.norman@hotmail.com';await submit('email-form');w.document.getElementById('code').value='123456';await submit('code-form');};
 return {w,calls,submit,login,tick};
}
test('UI signed out: no aggregate request; wrong email does not send code',async t=>{const h=await harness(t);assert.equal(h.calls.length,0);h.w.document.getElementById('email').value='other@example.com';await h.submit('email-form');assert.equal(h.calls.length,0);assert.equal(h.w.document.getElementById('dashboard').hidden,true);});
test('UI empty state, null counts, no browser persistence, and sign-out clearing',async t=>{const h=await harness(t);await h.login();assert.equal(h.w.document.getElementById('empty').hidden,false);assert.match(h.w.document.getElementById('results').textContent,/Not available/);assert.equal(h.w.localStorage.length,0);assert.equal(h.w.sessionStorage.length,0);assert.equal(JSON.parse(h.calls[0].opts.body).create_user,false);h.w.document.getElementById('sign-out').click();assert.equal(h.w.document.getElementById('results').textContent,'');assert.equal(h.w.document.getElementById('dashboard').hidden,true);});
for(const code of [401,403,503])test(`UI handles API ${code} without showing data`,async t=>{const h=await harness(t,()=>new Response('{}',{status:code}));await h.login();assert.equal(h.w.document.getElementById('results').textContent,'');assert.match(h.w.document.getElementById('status').textContent,code===401?/Session expired/:code===403?/Access denied/:/temporarily unavailable/);});
test('UI ignores late aggregate response after sign out',async t=>{let finish;const h=await harness(t,()=>new Promise(r=>{finish=r;}));await h.login();h.w.document.getElementById('sign-out').click();finish(new Response(JSON.stringify(empty)));await h.tick();assert.equal(h.w.document.getElementById('results').textContent,'');assert.equal(h.w.document.getElementById('dashboard').hidden,true);});
