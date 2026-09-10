-- =============================================================================
-- Thread 5 — Kiosk certification fixtures
-- =============================================================================
-- Runs AFTER the search-platform and attendance fixtures, whose site, rooms,
-- household and all-week schedule pattern this file reuses.
--
-- ── WHY EVERY ROW HERE IS DELIBERATE ──
--
-- The kiosk scenarios are about REFUSAL as much as success, and a refusal proves
-- nothing unless the thing being refused positively exists. "Checkout was denied"
-- is worthless if the child was never eligible, the device was never trusted, or
-- the adult was never related. So each denial scenario is built as a near-miss:
-- everything present except the one fact under test.
--
--   D1 restricted   — full pickup role AND screening AND an active restriction
--   D3 unscreened   — full pickup role, no screening record at all
--   D5 role gap     — parent relationship, deliberately no authorized_pickup
--   E  wrong site   — a real child of the same adult, enrolled at the other site
--   I2 revoked      — a device that was trusted and is not any more
--   I3 no capability— a live device holding attendance.read and not .record
--
-- Idempotent: deterministic UUIDs in the fixture-owned range
-- (…-0000-4000-8000-00007xxxxxxx) with ON CONFLICT DO UPDATE.
--
-- Usage:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f certification/kiosk/01-kiosk-fixture.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE v_org uuid;
BEGIN
    SELECT id INTO v_org FROM public.orgs WHERE slug = 'northwind-early-learning';
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Kiosk fixtures require the synthetic certification tenant. Refusing to run.';
    END IF;
END $$;

-- A room at the second campus, so the out-of-site child is placed exactly as a
-- real child is rather than being a half-built record that fails for the wrong reason.
INSERT INTO public.locations (id, org_id, label, location_type, parent_location_id, is_active)
SELECT '00000000-0000-4000-8000-000070000001', o.id, 'Lakeside Room A', 'unit',
       '00000000-0000-4000-8000-000000000011', true
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET label = 'Lakeside Room A', is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Devices. Credentials are stored as SHA-256, exactly as production does; the
-- plaintexts live in the spec and are synthetic.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.attendance_kiosk_devices
    (id, org_id, site_location_id, producer_key, label, capabilities, credential_hash,
     credential_last_four, status, revoked_at)
SELECT v.id::uuid, o.id, v.site::uuid, v.pkey, v.label, v.caps::text[],
       encode(digest(v.secret, 'sha256'), 'hex'), right(v.secret, 4), v.status,
       -- The CHECK refuses a revoked row with no timestamp, and rightly: a
       -- revocation nobody can date is not an auditable act.
       CASE WHEN v.status = 'revoked' THEN now() END
FROM public.orgs o,
     (VALUES
        ('00000000-0000-4000-8000-000070000010', '00000000-0000-4000-8000-000000000010',
         'kiosk:cert:riverside-front-desk', 'Riverside front desk',
         '{attendance.record}', 'cert-kiosk-riverside-secret', 'active'),
        ('00000000-0000-4000-8000-000070000011', '00000000-0000-4000-8000-000000000011',
         'kiosk:cert:lakeside-front-desk', 'Lakeside front desk',
         '{attendance.record}', 'cert-kiosk-lakeside-secret', 'active'),
        -- Was trusted; is not now. Its secret still matches a row, which is the
        -- only way to prove revocation is checked rather than merely absent.
        ('00000000-0000-4000-8000-000070000012', '00000000-0000-4000-8000-000000000010',
         'kiosk:cert:retired-tablet', 'Retired tablet',
         '{attendance.record}', 'cert-kiosk-revoked-secret', 'revoked'),
        -- Live and trusted, and holds the READ capability only.
        ('00000000-0000-4000-8000-000070000013', '00000000-0000-4000-8000-000000000010',
         'kiosk:cert:display-only', 'Display-only tablet',
         '{attendance.read}', 'cert-kiosk-capless-secret', 'active')
     ) AS v(id, site, pkey, label, caps, secret, status)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET
    site_location_id = EXCLUDED.site_location_id,
    producer_key = EXCLUDED.producer_key,
    capabilities = EXCLUDED.capabilities,
    credential_hash = EXCLUDED.credential_hash,
    status = EXCLUDED.status,
    revoked_at = CASE WHEN EXCLUDED.status = 'revoked' THEN now() ELSE NULL END;

-- ─────────────────────────────────────────────────────────────────────────────
-- Adults, and the codes that identify them.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.persons (id, org_id, first_name, last_name, full_name)
SELECT v.id::uuid, o.id, v.first, v.last, v.first || ' ' || v.last
FROM public.orgs o,
     (VALUES
        ('00000000-0000-4000-8000-000070000020', 'Nadia', 'Okafor'),
        ('00000000-0000-4000-8000-000070000021', 'Priya', 'Raman'),
        ('00000000-0000-4000-8000-000070000022', 'Marcus', 'Hale')
     ) AS v(id, first, last)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.person_kiosk_codes (id, org_id, person_id, code_hash, status)
SELECT v.id::uuid, o.id, v.person::uuid, encode(digest(v.code, 'sha256'), 'hex'), 'active'
FROM public.orgs o,
     (VALUES
        ('00000000-0000-4000-8000-000070000040', '00000000-0000-4000-8000-000070000020', '10000001'),
        ('00000000-0000-4000-8000-000070000041', '00000000-0000-4000-8000-000070000021', '10000002'),
        ('00000000-0000-4000-8000-000070000042', '00000000-0000-4000-8000-000070000022', '10000003')
     ) AS v(id, person, code)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET code_hash = EXCLUDED.code_hash, status = 'active', revoked_at = NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Children. All in the Smith household so the customer/member/person triangle
-- the relationship trigger validates stays consistent.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.persons (id, org_id, first_name, last_name, full_name)
SELECT v.id::uuid, o.id, v.first, v.last, v.first || ' ' || v.last
FROM public.orgs o,
     (VALUES
        ('00000000-0000-4000-8000-000070000030', 'Leo', 'Okafor'),
        ('00000000-0000-4000-8000-000070000031', 'Mia', 'Okafor'),
        ('00000000-0000-4000-8000-000070000032', 'Ivy', 'Raman'),
        ('00000000-0000-4000-8000-000070000033', 'Theo', 'Hale'),
        ('00000000-0000-4000-8000-000070000034', 'Nils', 'Okafor'),
        ('00000000-0000-4000-8000-000070000035', 'Zara', 'Okafor')
     ) AS v(id, first, last)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.customer_members
    (id, org_id, customer_id, person_id, display_name, first_name, last_name, relationship, dob)
SELECT ('00000000-0000-4000-8000-0000700000' || v.suffix)::uuid, o.id,
       '00000000-0000-4000-8000-000050000001', v.person::uuid,
       v.first || ' ' || v.last, v.first, v.last, 'child', DATE '2021-06-01'
FROM public.orgs o,
     (VALUES
        ('50', '00000000-0000-4000-8000-000070000030', 'Leo', 'Okafor'),
        ('51', '00000000-0000-4000-8000-000070000031', 'Mia', 'Okafor'),
        ('52', '00000000-0000-4000-8000-000070000032', 'Ivy', 'Raman'),
        ('53', '00000000-0000-4000-8000-000070000033', 'Theo', 'Hale'),
        ('54', '00000000-0000-4000-8000-000070000034', 'Nils', 'Okafor'),
        ('55', '00000000-0000-4000-8000-000070000035', 'Zara', 'Okafor')
     ) AS v(suffix, person, first, last)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, person_id = EXCLUDED.person_id;

-- Enrollment agreements carry the SITE, which is what the kiosk scopes on. Zara
-- is at Lakeside; everyone else at Riverside.
INSERT INTO public.child_enrollment_agreements
    (id, org_id, customer_member_id, customer_id, person_id, site_location_id, status, start_date, source_key)
SELECT ('00000000-0000-4000-8000-0000700000' || v.suffix)::uuid, o.id,
       ('00000000-0000-4000-8000-0000700000' || v.member)::uuid,
       '00000000-0000-4000-8000-000050000001', v.person::uuid, v.site::uuid,
       'active', DATE '2026-01-05', 'kiosk_cert_fixture'
FROM public.orgs o,
     (VALUES
        ('60', '50', '00000000-0000-4000-8000-000070000030', '00000000-0000-4000-8000-000000000010'),
        ('61', '51', '00000000-0000-4000-8000-000070000031', '00000000-0000-4000-8000-000000000010'),
        ('62', '52', '00000000-0000-4000-8000-000070000032', '00000000-0000-4000-8000-000000000010'),
        ('63', '53', '00000000-0000-4000-8000-000070000033', '00000000-0000-4000-8000-000000000010'),
        ('64', '54', '00000000-0000-4000-8000-000070000034', '00000000-0000-4000-8000-000000000010'),
        ('65', '55', '00000000-0000-4000-8000-000070000035', '00000000-0000-4000-8000-000000000011')
     ) AS v(suffix, member, person, site)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET status = 'active', site_location_id = EXCLUDED.site_location_id;

INSERT INTO public.child_placements
    (id, org_id, enrollment_agreement_id, customer_member_id, site_location_id,
     room_location_id, start_date, status, source_key)
SELECT ('00000000-0000-4000-8000-0000700000' || v.suffix)::uuid, o.id,
       ('00000000-0000-4000-8000-0000700000' || v.agreement)::uuid,
       ('00000000-0000-4000-8000-0000700000' || v.member)::uuid,
       v.site::uuid, v.room::uuid, DATE '2026-01-05', 'active', 'kiosk_cert_fixture'
FROM public.orgs o,
     (VALUES
        ('70', '60', '50', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013'),
        ('71', '61', '51', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013'),
        ('72', '62', '52', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013'),
        ('73', '63', '53', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013'),
        ('74', '64', '54', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013'),
        ('75', '65', '55', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000070000001')
     ) AS v(suffix, agreement, member, site, room)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET status = 'active', room_location_id = EXCLUDED.room_location_id;

-- Schedule assignments on the all-week pattern so these children are EXPECTED on
-- whatever weekday certification happens to run.
INSERT INTO public.schedule_assignments
    (id, org_id, subject_type, customer_member_id, enrollment_agreement_id, site_location_id,
     room_location_id, schedule_pattern_id, start_date, status, assignment_kind, source_key,
     operational_assignment_type_id, is_primary, commitment_kind)
SELECT ('00000000-0000-4000-8000-0000700000' || v.suffix)::uuid, o.id, 'child',
       ('00000000-0000-4000-8000-0000700000' || v.member)::uuid,
       ('00000000-0000-4000-8000-0000700000' || v.agreement)::uuid,
       v.site::uuid, v.room::uuid, '00000000-0000-4000-8000-000050000069',
       DATE '2026-01-05', 'active', 'base', 'kiosk_cert_fixture',
       '00000000-0000-4000-8000-000050000062', true, 'committed'
FROM public.orgs o,
     (VALUES
        ('80', '50', '60', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013'),
        ('81', '51', '61', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013'),
        ('82', '52', '62', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013'),
        ('83', '53', '63', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013'),
        ('84', '54', '64', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000013')
        -- Zara has NO schedule assignment: the all-week cert pattern belongs to
        -- Riverside, and a pattern may not cross sites. She needs none — the kiosk's
        -- eligible set is built from ENROLMENT, not from today's roster, which is
        -- what makes her a clean out-of-site subject and a clean closed-site one.
     ) AS v(suffix, member, agreement, site, room)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- Relationships. Child-scoped, with roles that differ PER CHILD — which is the
-- whole point of scenario B2/D5.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.person_child_relationships
    (id, org_id, customer_id, customer_member_id, person_id, relationship_type, status)
SELECT ('00000000-0000-4000-8000-0000700000' || v.suffix)::uuid, o.id,
       '00000000-0000-4000-8000-000050000001',
       ('00000000-0000-4000-8000-0000700000' || v.member)::uuid, v.person::uuid, 'parent', 'active'
FROM public.orgs o,
     (VALUES
        ('90', '50', '00000000-0000-4000-8000-000070000020'),
        ('91', '51', '00000000-0000-4000-8000-000070000020'),
        ('92', '52', '00000000-0000-4000-8000-000070000021'),
        ('93', '53', '00000000-0000-4000-8000-000070000022'),
        ('94', '54', '00000000-0000-4000-8000-000070000020'),
        ('95', '55', '00000000-0000-4000-8000-000070000020')
     ) AS v(suffix, member, person)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET status = 'active';

-- Roles. Mia (…51) gets `parent` ONLY: her mother may drop her off and may not
-- collect her from a tablet. That asymmetry is deliberate and is scenario D5.
INSERT INTO public.person_child_relationship_roles (id, org_id, relationship_id, role_key, is_active)
SELECT ('00000000-0000-4000-8000-000070000' || v.suffix)::uuid, o.id,
       ('00000000-0000-4000-8000-0000700000' || v.rel)::uuid, v.role, true
FROM public.orgs o,
     (VALUES
        ('100', '90', 'parent'), ('101', '90', 'authorized_pickup'),
        ('102', '91', 'parent'),
        ('103', '92', 'parent'), ('104', '92', 'authorized_pickup'),
        ('105', '93', 'parent'), ('106', '93', 'authorized_pickup'),
        ('107', '94', 'parent'), ('108', '94', 'authorized_pickup'),
        ('109', '95', 'parent'), ('110', '95', 'authorized_pickup')
     ) AS v(suffix, rel, role)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Safeguarding. Ivy (…52) has NO screening row — that absence is the fixture, and
-- it must stay an absence rather than becoming a "false" somewhere.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.child_safeguarding_screenings
    (id, org_id, customer_member_id, screened_at, source, source_reference)
SELECT ('00000000-0000-4000-8000-000070000' || v.suffix)::uuid, o.id,
       ('00000000-0000-4000-8000-0000700000' || v.member)::uuid,
       now() - interval '30 days', 'enrollment_form', 'kiosk_cert_fixture'
FROM public.orgs o,
     (VALUES ('120', '50'), ('121', '51'), ('123', '53'), ('124', '54'), ('125', '55')) AS v(suffix, member)
WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET screened_at = EXCLUDED.screened_at;

-- Theo's father holds a full authorized_pickup role AND is barred. Both facts are
-- true at once, which is exactly what the resolver exists to adjudicate.
INSERT INTO public.child_safeguarding_restrictions
    (id, org_id, customer_member_id, affected_person_id, restriction_kind, operational_effect,
     status, effective_from, evidence_basis, source, review_state, reviewed_at)
SELECT '00000000-0000-4000-8000-000070000130', o.id,
       '00000000-0000-4000-8000-000070000053', '00000000-0000-4000-8000-000070000022',
       -- `operator_entry` rather than `document`: the CHECK requires a document
       -- basis to NAME a document, and inventing a fake evidence artifact to
       -- satisfy a fixture would be worse than recording the truth, which is that
       -- an operator entered this one.
       'protective_or_restraining_order', 'may_not_pick_up', 'active',
       CURRENT_DATE - 10, 'operator_entry', 'operator', 'approved', now()
FROM public.orgs o WHERE o.slug = 'northwind-early-learning'
ON CONFLICT (id) DO UPDATE SET status = 'active', review_state = 'approved';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Service-day expectations, rebuilt each run because they are dated to TODAY.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- Remove yesterday's fixture-authored expectations so the window is always today.
DELETE FROM public.operational_expectations
WHERE authority_key = 'kiosk_cert_fixture';

-- Nils (…54) is on authored vacation and will be brought in anyway — scenario G.
INSERT INTO public.operational_expectations
    (org_id, authority_key, author_class, modality, subject_kind, subject_ref, condition,
     temporal_frame, verb, transition_type, standing, footprint, valid_from, valid_to)
SELECT o.id, 'kiosk_cert_fixture', 'human', 'intended', 'child',
       jsonb_build_array(jsonb_build_object('kind', 'child', 'ref', '00000000-0000-4000-8000-000070000054')),
       jsonb_build_object('typeKey', 'attendance.service_day_exception',
                          'predicateShape', 'child_away',
                          'params', jsonb_build_object('reason_key', 'vacation')),
       jsonb_build_object('kind', 'window',
                          'validFrom', date_trunc('day', now() at time zone 'UTC')::text,
                          'validTo', (date_trunc('day', now() at time zone 'UTC') + interval '1 day')::text),
       'create', NULL, 'proposed', jsonb_build_object('factTypes', jsonb_build_array('child_attendance_event')),
       date_trunc('day', now() at time zone 'UTC'),
       date_trunc('day', now() at time zone 'UTC') + interval '1 day'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning';

-- Lakeside is CLOSED today — scenario J. Riverside is untouched, so every other
-- scenario keeps running on an ordinary open day.
INSERT INTO public.operational_expectations
    (org_id, authority_key, author_class, modality, subject_kind, subject_ref, condition,
     temporal_frame, verb, transition_type, standing, footprint, valid_from, valid_to)
SELECT o.id, 'kiosk_cert_fixture', 'human', 'prohibited', 'site',
       jsonb_build_array(jsonb_build_object('kind', 'site', 'ref', '00000000-0000-4000-8000-000000000011')),
       jsonb_build_object('typeKey', 'attendance.service_day_exception',
                          'predicateShape', 'operating_grain_closed',
                          'params', jsonb_build_object('reason_key', 'holiday_closure')),
       jsonb_build_object('kind', 'window',
                          'validFrom', date_trunc('day', now() at time zone 'UTC')::text,
                          'validTo', (date_trunc('day', now() at time zone 'UTC') + interval '1 day')::text),
       'create', NULL, 'proposed', jsonb_build_object('factTypes', jsonb_build_array('child_attendance_event')),
       date_trunc('day', now() at time zone 'UTC'),
       date_trunc('day', now() at time zone 'UTC') + interval '1 day'
FROM public.orgs o WHERE o.slug = 'northwind-early-learning';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify. A fixture that half-applied must fail here, not three scenarios later
-- where it reads as a product defect.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_devices int; v_codes int; v_children int; v_roles int; v_screen int;
    v_restrict int; v_expect int;
BEGIN
    SELECT count(*) INTO v_devices FROM public.attendance_kiosk_devices WHERE producer_key LIKE 'kiosk:cert:%';
    SELECT count(*) INTO v_codes FROM public.person_kiosk_codes
        WHERE id::text LIKE '00000000-0000-4000-8000-0000700000%';
    SELECT count(*) INTO v_children FROM public.child_enrollment_agreements WHERE source_key = 'kiosk_cert_fixture';
    SELECT count(*) INTO v_roles FROM public.person_child_relationship_roles
        WHERE id::text LIKE '00000000-0000-4000-8000-000070000%';
    SELECT count(*) INTO v_screen FROM public.child_safeguarding_screenings
        WHERE id::text LIKE '00000000-0000-4000-8000-000070000%';
    SELECT count(*) INTO v_restrict FROM public.child_safeguarding_restrictions
        WHERE id = '00000000-0000-4000-8000-000070000130' AND status = 'active';
    SELECT count(*) INTO v_expect FROM public.operational_expectations WHERE authority_key = 'kiosk_cert_fixture';

    IF v_devices <> 4 THEN RAISE EXCEPTION 'kiosk fixture: expected 4 devices, found %', v_devices; END IF;
    IF v_codes <> 3 THEN RAISE EXCEPTION 'kiosk fixture: expected 3 person codes, found %', v_codes; END IF;
    IF v_children <> 6 THEN RAISE EXCEPTION 'kiosk fixture: expected 6 enrolments, found %', v_children; END IF;
    IF v_roles <> 11 THEN RAISE EXCEPTION 'kiosk fixture: expected 11 relationship roles, found %', v_roles; END IF;
    -- FIVE, not six: Ivy has no screening and that absence is the scenario.
    IF v_screen <> 5 THEN RAISE EXCEPTION 'kiosk fixture: expected 5 screenings, found %', v_screen; END IF;
    IF v_restrict <> 1 THEN RAISE EXCEPTION 'kiosk fixture: expected the active restriction, found %', v_restrict; END IF;
    IF v_expect <> 2 THEN RAISE EXCEPTION 'kiosk fixture: expected 2 service-day expectations, found %', v_expect; END IF;

    RAISE NOTICE 'Kiosk certification fixtures verified: % devices, % codes, % children, % roles, % screenings, 1 restriction, % expectations',
        v_devices, v_codes, v_children, v_roles, v_screen, v_expect;
END $$;
