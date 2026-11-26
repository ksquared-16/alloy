-- Documents authz_q1 — Forms / packet RESIDUE RESET (registered reconciliation qa_documents_forms_residue_reset).
--
-- Removes the synthetic Forms rows a hosted Documents QA run leaves behind, in QA Shared only:
--   (a) THE OPEN RUN's own Forms rows — every form / packet definition keyed qa_<run hex>_ (the drivers'
--       KEY_PREFIX, e.g. qa_8fb0e1ffabcf_d8f1), their versions, public links, packet items / sessions /
--       session items, and every submission of those forms (signatures and submission-document links
--       cascade with the submission);
--   (b) THE FROZEN PRIOR-RUN RESIDUE named below by id — the archived forms of the CLOSED runs
--       qar_4246ac22ece0 and qar_8fb0e1ffabcf, and with them the three child-only submissions
--       qar_4246ac22ece0 orphaned before the R5 repair (c727bac4…, 9bc7cb9b…, f19d3fd1…). Each form must
--       still carry its own run's key prefix and be inactive, or neither it nor its submissions is touched;
--       a submission of such a form that is still bound to a subject makes the reset refuse. A closed run's id can never be supplied: the runner's :qa_run_id is the
--       lane's OPEN run, resolved by Vacilando.
--
-- NEVER touches: person_health_facts (append-only; ended is the only product disposal), mutation_events /
-- workflow_events (retained audit), documents or storage objects (they leave through the audited document
-- delete — this refuses while a target submission still links one), the permanent QA structure, any
-- form not keyed with a closed-run or the open-run prefix, QA Secondary, or any other organization.
--
-- One transaction: a refusal or failure changes nothing. Deleted counts are printed as one JSON line
-- (forms_residue_reset_counts) for the runner to return as the governed result — the append-only audit
-- of the cleanup. The closed runs' results and census bindings are not amended; this is a new act.
\if :{?org}
\else
do $$ begin
  raise exception 'this fixture is applied to a governed organization: psql -v org=<uuid>. It does not choose a tenant for itself.';
end $$;
\endif
\if :{?qa_run_id}
\else
do $$ begin
  raise exception 'this fixture requires psql -v qa_run_id=<qar_…>. Cross-run contamination is refused.';
end $$;
\endif

-- QA Shared only (the registry's frozen context). Evaluated outside dollar quotes, where psql interpolates.
select (:'org' = '4acc9386-c485-486f-aa1f-05d83499d142') as qa_org_registered \gset
\if :qa_org_registered
\else
do $$ begin
  raise exception 'organization is not QA Shared';
end $$;
\endif

-- The open run's key prefix, derived from its id (qar_<12 hex> → qa_<12 hex>_), never supplied.
select (:'qa_run_id' ~ '^qar_[0-9a-f]{12}$') as qa_run_id_wellformed \gset
\if :qa_run_id_wellformed
\else
do $$ begin
  raise exception 'qa_run_id must be qar_ followed by 12 lowercase hex characters';
end $$;
\endif
select 'qa_' || substr(:'qa_run_id', 5) || '_' as run_key_prefix \gset

-- Frozen prior-run residue (certification/qa-shared/documents-d7d8-repair-qa-plan-handoff.json and
-- certification/documents-v1/r125_forms_residue_census.qar_8fb0e1ffabcf.json). Literal, reviewed, pinned.
\set prior_form_ids '{01c4bf36-39ea-4ab8-8966-8fd850e381fe,6a565dc9-fab7-4220-ada2-3d7b55036f26,7e36208b-5250-407c-bb90-31e80adfc277,6f2e664b-97a2-464b-b3ac-405c7810bbcb,8dd68ff9-fad9-49c1-8bda-e998571faddf}'
\set prior_key_prefixes '{qa_4246ac22ece0_,qa_8fb0e1ffabcf_}'

begin;

-- The forms this reset may remove: the open run's, plus each frozen prior form that still has its own
-- closed run's prefix and is inactive (published forms are archived by the product, never left active).
create temporary table forms_reset_targets on commit drop as
select f.id
  from public.form_definitions f
 where f.org_id = :'org'::uuid
   and (
         left(f.key, length(:'run_key_prefix')) = :'run_key_prefix'
      or (f.id = any(:'prior_form_ids'::uuid[])
          and not f.is_active
          and exists (select 1 from unnest(:'prior_key_prefixes'::text[]) p(prefix) where left(f.key, length(p.prefix)) = p.prefix))
       );

create temporary table forms_reset_packets on commit drop as
select pd.id
  from public.form_packet_definitions pd
 where pd.org_id = :'org'::uuid
   and left(coalesce(pd.key, ''), length(:'run_key_prefix')) = :'run_key_prefix';

-- Submissions: every submission of a target form. A frozen prior form's submissions must all be the
-- child-only rows orphaned when their child was deleted (no subject left); one still bound to a subject
-- is not residue, and the reset refuses rather than delete it.
create temporary table forms_reset_submissions on commit drop as
select s.id
  from public.form_submissions s
 where s.org_id = :'org'::uuid
   and s.form_definition_id in (select id from forms_reset_targets);

select exists (
    select 1 from public.form_submissions s
     where s.org_id = :'org'::uuid
       and s.form_definition_id = any(:'prior_form_ids'::uuid[])
       and s.form_definition_id in (select id from forms_reset_targets)
       and (s.customer_member_id is not null or s.opportunity_id is not null or s.customer_id is not null or s.person_id is not null)
  ) as forms_prior_submission_bound \gset
\if :forms_prior_submission_bound
do $$ begin
  raise exception 'a closed run''s form submission is still bound to a subject; it is not residue, refusing';
end $$;
\endif

-- Documents must already be gone: SQL could delete their rows but never their storage objects.
select exists (
    select 1 from public.form_submission_documents sd
     where sd.form_submission_id in (select id from forms_reset_submissions)
  ) or exists (
    select 1 from public.form_submission_signatures sg
     where sg.form_submission_id in (select id from forms_reset_submissions)
       and sg.drawn_asset_document_id is not null
  ) as forms_documents_remaining \gset
\if :forms_documents_remaining
do $$ begin
  raise exception 'documents are still linked to the target form submissions; delete them through the audited document delete first';
end $$;
\endif

-- A packet item may pin a target form from a packet this reset does not own: refuse rather than reach it.
select exists (
    select 1 from public.form_packet_items pi
     where pi.form_definition_id in (select id from forms_reset_targets)
       and pi.packet_definition_id not in (select id from forms_reset_packets)
  ) as forms_foreign_packet_items \gset
\if :forms_foreign_packet_items
do $$ begin
  raise exception 'a packet this reset does not own uses a target form; refusing';
end $$;
\endif

-- Every DELETE below names its own run-prefix or frozen-id predicate (hosted-fixture-safety: a delete scoped
-- by organization alone is refused), and is counted from psql's ROW_COUNT.

-- Packet sessions of the run's packets, or started through a run form's public link (items first: RESTRICT).
delete from public.form_packet_session_items si
 where si.org_id = :'org'::uuid
   and si.packet_session_id in (
         select ps.id
           from public.form_packet_sessions ps
           left join public.form_packet_definitions pd on pd.id = ps.packet_definition_id
           left join public.form_public_links l on l.id = ps.started_via_public_link_id
           left join public.form_definitions f on f.id = l.form_definition_id
          where ps.org_id = :'org'::uuid
            and (left(coalesce(pd.key, ''), length(:'run_key_prefix')) = :'run_key_prefix'
                 or f.id in (select id from forms_reset_targets)));
\set n_packet_session_items :ROW_COUNT
delete from public.form_packet_sessions ps
 where ps.org_id = :'org'::uuid
   and (ps.packet_definition_id in (select pd.id from public.form_packet_definitions pd
                                     where pd.org_id = :'org'::uuid
                                       and left(coalesce(pd.key, ''), length(:'run_key_prefix')) = :'run_key_prefix')
        or ps.started_via_public_link_id in (select l.id from public.form_public_links l
                                              where l.form_definition_id in (select id from forms_reset_targets)));
\set n_packet_sessions :ROW_COUNT
delete from public.form_packet_items pi
 where pi.org_id = :'org'::uuid
   and pi.packet_definition_id in (select pd.id from public.form_packet_definitions pd
                                    where pd.org_id = :'org'::uuid
                                      and left(coalesce(pd.key, ''), length(:'run_key_prefix')) = :'run_key_prefix');
\set n_packet_items :ROW_COUNT
delete from public.form_packet_definitions pd
 where pd.org_id = :'org'::uuid
   and left(coalesce(pd.key, ''), length(:'run_key_prefix')) = :'run_key_prefix';
\set n_packet_definitions :ROW_COUNT

-- Submissions (signatures cascade; submission-document links were proven absent above).
delete from public.form_submissions s
 where s.org_id = :'org'::uuid
   and s.id in (select id from forms_reset_submissions)
   and (s.form_definition_id = any(:'prior_form_ids'::uuid[])
        or s.form_definition_id in (select f.id from public.form_definitions f
                                     where f.org_id = :'org'::uuid
                                       and left(f.key, length(:'run_key_prefix')) = :'run_key_prefix'));
\set n_submissions :ROW_COUNT

-- Public links and versions (both would cascade; deleted explicitly so they are counted), then definitions.
delete from public.form_public_links l
 where l.org_id = :'org'::uuid
   and l.form_definition_id in (select id from forms_reset_targets)
   and (l.form_definition_id = any(:'prior_form_ids'::uuid[])
        or l.form_definition_id in (select f.id from public.form_definitions f
                                     where f.org_id = :'org'::uuid
                                       and left(f.key, length(:'run_key_prefix')) = :'run_key_prefix'));
\set n_public_links :ROW_COUNT
delete from public.form_definition_versions v
 where v.org_id = :'org'::uuid
   and v.form_definition_id in (select id from forms_reset_targets)
   and (v.form_definition_id = any(:'prior_form_ids'::uuid[])
        or v.form_definition_id in (select f.id from public.form_definitions f
                                     where f.org_id = :'org'::uuid
                                       and left(f.key, length(:'run_key_prefix')) = :'run_key_prefix'));
\set n_form_versions :ROW_COUNT
delete from public.form_definitions f
 where f.org_id = :'org'::uuid
   and f.id in (select id from forms_reset_targets)
   and (left(f.key, length(:'run_key_prefix')) = :'run_key_prefix' or f.id = any(:'prior_form_ids'::uuid[]));
\set n_form_definitions :ROW_COUNT

commit;

select json_build_object(
    'forms_residue_reset_counts', json_build_object(
        'qa_run_id', :'qa_run_id',
        'run_key_prefix', :'run_key_prefix',
        'form_definitions', :n_form_definitions,
        'form_definition_versions', :n_form_versions,
        'form_public_links', :n_public_links,
        'form_submissions', :n_submissions,
        'form_packet_definitions', :n_packet_definitions,
        'form_packet_items', :n_packet_items,
        'form_packet_sessions', :n_packet_sessions,
        'form_packet_session_items', :n_packet_session_items,
        'person_health_facts', 0,
        'audit_rows', 0
    )
)::text as forms_residue_reset_result;
