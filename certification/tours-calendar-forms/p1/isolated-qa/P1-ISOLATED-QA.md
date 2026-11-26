# Tours & Public Forms P1 — isolated functional QA (write-capable)

**Date** 2026-10-28 (UTC) · **lane** `lane_2cea84351d90` · **runs** `erun2_b2813098c73b5224` → `erun2_da172e46bc27b084`
(the lane's run rolled over when the first approval resumed it; every request below names the run that filed it).
**Candidate** `3f86d657d43c0ae9fbead42644f3cd1180d3d8d2` (`sprint/tours-polish-p1`, base staging `b5abf2d02`), unchanged
by this QA. Nothing was pushed, merged, deployed or applied to a shared database.

## Why a new target

The P1 operator-screen evidence was read-only because the slot-4 dev server (`:3014`) serves **hosted Alloy staging**
(`/api/build-info` → `supabaseProjectRef: ikaxilmwmrmbagoidedu`). Its QA session restore (`gar_3de4a12ad772ea`) targeted
`alloy_deployed_primary`, wrote a session, then failed verification; that session expired 2026-10-27T16:28:59Z. It was not
restored again: a working session there would still have been a session on Firefly's shared staging data.

## Isolated target — how it was obtained (all governed, operator-approved)

| Request | Action | Result |
|---|---|---|
| `gar_413cc8a1376e0b` | `environment.build_certification_baseline` (staging tip `317eafa5be62`) | `certenv-8b1a2284d8` READY 00:59:56Z |
| `gar_af94e406ec4c33` | `product.register_candidate_preview_target` | failed `invalid_subject_worktree` (payload lacked `worktree`) — nothing allocated |
| `gar_a6f1f552b3609e` | same, with the subject worktree | `alloy.candidate.enrollment` REGISTERED, port 4412 |
| `gar_2bd97ecf8492d5` | `product.activate_candidate_preview` (production mode, isolated) | ACTIVE, BUILD_ID `lAiHo0b2LklVWPTytv9k1` |
| `gar_0c34ee74101298` | `environment.restore_preview_qa_session` | session for `qa.operator@northwind.invalid` |

**Isolation, measured (not taken from the action results):**

- Environment: owned and leased by this lane (lease to 2026-10-28T12:59:56Z); `hardening.loopback_only: true`; LAN and
  tailnet addresses refused on the DB/API ports; every default Supabase role and key refused; credentials rotated.
  Baseline: 548 migrations, head `20261212090000`, two replays agree, ledger = manifest. The schema is staging tip, newer
  than the candidate's base; this sprint adds no migrations.
- Served revision: `/api/runtime-info` → `builtSha = runtimeSha = 3f86d657d43c`; `/api/build-info` →
  `nodeEnv: production`, `supabaseProjectRef: null`.
- Browser bundle: the Supabase URL compiled into the client is the certenv's API origin (port 56110); the hosted project
  ref occurs **0** times in any chunk (the one `supabase.co` hit is an error-message string).
- No email/SMS provider key is in the preview's environment (env names recorded on the preview), so nothing can reach a
  family from this target.
- Preserved: Business Processes' `certenv-d59e73b0fd` and its preview `alloy.candidate.business-processes` (:4411) were
  not touched; shared Docker leases and protected runtimes were not touched.

**Session, consumer-proven:** canonical storage file (0600) written 18:20:09 PDT by this restore; one cookie,
`sb-vacilandos-mac-mini-auth-token`, scoped to the preview's tailnet host; a Playwright context loading it lands on
`/organization/locations` (no `/login`), and the tenant's data renders (*Northwind — Riverside Campus*, *Northwind —
Lakeside Campus*). Origin (200), authentication (no redirect) and data (rows render) were checked separately. No
storage-state file was edited.

## Results (walkthrough `P1-HUMAN-QA-WALKTHROUGH.md`, on Northwind — Riverside Campus)

| § | Check | Result |
|---|---|---|
| B | Tours tab = Availability · Booking experience · Preview & Share; no "Week at a glance"; ownership box | PASS |
| B/C | Two identical org-wide "Monday window" rules + a location Monday + "QA Weekdays" (needs approval). Box: "2 schedules set here plus 2 organization-wide"; each schedule once; inherited cards read-only ("Copy to this location" only); both duplicates carry "Same days and times as …" | PASS |
| C | Editor refuses to save without a time zone ("Choose a valid time zone") — correct; see D3 for the copy | PASS |
| D | Default colour: white on `#00856B`, note "4.6:1"; `#FFD400` keeps the fill with `#665500` text, "5.1:1"; heading and website button follow "Book a Campus Visit" live; save 200, survives reload | PASS |
| E | Forms Studio: inquiry form authored, fields added, names paired, published (200); Share by location → Riverside link. Preview & Share: Publish → "Tour calendar is live — Published", hosted URL, iframe snippet (title "Book a Campus Visit — Northwind — Riverside Campus"), button snippet `#00856B`/white | PASS |
| F | Hosted page signed out: times in PDT; selected time and Continue white on `#00856B`; step 2 in place with Requested tour; desktop First/Last side by side (449/732, 259 px — identical to P1); submit → 201/200, "Your tour request was received … not confirmed yet" | PASS |
| F | Framed (parent `http://localhost:4719`): desktop pair 117/400 × 259 px, parent URL unchanged; mobile 390 stacked, Submit 300 px, submitted **inside the frame**, parent URL unchanged; standalone mobile stacked 49 × 292, Submit 316 (identical to P1); no horizontal scroll | PASS |
| F | Unavailable slot: operator switched "QA Weekdays" off mid-form → "That time is no longer available. Please choose another time — your answers are saved.", answers kept, "Choose another time"; nothing received; schedule re-activated | PASS |
| G | Case: Requested tour "Thu, Oct 29, 2026 · 1:00 PM – 1:30 PM PDT", "pending acceptance (not booked)", "Nothing is booked and nothing has been sent" | PASS |
| G | **Approve — Create enrollment lead** → `422` "Create Lead is not configured for this process/location." | **BLOCKED (environment)** — see below |
| H | Studio Edit, Studio Preview and the public runtime place the same rows: parent first│last · email · phone│child first · child last. Preview Submit white on `#00856B`; required marks shown | PASS |
| — | Operating calendar (S5/S6 recorded "Browser QA: not run"): Riverside › Scheduling › + Holiday 2026-10-30 → Review impact "Fri, Oct 30, 2026: Ordinary hours → Closed" → Save; public calendar disables Oct 30; Reopen → entry "withdrawn" with Restore; 1:00/1:30 PM offered again | PASS |
| I | Delete one duplicate org-wide Monday → "plus 1 organization-wide schedule", no "Same days" note; "Use the organization's settings" → all Alloy defaults; Withdraw calendar → public link "Tour booking unavailable" | PASS |

**§G approval is not certified here.** `resolveCreateLeadPlacement` fails closed: Northwind's Enrollment department is not
a builder/activation-owned lifecycle, so no Create Lead entry work unit resolves. Making it one is a Business Process
Builder activation (Business Processes' domain), not a Tours/Forms change, and was not attempted. Approve remains covered by
the I1 live suite against a real database and by walkthrough §G on hosted staging after deployment. §G steps 29–30 (consent
on the person, suppression) depend on approval and were not reached.

## Defects and debt found

| # | Severity | Owner | Finding |
|---|---|---|---|
| D1 | Moderate | Tours P1-B (this sprint) | Booking experience says "Shown to families: *X*" for the location layer, but a published form's own brand override wins on the tour page (`buildPublicFormResolvePayload.ts:81`, form → location → org). Observed: location "Riverside QA" vs form "Northwind Early Learning" on the public page. Fix: say a form's own branding takes precedence on that form's pages, or show the effective value for the published link in Preview & Share. Not fixed in this candidate. |
| D2 | Moderate | Processing / Lifecycle | The case reads "Alloy recommends: Create new · Ready to create" with Approve enabled when Create Lead placement is unconfigured; the 422 appears only after clicking. The preflight should carry the placement check (`createLeadMinimumValidation.ts:69` already has the message). |
| D3 | Minor | Tours | At organization scope the editor's time-zone hint reads "No time zone is configured for this location". |
| D4 | Minor | Tours (Preview & Share) | A link whose name equals its form's name is listed as "Northwind Tour Inquiry · Northwind Tour Inquiry". |
| D5 | Needs product decision | Forms runtime | A form that includes the Alloy fields "Email opt-in"/"SMS opt-in" also shows the built-in "Stay in touch (optional)" consent block — two consent pairs with different wording on one page. |
| D6 | Pre-existing | Forms runtime | Three console `409 NO_SESSION` (`enrollment-artifact`, `enrollment-objective`) on step 2 for an anonymous family — `FormEmbedClient` probes; not in this sprint's diff. |
| D7 | Pre-existing | Studio | Studio Health tiles show fixed deltas ("↑ 2 this week", "↓ 12%") beside counts of 0. |
| D8 | Pre-existing (known) | Forms runtime | Runtime text inputs have no associated `<label>` (re-confirmed). |

**Toolkit defect (Vacilando backend — recorded only; not fixed from this product lane).**
`vac governed-action --contract product.register_candidate_preview_target` reports `required inputs : reason`, because the
registry declares `inputSchema: { required: ["reason"] }` (installed toolkit `20261028-1388aad78e16`,
`lib/trusted-host-action-registry.mjs:1958`). Its `validateInputs` also requires an absolute subject worktree
(`worktree` / `worktreePath` / `worktree_path`) and a `slug` or `target` (`:1965–1975`), and refuses without them. A payload
built from `--contract` is therefore approved by the operator and then fails `input_validation_failed — absolute subject
Alloy worktree required` (`gar_af94e406ec4c33`): one operator approval spent on a request that could never run. Expected fix (owner:
Vacilando): `inputSchema.required` names `worktree` and the `slug`/`target` alternative, so `--contract` matches the validator,
and validation runs before the request is offered for approval. Re-filed with the worktree as `gar_a6f1f552b3609e` → REGISTERED.

Walkthrough correction (applied): "Deactivate" appears only on legacy single-window rules (what staging has); schedules
created in the new editor are switched off with Edit › Active.

## Harness and evidence

`harness/` — Playwright scripts (run from `web/` so `playwright` resolves). `PREVIEW_ORIGIN` and `TOUR_URL` come from
the environment; the hosted URL carries the link's token and is not committed. `--disable-features=LocalNetworkAccessChecks`
is a harness-only switch: Chromium otherwise refuses to let the test parent page frame a private tailnet host
(`net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`); real school websites frame a public Alloy origin.
`browser/` — screenshots named by step. The Preview & Share screenshot is withheld (it shows the link token).

## Residue (isolated environment only)

Northwind on `certenv-8b1a2284d8`: form "Northwind Tour Inquiry" (published) and its Riverside link (calendar withdrawn);
schedules "Monday window" ×1 org-wide, Riverside "Monday window" and "QA Weekdays"; Riverside time zone set to
America/Los_Angeles; "QA Holiday" (withdrawn); two Processing cases (`qa+enrtour1@`, `qa+enrtour2@example.invalid`,
unapproved). All of it goes with the environment. Shared staging was not read or written by this QA.
