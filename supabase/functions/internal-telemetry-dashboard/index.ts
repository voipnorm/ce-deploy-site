declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
import { createHandler } from './handler.mjs';
const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_ANON_KEY')!;
Deno.serve(createHandler({
  authenticate: async (token: string) => {
    const response = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw Error('auth unavailable');
    return await response.json();
  },
  aggregate: async (days: number) => {
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const response = await fetch(`${base}/rest/v1/rpc/telemetry_dashboard`, {
      method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_days: days }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error('aggregate unavailable');
    return await response.json();
  },
}));
