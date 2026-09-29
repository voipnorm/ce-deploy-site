begin;

-- Product telemetry aggregates are service-only. The browser receives their
-- bounded projection through internal-telemetry-dashboard, never these views.
create or replace view public.telemetry_product_activity_summary with (security_invoker=true) as
select w.days,
  count(distinct e.installation_id)::integer as active_installations,
  count(distinct e.session_id)::integer as sessions,
  count(e.event_id)::bigint as events
from (values (1),(7),(30),(90),(180)) w(days)
left join public.telemetry_events e on e.occurred_at >= now()-make_interval(days=>w.days)
group by w.days;

create or replace view public.telemetry_product_daily with (security_invoker=true) as
select (e.occurred_at at time zone 'UTC')::date as day,
  count(*)::bigint as events,
  count(distinct e.session_id)::integer as sessions,
  count(distinct e.installation_id)::integer as active_installations
from public.telemetry_events e
group by 1;

create or replace view public.telemetry_product_event_breakdown with (security_invoker=true) as
select w.days, e.event_name,
  count(*)::bigint as event_count,
  count(distinct e.installation_id)::integer as active_installations
from (values (1),(7),(30),(90),(180)) w(days)
join public.telemetry_events e on e.occurred_at >= now()-make_interval(days=>w.days)
group by w.days,e.event_name;

create or replace view public.telemetry_deployment_funnel_windows with (security_invoker=true) as
select w.days,
  count(distinct e.workflow_id) filter(where e.event_name='deployment_started')::integer as started,
  count(distinct e.workflow_id) filter(where e.event_name='deployment_completed')::integer as completed,
  count(distinct e.workflow_id) filter(where e.event_name='deployment_cancelled')::integer as cancelled,
  count(distinct e.workflow_id) filter(where e.event_name='deployment_gateway_timeout')::integer as gateway_timeout
from (values (1),(7),(30),(90),(180)) w(days)
left join public.telemetry_events e on e.occurred_at >= now()-make_interval(days=>w.days) and e.workflow_id is not null
group by w.days;

do $$ declare n text; begin
 foreach n in array array['telemetry_product_activity_summary','telemetry_product_daily','telemetry_product_event_breakdown','telemetry_deployment_funnel_windows'] loop
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
  'quality', (select to_jsonb(q)-'days' from public.telemetry_data_quality q where q.days=p_days),
  'product', jsonb_build_object(
    'activity', (select to_jsonb(a)-'days' from public.telemetry_product_activity_summary a where a.days=p_days),
    'daily', (select jsonb_agg(jsonb_build_object(
      'day', d.day::date, 'events', coalesce(t.events,0), 'sessions', coalesce(t.sessions,0),
      'active_installations', coalesce(t.active_installations,0)) order by d.day)
      from generate_series((now() at time zone 'UTC')::date-(p_days-1),(now() at time zone 'UTC')::date,interval '1 day') d(day)
      left join public.telemetry_product_daily t on t.day=d.day::date),
    'events', (select coalesce(jsonb_agg(to_jsonb(e)-'days' order by e.event_count desc,e.event_name),'[]'::jsonb)
      from (select * from public.telemetry_product_event_breakdown where days=p_days order by event_count desc,event_name limit 100) e),
    'events_truncated', (select count(*)>100 from public.telemetry_product_event_breakdown where days=p_days),
    'deployments', (select to_jsonb(f)-'days' from public.telemetry_deployment_funnel_windows f where f.days=p_days)
  )
 ) into result;
 return result;
end $$;

revoke all on function public.telemetry_dashboard(integer) from public,anon,authenticated;
grant execute on function public.telemetry_dashboard(integer) to service_role;

commit;
