begin;
-- Ordinary, on-demand aggregates. No raw rows are exposed to browser roles.
create or replace view public.telemetry_activity_summary with (security_invoker=true) as
select w.days, count(i.installation_id)::integer as active_installations,
 count(i.installation_id) filter (where i.first_seen_at >= now()-make_interval(days=>w.days))::integer as new_installations
from (values (1),(7),(30),(90),(180)) w(days)
left join public.installations i on i.last_seen_at >= now()-make_interval(days=>w.days)
group by w.days;

create or replace view public.telemetry_daily_trend with (security_invoker=true) as
select d.day::date as day, coalesce(sum(c.accepted_count),0)::integer as heartbeats
from generate_series((now() at time zone 'UTC')::date-179,(now() at time zone 'UTC')::date,interval '1 day') d(day)
left join public.ingest_daily_counters c on c.counter_date=d.day::date group by d.day;

create or replace view public.telemetry_version_adoption with (security_invoker=true) as
select w.days, i.app_version as version, i.release_channel::text as channel, count(*)::integer as installations
from (values (1),(7),(30),(90),(180)) w(days)
join public.installations i on i.last_seen_at >= now()-make_interval(days=>w.days)
group by w.days,i.app_version,i.release_channel;

create or replace view public.telemetry_endpoint_summary with (security_invoker=true) as
select w.days, count(i.current_endpoint_count)::integer as reporting_installations,
 coalesce(sum(i.current_endpoint_count),0)::bigint as endpoint_reach,
 percentile_cont(.5) within group(order by i.current_endpoint_count) as median,
 percentile_cont(.95) within group(order by i.current_endpoint_count) as p95
from (values (1),(7),(30),(90),(180)) w(days)
left join public.installations i on i.last_seen_at >= now()-make_interval(days=>w.days)
group by w.days;

create or replace view public.telemetry_observation_sources with (security_invoker=true) as
select w.days,i.endpoint_count_source::text as source,i.endpoint_count_confidence::text as confidence,count(*)::integer as installations
from (values (1),(7),(30),(90),(180)) w(days)
join public.installations i on i.last_seen_at >= now()-make_interval(days=>w.days)
group by w.days,i.endpoint_count_source,i.endpoint_count_confidence;

create or replace view public.telemetry_data_quality with (security_invoker=true) as
select w.days,
 count(i.installation_id) filter(where i.current_endpoint_count is null)::integer as missing_counts,
 count(i.installation_id) filter(where i.endpoint_count_confidence in ('partial','lower_bound','stale'))::integer as uncertain_counts,
 count(i.installation_id) filter(where i.app_version ~ '^41[.]')::integer as suspicious_versions
from (values (1),(7),(30),(90),(180)) w(days)
left join public.installations i on i.last_seen_at >= now()-make_interval(days=>w.days)
group by w.days;

do $$ declare n text; begin
 foreach n in array array['telemetry_activity_summary','telemetry_daily_trend','telemetry_version_adoption','telemetry_endpoint_summary','telemetry_observation_sources','telemetry_data_quality'] loop
  execute format('revoke all on public.%I from public, anon, authenticated',n);
  execute format('grant select on public.%I to service_role',n);
 end loop;
end $$;

create or replace function public.telemetry_dashboard(p_days integer default 30) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; begin
 if p_days not in (1,7,30,90,180) or p_days is null then raise exception 'Invalid reporting window'; end if;
 select jsonb_build_object(
  'days', p_days,
  'activity', (select to_jsonb(a)-'days' from public.telemetry_activity_summary a where a.days=p_days),
  'daily', (select coalesce(jsonb_agg(to_jsonb(d) order by d.day),'[]'::jsonb) from public.telemetry_daily_trend d where d.day >= (now() at time zone 'UTC')::date-(p_days-1)),
  'versions', (select coalesce(jsonb_agg(to_jsonb(v)-'days' order by v.installations desc,v.version,v.channel),'[]'::jsonb) from (select * from public.telemetry_version_adoption where days=p_days order by installations desc,version,channel limit 100) v),
  'versions_truncated', (select count(*)>100 from public.telemetry_version_adoption where days=p_days),
  'endpoints', (select to_jsonb(e)-'days' from public.telemetry_endpoint_summary e where e.days=p_days),
  'sources', (select coalesce(jsonb_agg(to_jsonb(s)-'days' order by s.installations desc,s.source,s.confidence),'[]'::jsonb) from public.telemetry_observation_sources s where s.days=p_days),
  'quality', (select to_jsonb(q)-'days' from public.telemetry_data_quality q where q.days=p_days)
 ) into result;
 return result;
end $$;
revoke all on function public.telemetry_dashboard(integer) from public,anon,authenticated;
grant execute on function public.telemetry_dashboard(integer) to service_role;
commit;
