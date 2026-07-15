\set ON_ERROR_STOP on
SET client_min_messages TO notice;
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF NOT cond THEN RAISE EXCEPTION 'CERT FAIL: %', msg; ELSE RAISE NOTICE 'PASS %', msg; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.raises(sql text, want text, msg text) RETURNS void LANGUAGE plpgsql AS
$$ DECLARE got text := NULL;
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN got := SQLSTATE || '|' || SQLERRM; END;
  IF got IS NULL THEN RAISE EXCEPTION 'CERT FAIL (no error): %', msg;
  ELSIF want IS NOT NULL AND position(want in got) = 0 THEN RAISE EXCEPTION 'CERT FAIL (got [%] want [%]): %', got, want, msg;
  ELSE RAISE NOTICE 'PASS %', msg; END IF;
END $$;

DO $CERT$
DECLARE
  org1 uuid; org2 uuid; u_admin uuid := gen_random_uuid(); u_noauth uuid := gen_random_uuid();
  a_lic uuid; a_inactive uuid; a_future uuid; asg uuid; asg_loc uuid;
  r jsonb; r2 jsonb; exp_binding uuid; exp_proposed uuid; exp_pred uuid; exp_ai uuid; n int;
BEGIN
  INSERT INTO public.orgs DEFAULT VALUES RETURNING id INTO org1;
  INSERT INTO public.orgs DEFAULT VALUES RETURNING id INTO org2;

  -- ===== Phase 4: catalog =====
  a_lic := public.upsert_operational_authority(org1,'licensing:ratio','Licensing ratio',null,'licensing',true,u_admin);
  PERFORM pg_temp.ok(a_lic IS NOT NULL, 'P4.1 authority created');
  -- unique per org
  PERFORM pg_temp.ok((SELECT public.upsert_operational_authority(org1,'licensing:ratio','x',null,'licensing',true,u_admin)) = a_lic, 'P4.2 unique key per org (upsert same id)');
  -- same key in another org allowed
  PERFORM pg_temp.ok(public.upsert_operational_authority(org2,'licensing:ratio','x',null,'licensing',true,u_admin) <> a_lic, 'P4.3 same key allowed cross-org');
  a_inactive := public.upsert_operational_authority(org1,'inactive:auth','Inactive',null,'operational',false,u_admin);
  a_future := public.upsert_operational_authority(org1,'future:auth','Future',null,'operational',true,u_admin);
  UPDATE public.operational_authorities SET effective_start = now() + interval '1 day' WHERE id = a_future;
  -- no executable behaviour column
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='operational_authorities' AND column_name IN ('rules','predicate','sql','handler')), 'P4.6 no executable rule column');

  -- ===== Phase 5: assignments =====
  asg := public.grant_operational_authority_assignment(org1,'licensing:ratio','human',u_admin::text,'organization',null,now()-interval '1 hour',null,u_admin);
  PERFORM pg_temp.ok(asg IS NOT NULL, 'P5.1 org-wide assignment granted');
  -- cross-org authority assignment fails (authority not governed in org2 for this key? it is; test ungoverned key)
  PERFORM pg_temp.raises(format('SELECT public.grant_operational_authority_assignment(%L,%L,%L,%L,%L,NULL,now(),NULL,%L)', org1,'ungoverned:key','human',u_admin::text,'organization',u_admin), '23503', 'P5.1b ungoverned authority assignment rejected');
  -- AI holder fails (CHECK)
  PERFORM pg_temp.raises(format('SELECT public.grant_operational_authority_assignment(%L,%L,%L,%L,%L,NULL,now(),NULL,%L)', org1,'licensing:ratio','ai','x','organization',u_admin), '23514', 'P5.4 AI holder assignment rejected');
  -- append-only: UPDATE/DELETE blocked
  PERFORM pg_temp.raises(format('UPDATE public.operational_authority_assignments SET status=%L WHERE id=%L', 'revoked', asg), '0A000', 'P5.8 assignment UPDATE blocked');
  PERFORM pg_temp.raises(format('DELETE FROM public.operational_authority_assignments WHERE id=%L', asg), '0A000', 'P5.9 assignment DELETE blocked');

  -- ===== resolver (Phase 5 cont.) =====
  PERFORM pg_temp.ok(public.resolve_held_operational_authority(org1,'human',u_admin::text,'licensing:ratio','subject_type','room',now()) = asg, 'RES holds (org-wide covers subject_type)');
  PERFORM pg_temp.ok(public.resolve_held_operational_authority(org1,'human',u_noauth::text,'licensing:ratio','subject_type','room',now()) IS NULL, 'RES other user does not hold');
  PERFORM pg_temp.ok(public.resolve_held_operational_authority(org1,'ai',u_admin::text,'licensing:ratio','subject_type','room',now()) IS NULL, 'RES AI never holds');
  PERFORM pg_temp.ok(public.resolve_held_operational_authority(org1,'human',u_admin::text,'inactive:auth','organization',null,now()) IS NULL, 'RES inactive authority not held');
  PERFORM pg_temp.ok(public.resolve_held_operational_authority(org1,'human',u_admin::text,'future:auth','organization',null,now()) IS NULL, 'RES future authority not effective');
  -- location-scoped assignment does not cross location
  asg_loc := public.grant_operational_authority_assignment(org1,'licensing:ratio','human',u_noauth::text,'location','loc-A',now(),null,u_admin);
  PERFORM pg_temp.ok(public.resolve_held_operational_authority(org1,'human',u_noauth::text,'licensing:ratio','location','loc-A',now()) = asg_loc, 'RES location A holds');
  PERFORM pg_temp.ok(public.resolve_held_operational_authority(org1,'human',u_noauth::text,'licensing:ratio','location','loc-B',now()) IS NULL, 'RES location B not held');
  -- revoked assignment stops authorizing
  PERFORM public.revoke_operational_authority_assignment(org1, asg_loc, u_admin);
  PERFORM pg_temp.ok(public.resolve_held_operational_authority(org1,'human',u_noauth::text,'licensing:ratio','location','loc-A',now()) IS NULL, 'RES revoked assignment no longer holds');

  -- ===== Phase 6: self-ratifying authoring (RPC) =====
  r := public.author_operational_expectation(org1, u_admin, jsonb_build_object(
      'idempotency_key','a-held','payload_fingerprint','fp1','authority_key','licensing:ratio','author_class','human',
      'modality','required','subject_kind','room','subject_ref','["room-2"]'::jsonb,'condition','{"t":1}'::jsonb,
      'temporal_frame','{"kind":"window"}'::jsonb,'verb','create','standing','proposed','footprint','{"factTypes":["a"]}'::jsonb,
      'valid_from', now()::text,'authority_holder_id',u_admin::text,'authority_scope_type','subject_type','authority_scope_id','room'));
  exp_binding := (r->>'expectation_id')::uuid;
  PERFORM pg_temp.ok(r->>'standing' = 'binding' AND (r->>'self_ratified')::boolean, 'P6 held-authority human self-ratifies → binding');
  PERFORM pg_temp.ok((SELECT authority_assignment_id FROM public.operational_expectations WHERE id=exp_binding) = asg, 'P6 authority assignment evidence recorded on row');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.mutation_events WHERE subject_id=exp_binding AND command_key='author_expectation')=1, 'P6 one Authoring Act');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.mutation_events WHERE subject_id=exp_binding AND command_key='ratify_expectation')=0, 'P6 NO separate Ratification Act');
  -- no held authority → proposed
  r := public.author_operational_expectation(org1, u_noauth, jsonb_build_object('idempotency_key','a-none','payload_fingerprint','fp','authority_key','licensing:ratio','author_class','human','modality','required','subject_kind','room','subject_ref','["r"]'::jsonb,'condition','{}'::jsonb,'temporal_frame','{"kind":"w"}'::jsonb,'verb','create','standing','proposed','footprint','{"factTypes":["a"]}'::jsonb,'valid_from',now()::text,'authority_holder_id',u_noauth::text,'authority_scope_type','subject_type','authority_scope_id','room'));
  exp_proposed := (r->>'expectation_id')::uuid;
  PERFORM pg_temp.ok(r->>'standing'='proposed', 'P6 no held authority → proposed');
  -- ungoverned authority key → proposed (legacy claim cannot bind)
  r := public.author_operational_expectation(org1, u_admin, jsonb_build_object('idempotency_key','a-ungov','payload_fingerprint','fp','authority_key','ungoverned:x','author_class','human','modality','required','subject_kind','room','subject_ref','["r"]'::jsonb,'condition','{}'::jsonb,'temporal_frame','{"kind":"w"}'::jsonb,'verb','create','standing','proposed','footprint','{"factTypes":["a"]}'::jsonb,'valid_from',now()::text,'authority_holder_id',u_admin::text,'authority_scope_type','subject_type','authority_scope_id','room'));
  PERFORM pg_temp.ok(r->>'standing'='proposed', 'P6 ungoverned authority → proposed (never binds)');
  -- predicted → model
  r := public.author_operational_expectation(org1, u_admin, jsonb_build_object('idempotency_key','a-pred','payload_fingerprint','fp','authority_key','licensing:ratio','author_class','human','modality','predicted','subject_kind','room','subject_ref','["r"]'::jsonb,'condition','{}'::jsonb,'temporal_frame','{"kind":"w"}'::jsonb,'verb','create','standing','proposed','footprint','{"factTypes":["a"]}'::jsonb,'valid_from',now()::text,'authority_holder_id',u_admin::text,'authority_scope_type','subject_type','authority_scope_id','room'));
  PERFORM pg_temp.ok(r->>'standing'='model', 'P6 predicted → model');
  -- AI → proposed (never binds even holding)
  r := public.author_operational_expectation(org1, u_admin, jsonb_build_object('idempotency_key','a-ai','payload_fingerprint','fp','authority_key','licensing:ratio','author_class','ai','modality','required','subject_kind','room','subject_ref','["r"]'::jsonb,'condition','{}'::jsonb,'temporal_frame','{"kind":"w"}'::jsonb,'verb','create','standing','proposed','footprint','{"factTypes":["a"]}'::jsonb,'valid_from',now()::text,'authority_holder_id',u_admin::text,'authority_scope_type','subject_type','authority_scope_id','room'));
  PERFORM pg_temp.ok(r->>'standing'='proposed', 'P6 AI never binds → proposed');
  -- forgery resistance: even if caller passes standing=binding, RPC recomputes (no authority) → proposed
  r := public.author_operational_expectation(org1, u_noauth, jsonb_build_object('idempotency_key','a-forge','payload_fingerprint','fp','authority_key','licensing:ratio','author_class','human','modality','required','subject_kind','room','subject_ref','["r"]'::jsonb,'condition','{}'::jsonb,'temporal_frame','{"kind":"w"}'::jsonb,'verb','create','standing','binding','footprint','{"factTypes":["a"]}'::jsonb,'valid_from',now()::text,'authority_holder_id',u_noauth::text,'authority_scope_type','subject_type','authority_scope_id','room'));
  PERFORM pg_temp.ok(r->>'standing'='proposed', 'P6 forgery resistance: caller standing=binding ignored → proposed');
  -- recorded time server-assigned (authored_at set by trigger, not caller)
  PERFORM pg_temp.ok((SELECT authored_at FROM public.operational_expectations WHERE id=exp_binding) IS NOT NULL, 'P6 authored_at db-assigned');
  -- idempotent retry → same row, no new event
  r := public.author_operational_expectation(org1, u_admin, jsonb_build_object('idempotency_key','a-held','payload_fingerprint','fp1','authority_key','licensing:ratio','author_class','human','modality','required','subject_kind','room','subject_ref','["room-2"]'::jsonb,'condition','{"t":1}'::jsonb,'temporal_frame','{"kind":"window"}'::jsonb,'verb','create','standing','proposed','footprint','{"factTypes":["a"]}'::jsonb,'valid_from',now()::text,'authority_holder_id',u_admin::text,'authority_scope_type','subject_type','authority_scope_id','room'));
  PERFORM pg_temp.ok((r->>'expectation_id')::uuid = exp_binding AND (r->>'idempotent')::boolean, 'P8 authoring idempotent retry → same row');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.operational_expectations WHERE idempotency_key='a-held')=1, 'P8 authoring idempotent → one row');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.mutation_events WHERE subject_id=exp_binding AND command_key='author_expectation')=1, 'P8 authoring idempotent → one event');

  -- ===== Phase 7: explicit ratification =====
  -- sufficient held authority (u_admin org-wide) ratifies the proposed expectation
  r := public.ratify_operational_expectation(org1, u_admin, jsonb_build_object('idempotency_key','r1','payload_fingerprint','rf','expectation_id',exp_proposed::text));
  PERFORM pg_temp.ok(r->>'new_standing'='binding' AND r->>'disposition'='created', 'P7 sufficient authority ratifies → binding');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.operational_expectation_ratifications WHERE expectation_id=exp_proposed)=1, 'P7 one immutable ratification row');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.mutation_events WHERE subject_id=exp_proposed AND command_key='ratify_expectation')=1, 'P7 one Ratification Act');
  -- insufficient authority (u_noauth) → oe_insufficient_authority
  INSERT INTO public.operational_expectations (org_id, authority_key, author_class, modality, subject_kind, subject_ref, condition, temporal_frame, verb, standing, footprint, valid_from, idempotency_key, payload_fingerprint)
  VALUES (org1,'licensing:ratio','human','required','room','["r"]'::jsonb,'{}'::jsonb,'{"kind":"w"}'::jsonb,'create','proposed','{"factTypes":["a"]}'::jsonb, now(), 'exp-forins', 'fp') RETURNING id INTO exp_pred;
  PERFORM pg_temp.raises(format('SELECT public.ratify_operational_expectation(%L,%L,%L::jsonb)', org1, u_noauth, jsonb_build_object('idempotency_key','r-ins','payload_fingerprint','f','expectation_id',exp_pred::text)::text), '42501', 'P7 insufficient authority → oe_insufficient_authority');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.operational_expectation_ratifications WHERE expectation_id=exp_pred)=0, 'P7 insufficient → no ratification row');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.mutation_events WHERE subject_id=exp_pred AND command_key='ratify_expectation')=0, 'P7 insufficient → no event');
  -- ratification rows immutable
  PERFORM pg_temp.raises(format('UPDATE public.operational_expectation_ratifications SET rationale=%L WHERE expectation_id=%L','x',exp_proposed), '0A000', 'P7 ratification UPDATE blocked');
  PERFORM pg_temp.raises(format('DELETE FROM public.operational_expectation_ratifications WHERE expectation_id=%L',exp_proposed), '0A000', 'P7 ratification DELETE blocked');
  -- idempotent ratify retry → one row/event
  r := public.ratify_operational_expectation(org1, u_admin, jsonb_build_object('idempotency_key','r1','payload_fingerprint','rf','expectation_id',exp_proposed::text));
  PERFORM pg_temp.ok((r->>'idempotent')::boolean AND (SELECT count(*) FROM public.operational_expectation_ratifications WHERE expectation_id=exp_proposed)=1, 'P8 ratify idempotent → one row');

  RAISE NOTICE '=== ALL LIVE CERT ASSERTIONS PASSED ===';
END
$CERT$;
