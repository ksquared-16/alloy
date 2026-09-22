-- STAFF SUPPLY PARTICIPATION — CLASSIFY BEFORE ANYTHING READS THE FIELD.
--
-- `staffing_participation` has always existed and nothing has ever read it, so every
-- eligible Staff Assignment counts as supply today regardless of its value. Every
-- Staff-capable type in staging is `recurring_service` at `none`, and all live Staff
-- supply sits on them. Activating the field first would therefore have removed ALL
-- Staff supply — the whole reason this backfill runs before the runtime cutover.
--
-- ── THE BACKFILL IS EVIDENCE-DRIVEN, NOT KEYED ON A NAME ──
--
-- It promotes a type to `supply` because that type DEMONSTRABLY CARRIES LIVE STAFF
-- SUPPLY TODAY, not because it is called `recurring_service`. A tenant that named its
-- staffing type something else is covered; a tenant whose `recurring_service` carries
-- no staff work is left alone.
--
-- ── `none` STAYS MEANINGFUL ──
--
-- A Staff-capable type carrying no live supply is NOT touched. `none` must keep meaning
-- "intentionally excluded", so the migration never promotes a type merely for being
-- Staff-capable. There is deliberately no rule that every Staff-capable type must be
-- `supply`.

update public.operational_assignment_types t
set staffing_participation = 'supply',
    updated_at = now()
where t.is_active
  and 'staff' = any(t.subject_types)
  and t.staffing_participation = 'none'
  and exists (
      -- "Live supply" means exactly what buildStaffSupply counts today: a committed,
      -- operational staff assignment. Anything looser would promote types that never
      -- contributed anything.
      select 1
      from public.schedule_assignments sa
      where sa.operational_assignment_type_id = t.id
        and sa.subject_type = 'staff'
        and sa.commitment_kind = 'committed'
        and sa.status in ('planned', 'active', 'ending')
  );

-- THE GATE. Returns one row per Assignment Type that still carries live Staff supply
-- while classified in a way that would drop it once the runtime reads the field.
--
-- It reasons over usage, so it keeps working for types this migration never saw: a
-- tenant type created later, or one that starts carrying staff work after the fact.
-- A hardcoded key list would have gone stale the first time either happened.
create or replace function public.staff_supply_participation_unresolved()
returns table (
    org_id uuid,
    assignment_type_id uuid,
    type_key text,
    staffing_participation text,
    live_supply_assignments bigint
)
language sql
stable
set search_path = public
as $$
    select
        t.org_id,
        t.id,
        t.key,
        t.staffing_participation,
        count(sa.id) as live_supply_assignments
    from public.operational_assignment_types t
    join public.schedule_assignments sa
      on sa.operational_assignment_type_id = t.id
     and sa.subject_type = 'staff'
     and sa.commitment_kind = 'committed'
     and sa.status in ('planned', 'active', 'ending')
    where t.is_active
      and t.staffing_participation <> 'supply'
    group by t.org_id, t.id, t.key, t.staffing_participation
    having count(sa.id) > 0;
$$;

comment on function public.staff_supply_participation_unresolved() is
    'Assignment Types still carrying live Staff supply while not classified as supply. Non-empty means the staffing runtime must not read staffing_participation yet: doing so would silently delete that supply.';

-- Staff Assignments with no type at all cannot be classified, so they are reported
-- separately rather than folded into the count above. The runtime treats them as
-- configuration-invalid rather than as an honest zero.
create or replace function public.staff_supply_untyped_assignments()
returns table (org_id uuid, assignment_id uuid, site_location_id uuid)
language sql
stable
set search_path = public
as $$
    select sa.org_id, sa.id, sa.site_location_id
    from public.schedule_assignments sa
    where sa.subject_type = 'staff'
      and sa.commitment_kind = 'committed'
      and sa.status in ('planned', 'active', 'ending')
      and sa.operational_assignment_type_id is null;
$$;
