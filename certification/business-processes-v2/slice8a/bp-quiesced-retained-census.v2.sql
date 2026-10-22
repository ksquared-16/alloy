-- Business Processes bp_v2 — QUIESCED_RETAINED census, v2 (read-only).
-- Proposed replacement for the registered certification/qa-shared/bp-quiesced-retained-census.sql:
-- the same questions (bp_qr_00, bp_qr_pool_access, bp_qr_zero_sent and the data rows), plus the
-- FINANCIAL QUIESCENCE checks (bp_qr_fin_*) that make "posted financial records ... neutralized and
-- attributed by run" a measured claim rather than a label. Definition and evidence:
-- certification/business-processes-v2/slice8a/FINANCIAL-QUIESCENCE.md.
--
-- Every check is ORG-WIDE over QA Shared (stronger than run-scoped: a bp_v2 run is aggregate-exclusive
-- on the org, so any residue is either this run's or an earlier run's, and both must be quiesced).
-- Financial rows are RETAINED: nothing here asserts that a charge, payment or variance is absent, only
-- that none is LIVE — collectable, owed, awaiting a decision, scheduled, or unattributable.
select question_id, kind, payload
from (
    select 'bp_qr_00'::text as question_id, 'data'::text as kind,
           json_build_object(
               'qa_shared', '4acc9386-c485-486f-aa1f-05d83499d142',
               'cleanup', 'quiesced_retained',
               'census_version', 2,
               'retained_by_design', array[
                 'posted financial records (immutable), neutralized and attributed by run',
                 'published process configuration',
                 'access audit history (mutation_events)'
               ]
           )::text as payload,
           '00'::text as sort_key
    union all
    -- EFFECTIVE persona access, not only memberships: a role, an access profile, or the site and
    -- department scope rows hung on a profile. A removed role that leaves its profile behind is residue
    -- (re-granting any role re-activates that scope). Excludes ONLY QA Shared's registered provisioning
    -- administrator (qa_shared_actor, by email) — not every admin, and not QA Secondary's administrator,
    -- who must never hold anything in QA Shared.
    select 'bp_qr_pool_access', 'check',
           'user_roles+user_access_profiles+user_site_access+user_department_access ~ qa_shared_non_actor ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from (
                    select ur.user_id from public.user_roles ur where ur.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                    union all
                    select ap.user_id from public.user_access_profiles ap where ap.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                    union all
                    select sa.user_id from public.user_site_access sa where sa.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                    union all
                    select da.user_id from public.user_department_access da where da.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                ) access
                where not exists (
                    select 1 from auth.users u
                    where u.id = access.user_id and lower(u.email) = lower('qa-shared-actor@example.com')
                )
              ), 'false'),
           '01'
    union all
    -- DURABLE send evidence, not the current status: a message that went out stays sent after it moves
    -- on to delivered, bounced, opened or failed. Outbound only — an inbound message is not a send.
    select 'bp_qr_zero_sent', 'check',
           'communication_messages ~ outbound_send_evidence ~ zero ~ '
           || coalesce((
                select (count(*) = 0)::text
                from public.communication_messages cm
                where cm.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                  and cm.direction = 'outbound'
                  and (cm.sent_at is not null
                       or cm.delivered_at is not null
                       or cm.opened_at is not null
                       or cm.clicked_at is not null
                       or cm.replied_at is not null
                       or cm.provider_message_id is not null
                       or cm.status in ('sent', 'delivered', 'bounced', 'opened', 'clicked', 'complained'))
              ), 'false'),
           '02'
    union all
    select 'bp_qr_org_present', 'data',
           json_build_object(
               'qa_shared_present', (select exists(select 1 from public.orgs where id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid))
           )::text,
           '03'
    union all
    -- Every check below reads zero for an org that does not exist: a wrong id must not read as clean.
    select 'bp_qr_org_exists', 'check',
           'orgs ~ qa_shared ~ present ~ '
           || (select exists(select 1 from public.orgs where id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid))::text,
           '04'

    /* ── NO REAL COLLECTION CAN START ─────────────────────────────────────────────────────────────
       Every provider money path (collect, autopay, refund) needs a merchant binding, a usable stored
       method, an autopay authorization or an earlier provider attempt. None may exist in QA Shared. */
    union all
    select 'bp_qr_fin_no_merchant', 'check',
           'payment_provider_merchants ~ any ~ zero ~ '
           || coalesce((select (count(*) = 0)::text from public.payment_provider_merchants
                         where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid), 'false'),
           '10'
    union all
    select 'bp_qr_fin_no_usable_method', 'check',
           'payment_methods ~ usable ~ zero ~ '
           || coalesce((select (count(*) = 0)::text from public.payment_methods
                         where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and usability_state = 'usable'), 'false'),
           '11'
    union all
    select 'bp_qr_fin_no_autopay', 'check',
           'payment_autopay_arrangements ~ active_or_paused ~ zero ~ '
           || coalesce((select (count(*) = 0)::text from public.payment_autopay_arrangements
                         where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and status in ('active', 'paused')), 'false'),
           '12'
    union all
    -- A provider attempt is what a refund and the reconciliation sweep act on, and what feeds
    -- payment_exceptions. A provider-attributed payment or refund means money moved through a provider.
    select 'bp_qr_fin_no_provider_activity', 'check',
           'payment_collection_attempts+payment_provider_refunds+provider_payments ~ any ~ zero ~ '
           || coalesce((select ((
                    (select count(*) from public.payment_collection_attempts where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
                  + (select count(*) from public.payment_provider_refunds where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
                  + (select count(*) from public.payments where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                       and (processor is not null or processor_transaction_id is not null))
                ) = 0)::text), 'false'),
           '13'

    /* ── NOTHING WILL ACT LATER ───────────────────────────────────────────────────────────────────
       The scheduled-work clock runs every handler whose row is active: periodic tuition generation,
       future-period posting, autopay, period close. No Financials or Payments schedule may be live. */
    union all
    select 'bp_qr_fin_no_active_schedule', 'check',
           'scheduled_work ~ financials_or_payments_active ~ zero ~ '
           || coalesce((select (count(*) = 0)::text from public.scheduled_work
                         where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and is_active
                           and (handler_key like 'financials.%' or handler_key like 'payments.%')), 'false'),
           '14'

    /* ── NOTHING IS ACTIONABLE ────────────────────────────────────────────────────────────────────
       charges_needing_review (draft under review or failed post) and future-period auto-posting both
       read drafts: none may remain (charge.cancel_draft retains them as `void`). */
    union all
    select 'bp_qr_fin_no_draft', 'check',
           'charges ~ draft ~ zero ~ '
           || coalesce((select (count(*) = 0)::text from public.charges
                         where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and status = 'draft'), 'false'),
           '15'
    union all
    -- payments_due / overdue_payments, NOW AND LATER (no date filter): a positive owed charge that is
    -- neither reversed (charge.reverse) nor fully covered by active applications of posted payments.
    -- Deliberately stricter than the Financials residual: a reduction does not count as covered here,
    -- so a QA run quiesces by reversal or payment and the census never re-derives a balance.
    select 'bp_qr_fin_no_open_balance', 'check',
           'charges ~ owed_unreversed_uncovered ~ zero ~ '
           || coalesce((select (count(*) = 0)::text from public.charges c
                where c.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                  and c.status in ('posted', 'partially_paid')
                  and c.amount_cents > 0
                  and coalesce(c.metadata->>'correction_kind', '') <> 'reversal'
                  and not exists (
                      select 1 from public.charges r
                      where r.org_id = c.org_id and r.source_charge_id = c.id
                        and r.metadata->>'correction_kind' = 'reversal' and r.status <> 'void')
                  and c.amount_cents > coalesce((
                      select sum(pa.allocated_amount_cents) from public.payment_allocations pa
                      join public.payments p on p.id = pa.payment_id and p.status = 'posted'
                      where pa.org_id = c.org_id and pa.charge_id = c.id and pa.status = 'active'), 0)
              ), 'false'),
           '16'
    union all
    select 'bp_qr_fin_no_open_variance', 'check',
           'financial_subsidy_variances ~ unresolved ~ zero ~ '
           || coalesce((select (count(*) = 0)::text from public.financial_subsidy_variances
                         where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and resolution_kind is null), 'false'),
           '17'
    union all
    -- Unapplied money in an account is settled against the NEXT run's charges and would move its
    -- assertions. Every posted inbound payment is fully applied or fully refunded.
    select 'bp_qr_fin_no_unapplied_money', 'check',
           'payments ~ inbound_posted_unapplied ~ zero ~ '
           || coalesce((select (count(*) = 0)::text from public.payments p
                where p.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                  and p.direction = 'inbound' and p.status = 'posted'
                  and p.amount_cents
                      - coalesce((select sum(pa.allocated_amount_cents) from public.payment_allocations pa
                                  where pa.payment_id = p.id and pa.status = 'active'), 0)
                      - coalesce((select sum(o.amount_cents) from public.payments o
                                  where o.refunds_payment_id = p.id and o.status = 'posted'), 0) > 0
              ), 'false'),
           '18'

    /* ── EVERYTHING RETAINED IS ATTRIBUTABLE ──────────────────────────────────────────────────────
       Every retained financial row was written by a managed QA identity (qa-*@example.com). The run it
       belongs to is the QA run ledger's lease of that identity over [opened_at, closed_at]; a row with
       no actor (a scheduled job, a webhook, a public link) cannot be attributed and fails. */
    union all
    select 'bp_qr_fin_attributed', 'check',
           'charges+payments+variances ~ non_qa_actor ~ zero ~ '
           || coalesce((select (count(*) = 0)::text from (
                    select coalesce(c.created_by, c.posted_by) as actor from public.charges c
                     where c.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                    union all
                    select p.created_by from public.payments p
                     where p.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                    union all
                    select v.created_by from public.financial_subsidy_variances v
                     where v.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                ) a
                where a.actor is null
                   or not exists (select 1 from auth.users u
                                  where u.id = a.actor and lower(u.email) like 'qa-%@example.com')
              ), 'false'),
           '19'

    /* ── RETAINED BY DESIGN — reported, never asserted to zero ──────────────────────────────────── */
    union all
    select 'bp_qr_retained_financial', 'data',
           json_build_object(
               'artifact', 'posted financial records (immutable)',
               'status', 'retained_by_design',
               'not_residue', true,
               'qa_shared_charge_rows', (select count(*)::int from public.charges where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid),
               'by_status', (select coalesce(json_object_agg(status, n), '{}'::json) from (
                   select status, count(*)::int n from public.charges
                   where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid group by status) s),
               'reversal_rows', (select count(*)::int from public.charges
                   where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid and metadata->>'correction_kind' = 'reversal'),
               'payment_rows', (select count(*)::int from public.payments where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid),
               'variance_rows', (select count(*)::int from public.financial_subsidy_variances where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
           )::text,
           '30'
    union all
    -- Per-identity, per-day write counts: what a run's lease window is matched against.
    select 'bp_qr_retained_financial_actors', 'data',
           coalesce((select json_agg(json_build_object('email', email, 'day', day, 'rows', n) order by day, email)
              from (
                select u.email, a.at::date as day, count(*)::int n
                from (
                    select coalesce(created_by, posted_by) actor, created_at at from public.charges where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                    union all select created_by, created_at from public.payments where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                    union all select created_by, created_at from public.financial_subsidy_variances where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
                ) a left join auth.users u on u.id = a.actor
                group by u.email, a.at::date) x)::text, '[]'),
           '31'
    union all
    select 'bp_qr_retained_process_config', 'data',
           json_build_object(
               'artifact', 'published process configuration',
               'status', 'retained_by_design',
               'not_residue', true,
               'qa_shared_configuration_publication_rows', (select count(*)::int from public.configuration_publications
                   where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
           )::text,
           '32'
    union all
    select 'bp_qr_retained_audit', 'data',
           json_build_object(
               'artifact', 'access audit history (mutation_events)',
               'status', 'retained_by_design',
               'not_residue', true,
               'qa_shared_mutation_event_rows', (select count(*)::int from public.mutation_events
                   where org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid)
           )::text,
           '33'
) q
order by sort_key;
