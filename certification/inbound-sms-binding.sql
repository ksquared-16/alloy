-- Certification environment: the tenant's inbound SMS destination.
--
-- Inbound routing asks "which organization owns the number Twilio delivered to?"
-- and refuses to guess when nothing answers. The canonical seed declares no
-- provider binding at all, so without this every certification inbound would
-- quarantine as org-less — proving the quarantine works and nothing else.
--
-- Environment, not fixture: a fixture that creates environment state cannot tear
-- itself down without breaking the next run. Same reasoning as
-- environment-buckets.sql, and it lives beside it for the same reason.
--
-- `legacy_global_twilio` tells the backend to verify signatures with the process
-- TWILIO_AUTH_TOKEN, which under ALLOY_CERTIFICATION is a synthetic local-only
-- value. Signature verification is therefore genuinely exercised — the spec signs
-- with the same token — while no real Twilio credential exists anywhere.

insert into public.communication_provider_bindings
    (org_id, channel, provider, scope, inbound_to_e164, display_label, status, is_primary, secret_ref, config)
select
    o.id,
    'sms',
    'twilio',
    'org',
    '+15550001111',
    'Certification main line',
    'active',
    true,
    'legacy_global_twilio',
    '{}'::jsonb
from public.orgs o
where o.slug = 'northwind-early-learning'
on conflict (org_id, inbound_to_e164) where inbound_to_e164 is not null
do update set
    status = 'active',
    is_primary = true,
    secret_ref = 'legacy_global_twilio',
    provider = 'twilio',
    channel = 'sms',
    updated_at = now();

-- Two people in one organization sharing one phone number.
--
-- This is the same-org ambiguity case, and the canonical seed cannot produce it:
-- every seeded phone number is unique, so inbound resolution always finds exactly
-- one person and the ambiguity branch is unreachable. Without these two rows the
-- certification would report the ambiguity path green having never entered it.
--
-- Added as new rows rather than by repointing seeded people's numbers, so no
-- other specification's fixtures change underneath it.
insert into public.persons (id, org_id, full_name, first_name, last_name, phone, email)
select
    v.id::uuid,
    o.id,
    v.full_name,
    v.first_name,
    v.last_name,
    '+15557770002',
    v.email
from public.orgs o
cross join (values
    ('00000000-0000-4000-8000-900000000001', 'Cert Shared-Line A', 'Cert', 'Shared-Line A', 'cert.shared.a@northwind.invalid'),
    ('00000000-0000-4000-8000-900000000002', 'Cert Shared-Line B', 'Cert', 'Shared-Line B', 'cert.shared.b@northwind.invalid')
) as v(id, full_name, first_name, last_name, email)
where o.slug = 'northwind-early-learning'
on conflict (id) do update set
    phone = '+15557770002',
    updated_at = now();

-- Inbound EMAIL receiving identity for the certification tenant.
--
-- Same reasoning as the SMS destination above: inbound routing asks which
-- organization owns the address the mail was received for, and the canonical seed
-- declares none, so without this every certification email would quarantine as
-- org-less and prove only the quarantine.
--
-- The unique index on (provider, channel, lower(inbound_address)) has no org_id,
-- so this address can only ever belong to one tenant.
insert into public.communication_provider_bindings
    (org_id, channel, provider, scope, inbound_address, display_label, status, is_primary, secret_ref, config)
select
    o.id, 'email', 'resend', 'org',
    'hello@northwind-cert.invalid',
    'Certification inbound email',
    'active', true, 'env:RESEND_API_KEY', '{"from_email": "hello@northwind-cert.invalid"}'::jsonb
from public.orgs o
where o.slug = 'northwind-early-learning'
on conflict (provider, channel, lower(inbound_address)) where inbound_address is not null
do update set status = 'active', is_primary = true, updated_at = now();

-- A DISABLED receiving address, so certification can prove that a configured but
-- switched-off binding quarantines rather than delivering into a tenant that has
-- not turned receiving on.
insert into public.communication_provider_bindings
    (org_id, channel, provider, scope, inbound_address, display_label, status, is_primary, secret_ref, config)
select
    o.id, 'email', 'resend', 'org',
    'disabled@northwind-cert.invalid',
    'Certification disabled inbound email',
    'disabled', false, 'env:RESEND_API_KEY', '{}'::jsonb
from public.orgs o
where o.slug = 'northwind-early-learning'
on conflict (provider, channel, lower(inbound_address)) where inbound_address is not null
do update set status = 'disabled', updated_at = now();

-- The same two certification people also share an EMAIL address, so the
-- shared-household case can be certified on email as it is on SMS. Without it the
-- ambiguity branch is unreachable and certification would report it green having
-- never entered it.
update public.persons
set email = 'cert.shared@northwind.invalid', updated_at = now()
where id in (
    '00000000-0000-4000-8000-900000000001',
    '00000000-0000-4000-8000-900000000002'
);
