-- =============================================================================
-- THE PRODUCER BRIDGE TABLES OUTLIVED THE MODEL THEY BRIDGED.
--
-- `attendance_integration_producers`, `attendance_integration_producer_sites`
-- and `attendance_integration_mappings` were carried as TEMPORARY BRIDGES after
-- Thread 5 B.5 moved external attendance identity to the Developer Platform.
-- Each carried its own removal trigger in a schema comment; the wording was "all
-- rows converged to installations".
--
-- THE TRIGGER IS SATISFIED, AND IT IS SATISFIED VACUOUSLY.
--
-- Two governed censuses of `alloy_deployed_primary` — 2026-09-11 and 2026-09-13,
-- the same target fingerprint — each returned zero producers, zero producer
-- sites, zero mappings, and zero producer-attributed attendance events. There is
-- nothing to converge because nothing was ever there to convert. That is the
-- strongest form the trigger can take, not the weakest: a migration tool for
-- rows that do not exist would be fiction with a progress bar.
--
-- WHAT HAD TO GO FIRST, AND DID.
--
-- `20260913160000` dropped `attendance_integration_events.producer_id` and its
-- foreign key, which was the last structural reference into these tables. The
-- same slice retired `producerAdministration.ts`, the three
-- `app/api/admin/attendance/producers` routes, and the operator screen over
-- them. Nothing in the application reads or writes these tables any more, and
-- the repository lock in `legacyAttendanceAuthorityRetired.test.ts` now carries
-- no exceptions at all.
--
-- WHY NOT KEEP THEM AS HISTORY.
--
-- They hold no rows in any measured environment, so there is no history in them
-- to keep. What is worth keeping is the record of what they were and why they
-- went, and that lives in migration history and in the closeout documents — not
-- in an empty table that a future writer could mistake for a live model. A
-- runtime table with zero authority is an invitation, not an archive.
--
-- The two tenancy trigger functions are dropped with them. Each is used by
-- exactly one of these tables and by nothing else; leaving them would strand
-- guard code for a shape that no longer exists.
-- =============================================================================

-- Dependants first: both carry a foreign key into the producer table.
DROP TABLE IF EXISTS public.attendance_integration_mappings;
DROP TABLE IF EXISTS public.attendance_integration_producer_sites;
DROP TABLE IF EXISTS public.attendance_integration_producers;

-- Guards for shapes that no longer exist.
DROP FUNCTION IF EXISTS public.assert_integration_mapping_tenancy();
DROP FUNCTION IF EXISTS public.assert_integration_producer_site_tenancy();
