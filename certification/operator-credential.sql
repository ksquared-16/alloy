-- Attach a DETERMINISTIC synthetic password to the seeded certification operator.
-- Run by `alloy-certify seed` after the representative seed. Local-only, non-secret:
-- it exists solely on a disposable localhost stack. The canonical seed intentionally
-- leaves encrypted_password NULL; the certification platform attaches one here.
--
--   Operator: qa.operator@northwind.invalid   Password: alloy-local-cert
-- Note: auth.users.confirmed_at is a GENERATED column (from email/phone
-- confirmation) — setting email_confirmed_at is sufficient.
UPDATE auth.users
   SET encrypted_password = crypt('alloy-local-cert', gen_salt('bf')),
       email_confirmed_at  = COALESCE(email_confirmed_at, now())
 WHERE email = 'qa.operator@northwind.invalid';
