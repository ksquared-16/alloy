-- ============================================================================================
-- WHAT REDUCED THIS FAMILY'S BILL, BY HOW MUCH, UNDER WHICH POLICY, AND WHO DECIDED.
--
-- Thread 7 made a month's GROSS tuition real. Thread 10 answers what legitimately reduces it —
-- and the answer must never be "we changed the tuition". Gross stays gross: a reduction is a
-- separate charge in the ledger (`charge_category` of discount / credit / adjustment, already
-- code-owned taxonomy), and the balance authority already sums those into responsibility.
--
-- What did NOT exist was the record of the DECISION behind that charge. A contra-revenue row for
-- -$150.00 described as "Sibling discount" is money without provenance: nobody can say which
-- authored policy produced it, what it was calculated on, whether it was capped, who approved it,
-- or whether re-running the month would produce it again. Six months later that is unanswerable,
-- and a family asking "why is my bill this number" is owed an answer.
--
-- ── WHY A NEW TABLE, WHEN `discount_applications` ALREADY EXISTS ──
--
-- Because that table belongs to a different vertical and cannot describe this concern. Its targets
-- are `customer_id / opportunity_id / job_id / customer_subscription_id` — no charge, no
-- obligation, no child, no service period — and its `discount_program_id` REFERENCES
-- `discount_programs`, the jobs/booking discount stack. Childcare discount policy is authored in
-- `commercial_policies`, which Commercial Execution doctrine names as the owner of resolution-time
-- policy (`discount`, `sibling_discount`, `waiver`). Pointing this record at `discount_programs`
-- would force a tenant to author childcare policy in the wrong system; adding four columns and
-- relaxing that FK would put two verticals' semantics in one table. Neither is reuse.
--
-- ── WHAT THIS TABLE IS NOT ──
--
-- Not a balance. `buildFinancialsCardVM` remains the single balance authority and reads CHARGES,
-- exactly as before — this table explains the reduction charges, it does not replace or re-total
-- them. Nothing here is summed to answer what a family owes.
-- ============================================================================================

create table if not exists public.financial_reduction_applications (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,

    -- POLICY or MANUAL. Both are legitimate reductions; only one of them has a policy to point at.
    reduction_kind text not null check (reduction_kind in ('policy', 'manual')),

    -- ON DELETE RESTRICT: a policy that produced money cannot be deleted out from under it.
    commercial_policy_id uuid references public.commercial_policies (id) on delete restrict,
    policy_kind text check (policy_kind in ('waiver', 'sibling_discount', 'discount')),
    /*
     * THE POLICY AS IT WAS, NOT AS IT IS. Editing a live policy must not rewrite what was already
     * applied, so the authored params and the config version travel with the application. This is
     * the same reason a posted charge's accounting period key is frozen on the row.
     */
    policy_snapshot jsonb not null default '{}'::jsonb,

    -- The reduction charge this record explains, and the gross charge it reduced.
    charge_id uuid not null references public.charges (id) on delete restrict,
    source_charge_id uuid references public.charges (id) on delete restrict,
    resolved_obligation_id uuid references public.resolved_obligations (id) on delete set null,

    -- Attribution: whose reduction it is. A family expense pinned to whichever sibling sorted first
    -- is the failure the childcare billing model exists to prevent.
    customer_member_id uuid references public.customer_members (id) on delete set null,
    customer_id uuid references public.customers (id) on delete set null,
    enrollment_agreement_id uuid references public.child_enrollment_agreements (id) on delete set null,

    -- The service period the reduction belongs to. Accounting attribution stays Thread 5's, derived
    -- from the charge; nothing here is a second period authority.
    period_key text,
    period_start date,
    period_end date,

    -- How the number was reached, so it can be re-derived rather than trusted.
    basis text check (basis in ('percentage', 'amount')),
    basis_value numeric,
    basis_amount_cents bigint,
    capped boolean not null default false,

    -- SIGNED, and non-zero. The direction money moves is stored, never inferred from a category.
    amount_cents bigint not null check (amount_cents <> 0),
    currency_code text not null default 'USD',

    explanation text,
    -- A manual reduction must say why. A policy one already has a policy to point at.
    reason text,

    /*
     * IDENTITY, so a retry is harmless and a race has a loser. `fred:<policyId>:<chargeId>` — the
     * charge is already child- and period-specific, so one key says both "not twice for this
     * obligation" and "yes for the next eligible period". Thread 7 learned the hard way that a
     * read-then-insert is not idempotency; this is a constraint.
     */
    idempotency_key text not null,

    -- Corrections append. A reduction is undone by a reversing application, never by a DELETE.
    reverses_id uuid references public.financial_reduction_applications (id) on delete restrict,
    reversed_by_id uuid references public.financial_reduction_applications (id) on delete set null,

    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- A policy application names its policy; a manual one names its reason. Neither is optional.
    constraint financial_reduction_applications_kind_chk check (
        (reduction_kind = 'policy' and commercial_policy_id is not null and policy_kind is not null)
        or (reduction_kind = 'manual' and nullif(btrim(coalesce(reason, '')), '') is not null)
    )
);

create unique index if not exists financial_reduction_applications_idempotency_unique
    on public.financial_reduction_applications (org_id, idempotency_key);

create index if not exists financial_reduction_applications_org_source_idx
    on public.financial_reduction_applications (org_id, source_charge_id);
create index if not exists financial_reduction_applications_org_member_period_idx
    on public.financial_reduction_applications (org_id, customer_member_id, period_key);
create index if not exists financial_reduction_applications_charge_idx
    on public.financial_reduction_applications (charge_id);

-- --------------------------------------------------------------------------------------------
-- RLS — the same three-policy shape `enrollment_pricing_terms` uses. Reading a reduction is
-- reading the family's money; applying one is an operational act: owner / admin / ops. Server
-- paths additionally require the `fin.write` / `fin.adjust` permission grant, which RLS does not
-- express and must not be mistaken for.
-- --------------------------------------------------------------------------------------------
alter table public.financial_reduction_applications enable row level security;

drop policy if exists financial_reduction_applications_select_org on public.financial_reduction_applications;
create policy financial_reduction_applications_select_org
    on public.financial_reduction_applications for select
    using (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid() and ur.org_id = financial_reduction_applications.org_id
    ));

drop policy if exists financial_reduction_applications_mutate_ops on public.financial_reduction_applications;
create policy financial_reduction_applications_mutate_ops
    on public.financial_reduction_applications for all
    using (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.org_id = financial_reduction_applications.org_id
          and ur.role = any (array['owner', 'admin', 'ops'])
    ));

drop policy if exists financial_reduction_applications_service_all on public.financial_reduction_applications;
create policy financial_reduction_applications_service_all
    on public.financial_reduction_applications for all
    using (auth.role() = 'service_role');

comment on table public.financial_reduction_applications is
    'Why a family owes less: the decision behind each discount / credit / adjustment charge — which '
    'authored policy or which operator, what it was calculated on, whether it was capped, and the '
    'identity that makes re-running the period harmless. Explains reduction charges; is never '
    'itself a balance.';
comment on column public.financial_reduction_applications.policy_snapshot is
    'The authored policy as it stood when this was applied. Editing the policy later must not '
    'rewrite money already reduced.';
comment on column public.financial_reduction_applications.amount_cents is
    'Signed, non-zero. A reduction is negative; the reversal of one is positive.';
