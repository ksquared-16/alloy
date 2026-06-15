-- First Service Free: 4 visits in 120 days; program code FIRSTFREE4X120 (replaces FIRSTFREE4X60).
-- Guarded: this data migration is timestamped before the base schema dump
-- (20260329165048_remote_schema.sql) that creates discount_programs. On a fresh
-- `supabase db reset` it must no-op until the table exists. Behavior is unchanged
-- (on a fresh DB there is no FIRSTFREE4X60 row to rename).
DO $$
BEGIN
  IF to_regclass('public.discount_programs') IS NOT NULL THEN
    UPDATE public.discount_programs
    SET
      code = 'FIRSTFREE4X120',
      name = 'First Service Free — Complete 4 Visits in 120 Days',
      description = 'Customer receives first service free if they complete 4 services within 120 days.',
      updated_at = now()
    WHERE upper(trim(code)) = 'FIRSTFREE4X60';

    UPDATE public.discount_program_commitment_rules r
    SET
      timeframe_days = 120,
      updated_at = now()
    FROM public.discount_programs p
    WHERE r.discount_program_id = p.id
      AND upper(trim(p.code)) = 'FIRSTFREE4X120';
  END IF;
END
$$;
