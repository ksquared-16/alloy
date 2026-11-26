# Documents V1 — the API upload limit: 4 MiB today, a safe path to 10 MB

**Status: analysis and recommendation (2026-11-03). Nothing here is implemented beyond the 4 MiB statements.**
Objective `OPWORK_AA660DC9554D_SPRINT_AFD07879C606`, lane `lane_aa660dc9554d`.

## Today: 4 MiB (4,194,304 bytes), stated everywhere a partner meets it

| Where | What it says |
|---|---|
| `POST /api/v1/document-uploads` response | `max_bytes: 4194304` |
| Oversize declaration (create) and oversize body (content) | `413` with "Files sent through the API must be at most 4 MiB (4,194,304 bytes)." (`API_DOCUMENT_UPLOAD_LIMIT_TEXT`) |
| Specification §10a.1, guide §9, front-door scope table, OpenAPI | 4 MiB, and why staff can upload 10 MB |

**Why 4 MiB.** Q1 chose bytes proxied through Alloy, so D1c-1 screening runs before anything is stored. The bytes then
arrive in one request to a Vercel function, and Vercel caps a function's request body at 4.5 MB. That cap cannot be
configured. The staff ceiling (`ADMIN_DOCUMENT_UPLOAD_MAX_BYTES`, 10 MiB) is not reachable through that path either.

## The invariant any larger path must keep

1. No byte becomes a `documents` row, a link or a readable object before D1c-1 screening (and D1c-2 malware scanning,
   once enabled) has decided on the **whole** file.
2. Bytes that are not yet screened are never readable. They sit under no document row and get no signed URL, are bound
   to one installation's upload, and are swept when abandoned.
3. The same credential, scope, idempotency and audit-before-effect rules as D9.2. No storage URL is handed to a partner.

## Options

| | A. Parts through Alloy (recommended) | B. Signed upload into a quarantine bucket |
|---|---|---|
| Transport | `POST …/content?upload_id=…&part=n`, each part ≤ 4 MiB, then `POST …/content/complete` | Partner PUTs directly to storage with a signed URL |
| Where unscreened bytes rest | Private staging prefix `<org>/api_upload_parts/<upload>/<n>`, written only by Alloy | A partner-writable object in a dedicated bucket |
| Screening | On `complete`: assemble, verify size and SHA-256, `decideIngestion` on the whole file, audit, store, then the row. Parts are deleted | A worker must pull, screen and promote. A new asynchronous state the partner has to poll |
| Q1 | Kept: Alloy receives every byte | Reverses Q1 (unscreened bytes land under partner control) |
| New parts | Part index and count in the signed upload id; staging prefix in the existing sweep; one assembly step | A new bucket and policies, the signed-URL issuer, a promotion worker, a polling state |
| Limits to prove | Assembling 10 MB in function memory and time (download about 3 parts plus 1 upload) | Bucket policy proof; worker capacity |

**Recommendation: A.** It is additive to D9.2. The upload id gains `parts`, the content call gains `part`, and one
`complete` intent is added. Every check D9.2 makes still runs on the whole file before storage, and Q1 does not change.

## What A needs before the limit is raised

1. Code: part-aware upload id; a staging writer; `complete` with assembly and the existing ingestion order; the sweep
   extended to `api_upload_parts` (TTL one hour, as for uploads); `API_DOCUMENT_UPLOAD_MAX_BYTES` raised to the staff
   ceiling only together with these. Tests: a part out of order, a missing part, a duplicate part, an assembled SHA
   mismatch, a refusal at screening (no row, parts removed), a retried `complete` (one document), cross-installation 404.
2. OpenAPI and partner package: additive (`part` parameter, the `complete` operation), so the published count changes.
3. Hosted proof: one 10 MB assembly on staging, measuring function time and memory, before the limit is published.
4. D1c-2: once malware scanning is enabled, its verdict binds to the assembled version exactly as for a single-request
   upload. Nothing about parts may count as a scan.

Until then the API states 4 MiB, and partners send larger files to the organization another way.

## Assessment: in this program or after it? (2026-11-03, run `erun2_91771ceae4599d00`)

**Recommendation: keep 10 MB out of this program's acceptance, and do option A as the first follow-on slice once D9 is
live on staging.**

**The work (option A).** About one slice of code plus one hosted proof:
- the upload id gains `parts` and the content call gains `part`;
- a staging-prefix writer, and one `completeDocumentUpload` assembly step that runs the existing screening order on
  the whole file;
- the sweep extended to `api_upload_parts`;
- seven new tests (listed above);
- OpenAPI and partner package changes (one new operation, so the published counts change again);
- one hosted 10 MB assembly that measures function memory and time.

**Why not now:**
1. It adds a new byte path at the same time the existing one is being proven for the first time (D9-H2). A failure in
   hosted proof would then have two candidate causes.
2. Its risk sits in the same place as D1c-2 (malware scanning). The verdict must bind to the *assembled* version. That
   is easier to prove once scanning has an engine (DEC-6) than to design against an unwired one.
3. Nothing in D9 or D10 acceptance depends on it. Partners can send larger files to the organization another way
   today, and D10 email attachments have their own limit.

**What it would cost to defer:** the published limit stays 4 MiB, and partners with 4–10 MB files (scanned multi-page
PDFs) need the organization to upload them. The largest file stored today is 4.4 MB.

**Not recommended:** option B (signed upload into a quarantine bucket). It reverses Q1, so unscreened bytes would land
under partner control.

**Decision needed:** DEC-10 (`D9-D10-COMPLETION-PLAN.md` §4). The 4 MiB limit stays until a decision is recorded.
