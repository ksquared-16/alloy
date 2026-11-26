# D10 O2 — isolated scanner writer identity and credential (design for Access & Identity review)

Documents, 2026-11-04. **Design only.** Nothing here creates a role, a login, a credential, a secret, a host or a schedule,
and nothing enables scanning. It answers the Access & Identity reviews (`ff3cb02de`, `c67a9fe74fec`): O2 is required
**before scanner activation**, not before the verdict store's promotion (done, `20261219090000`, PR #1633).

## Problem

Today `record_document_malware_verdict` is executable by `service_role`. Any holder of the service key can therefore
record a `clean` verdict and, through the D10 gate, release an attachment. The function writes the audit label
`malware_scan_worker`, but the database does not prove who called it.

## Proposal

| Part | Shape |
|---|---|
| Writer role | `malware_scan_writer`, **NOLOGIN**. The only grantee of EXECUTE on `record_document_malware_verdict`; EXECUTE revoked from `service_role`. |
| Login | A dedicated LOGIN role (e.g. `malware_scan_orchestrator`), member of `malware_scan_writer`, `NOINHERIT` off, no other grants. Created and given its password **outside** the migration, under the persistent-access approval. |
| Assertion | The function begins `IF NOT pg_has_role(session_user, 'malware_scan_writer', 'MEMBER') THEN RAISE … USING ERRCODE = '42501'`. `session_user` (not `current_user`) because the function is SECURITY DEFINER. |
| Connection | The scan orchestrator connects **directly to Postgres** as the login role (not through PostgREST, where `session_user` would be `authenticator`). It runs outside the web app (the scanner host chosen at DEC-6). |
| Revocation | Unchanged: `revoke_document_malware_verdict` stays a person's action through the app (`processing.documents.manage`), executed by `service_role`. |

## Open design questions (need Access & Identity's answer before the migration is written)

1. **Audit without the service key.** B3 requires the verdict to cite a `workflow_events` row, written today by
   `recordDocumentAudit` with the service client. The orchestrator holds no service key. Options:
   (a) the writer function inserts its own audit event in the same transaction (changes the B3 contract from
   "audit first, then cite" to "function writes both"; ordering still atomic);
   (b) a second writer-role-only function `record_document_malware_audit_event(...)` the orchestrator calls first.
   **Recommendation: (a)** — one call, one transaction, no orphan events (also removes the B3 orphan-event note).
2. **Bytes without the service key.** The orchestrator must read the version's object. Options:
   (a) the web app (service role) issues a short-lived signed URL per scan job and hands it to the orchestrator through
   the job record; (b) a storage credential scoped read-only to `org_documents`.
   **Recommendation: (a)** — no second standing credential; the URL names exactly one object and expires.
3. **Job source.** The orchestrator needs the list of versions to scan. Recommendation: a writer-role-readable view of
   due work (versions with no effective verdict and `document_malware_scan_attempts.next_attempt_at <= now()`,
   migration `20261220090000`), exposing ids and checksums only.

## Migration shape (after the answers; a version above the then-current head)

- `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'malware_scan_writer') THEN CREATE ROLE malware_scan_writer NOLOGIN; END IF; END $$;`
- `REVOKE ALL ON FUNCTION public.record_document_malware_verdict(…) FROM service_role; GRANT ALL ON FUNCTION … TO malware_scan_writer;`
- `CREATE OR REPLACE` the writer with the `pg_has_role(session_user, …)` assertion (and, per question 1, its own audit insert).
- Grants for question 3's view to `malware_scan_writer` only.
- Self-check DO block; rollback invariant cases: `service_role` refused (42501), a member session allowed, a non-member
  login refused, clients refused.
- **Not in the migration:** the LOGIN role, its password, `GRANT malware_scan_writer TO <login>`.

## Approvals this needs (Kelly), in order

1. Access & Identity review of this design and of questions 1–3.
2. **Database-role approval**: the migration that creates `malware_scan_writer` (its merge applies it to staging).
3. **Persistent-access approval**: the login role, its credential, where it is stored (the DEC-6 scanner host only),
   rotation, and who can read it.
4. DEC-6 (engine and host, with `TZ=UTC` for N5) and DEC-8 (retrieval activation) remain separate.

## Effect on the app until then

None. The TS store keeps calling the writer through the service client; it is not called in production
(`UNAVAILABLE_MALWARE_SCAN`). When O2 lands, the store's writer moves behind a `VerdictWriter` port with a
direct-Postgres implementation in the scanner runtime, and the source lock in `malwareVerdictStore.test.ts` is updated.
