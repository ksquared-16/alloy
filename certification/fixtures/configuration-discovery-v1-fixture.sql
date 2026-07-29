-- =============================================================================
-- Configuration Discovery V1 — certification fixture (LOCAL CERT STACK ONLY)
--
-- Deterministic, namespaced, idempotent. Every row this creates uses the id prefix
-- `cdc10000-` so teardown is exact and can never touch seeded or unrelated data.
--
-- Target: the isolated `alloy-cert` stack (api :54421, db :54422). The credentials used
-- to run it are the local supabase defaults — non-secret by design, disposable, and never
-- connected to staging or production.
--
--   apply:    psql "$CERT_DB" -f certification/fixtures/configuration-discovery-v1-fixture.sql
--   teardown: psql "$CERT_DB" -f certification/fixtures/configuration-discovery-v1-teardown.sql
--
-- Re-running is safe: every statement is ON CONFLICT DO NOTHING / guarded, so a second run
-- produces no duplicate household, child, person, or role configuration.
-- =============================================================================

\set ON_ERROR_STOP on

\set org_id            '''00000000-0000-4000-8000-000000000001'''
\set customer_id       '''cdc10000-0000-4000-8000-000000000001'''
\set child_a_id        '''cdc10000-0000-4000-8000-00000000000a'''
\set child_b_id        '''cdc10000-0000-4000-8000-00000000000b'''
\set guardian_person   '''cdc10000-0000-4000-8000-000000000101'''
\set emergency_person  '''cdc10000-0000-4000-8000-000000000102'''
\set multirole_person  '''cdc10000-0000-4000-8000-000000000103'''

-- ── tenant configuration ─────────────────────────────────────────────────────────────────
-- Operational role keys the Relationship Definitions resolve against. The seeded tenant ships
-- NONE, and `loadActiveMemberContactRoleKeys` then falls back to
-- {guardian, emergency_contact, billing_contact, payer} — which does NOT contain
-- authorized_pickup. Without this, an authorized-pickup commit resolves to a null role and
-- silently writes no relationship rows, which would certify a false pass.
insert into public.customer_member_contact_roles (org_id, role_key, role_label, sort_order, is_active)
select :org_id::uuid, v.role_key, v.role_label, v.sort_order, true
from (values
    ('guardian',           'Guardian',           10),
    ('emergency_contact',  'Emergency Contact',  20),
    ('authorized_pickup',  'Authorized Pickup',  30),
    ('billing_contact',    'Billing Contact',    40)
) as v(role_key, role_label, sort_order)
where not exists (
    select 1 from public.customer_member_contact_roles r
    where r.org_id = :org_id::uuid and r.role_key = v.role_key
);

-- ── storage ──────────────────────────────────────────────────────────────────────────────
-- The cert stack ships no storage buckets, so document import 503s with
-- STORAGE_BUCKET_NOT_FOUND. `org_documents` is the default ADMIN_DOCUMENTS_BUCKET.
insert into storage.buckets (id, name, public)
select 'org_documents', 'org_documents', false
where not exists (select 1 from storage.buckets where id = 'org_documents');

-- ── household ────────────────────────────────────────────────────────────────────────────
insert into public.customers (id, org_id, name, customer_number, status_key)
select :customer_id::uuid, :org_id::uuid, 'CDV1 CERT Household',
       (select coalesce(max(customer_number), 0) + 9001 from public.customers), 'active'
where not exists (select 1 from public.customers where id = :customer_id::uuid);

-- ── two ACTIVE sibling children (sibling isolation needs a real sibling) ──────────────────
insert into public.customer_members (id, org_id, customer_id, display_name, relationship, is_active)
select :child_a_id::uuid, :org_id::uuid, :customer_id::uuid, 'CDV1 Child A', 'child', true
where not exists (select 1 from public.customer_members where id = :child_a_id::uuid);

insert into public.customer_members (id, org_id, customer_id, display_name, relationship, is_active)
select :child_b_id::uuid, :org_id::uuid, :customer_id::uuid, 'CDV1 Sibling B', 'child', true
where not exists (select 1 from public.customer_members where id = :child_b_id::uuid);

-- ── people ───────────────────────────────────────────────────────────────────────────────
-- guardian: an EXISTING person the submission links rather than creates
insert into public.persons (id, org_id, first_name, last_name, full_name, email, phone, person_number)
select :guardian_person::uuid, :org_id::uuid, 'Dana', 'CDV1Guardian', 'Dana CDV1Guardian',
       'dana.guardian@cdv1.invalid', '5550100',
       (select coalesce(max(person_number), 0) + 9001 from public.persons)
where not exists (select 1 from public.persons where id = :guardian_person::uuid);

-- multi-role: the SAME canonical Person who will hold guardian + authorized pickup
insert into public.persons (id, org_id, first_name, last_name, full_name, email, phone, person_number)
select :multirole_person::uuid, :org_id::uuid, 'Sam', 'CDV1MultiRole', 'Sam CDV1MultiRole',
       'sam.multirole@cdv1.invalid', '5550103',
       (select coalesce(max(person_number), 0) + 9002 from public.persons)
where not exists (select 1 from public.persons where id = :multirole_person::uuid);

-- emergency: created by the RESPONDENT during submission, so it is deliberately NOT
-- pre-created here. Its absence is what proves create-vs-link behaviour.

-- ── link the existing guardian to the household ──────────────────────────────────────────
insert into public.customer_persons (org_id, customer_id, person_id, role_type)
select :org_id::uuid, :customer_id::uuid, :guardian_person::uuid, 'guardian'
where not exists (
    select 1 from public.customer_persons
    where customer_id = :customer_id::uuid and person_id = :guardian_person::uuid
);

-- ── manifest ─────────────────────────────────────────────────────────────────────────────
select 'FIXTURE_MANIFEST' as marker,
       :org_id            as org_id,
       :customer_id       as customer_id,
       :child_a_id        as child_a_customer_member_id,
       :child_b_id        as child_b_customer_member_id,
       :guardian_person   as guardian_person_id,
       :multirole_person  as multirole_person_id;
