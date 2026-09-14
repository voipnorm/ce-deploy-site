-- Run after migration; reads production only and changes no production data.
do $$
declare r text; n text; payload jsonb; cnt bigint; d integer; cols text; begin
 foreach r in array array['anon','authenticated'] loop
  foreach n in array array['installations','installation_snapshots','ingest_daily_counters','telemetry_activity_summary','telemetry_daily_trend','telemetry_version_adoption','telemetry_endpoint_summary','telemetry_observation_sources','telemetry_data_quality'] loop
   if has_table_privilege(r,'public.'||n,'select') then raise exception 'Privacy failure: % can select %',r,n; end if;
  end loop;
  if has_function_privilege(r,'public.telemetry_dashboard(integer)','execute') then raise exception 'RPC exposed to %',r; end if;
 end loop;
 foreach n in array array['telemetry_activity_summary','telemetry_daily_trend','telemetry_version_adoption','telemetry_endpoint_summary','telemetry_observation_sources','telemetry_data_quality'] loop
  select string_agg(column_name,',') into cols from information_schema.columns where table_schema='public' and table_name=n;
  if cols ~ '(installation_id|token|digest|address|email|received_at)' then raise exception 'Raw field in %',n; end if;
  if not exists(select 1 from pg_class where oid=('public.'||n)::regclass and 'security_invoker=true'=any(reloptions)) then raise exception 'View security missing'; end if;
 end loop;
 foreach d in array array[1,7,30,90,180] loop
  payload:=public.telemetry_dashboard(d);
  select count(*) into cnt from public.installations where last_seen_at>=now()-make_interval(days=>d);
  if (payload#>>'{activity,active_installations}')::bigint<>cnt then raise exception 'Activity mismatch'; end if;
  select coalesce(sum(current_endpoint_count),0) into cnt from public.installations where last_seen_at>=now()-make_interval(days=>d);
  if (payload#>>'{endpoints,endpoint_reach}')::bigint<>cnt then raise exception 'Endpoint mismatch'; end if;
  if jsonb_array_length(payload->'daily')<>d then raise exception 'Missing daily buckets'; end if;
  if payload::text ~ '(installation_id|deletion_token|digest|email|received_at)' then raise exception 'Raw payload field'; end if;
 end loop;
 begin perform public.telemetry_dashboard(2); raise exception 'Unexpected valid window'; exception when raise_exception then if sqlerrm='Unexpected valid window' then raise; end if; end;
end $$;
select 'PASS: all windows, totals, privacy grants, invoker views, invalid window' as result;
