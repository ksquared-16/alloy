-- Tours S1: 20261211090000 tour_booking_slot_capacity_guard on ALLOY_STAGING — catalog only, no table rows read.
SELECT 's1_slot_capacity_guard' AS question_id,
       'row' AS kind,
       json_build_object(
         'ledger_has_version', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261211090000'),
         'ledger_has_old_version', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261210090000', '20261206090000')),
         'function_present', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'enforce_tour_booking_slot_capacity'),
         'trigger_present', EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relname = 'tour_bookings' AND t.tgname = 'trg_tour_bookings_slot_capacity' AND NOT t.tgisinternal),
         'trigger_enabled', (SELECT t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relname = 'tour_bookings' AND t.tgname = 'trg_tour_bookings_slot_capacity')
       )::text AS payload
