# Internal / System / Diagnostics API

**Domain size:** ~26 route handlers. Full list: [`api-index.md` → Internal / System / Diagnostics](api-index.md#internal--system--diagnostics).

Diagnostics, bootstrap/provisioning, dev utilities, and the **public, non-admin** surfaces: booking (book-v2), public booking config, tour booking, lead capture, marketing demo requests, and vendor application. Grouped together because they sit outside the operator/admin control plane — either as internal tooling (must not be exposed) or as external-facing entry points (no admin session by design).

---

## Diagnostics & dev (internal — do not expose)

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/debug/context` | GET | Dump resolved admin context |
| `/api/admin/debug/platform-perf-trace` | GET | Performance trace |
| `/api/admin/access-scope-debug` | GET | Access-scope debug |
| `/api/admin/db-relationships` | GET | DB relationship introspection |
| `/api/admin/deletion-eligibility` | GET | Deletion eligibility check |

These leak structural/internal detail and are stability `internal`. They should remain admin-only and never be part of a public API. Confirm each still requires an admin gate.

## Bootstrap & provisioning

| Path | Methods | Purpose | Caution |
|------|---------|---------|---------|
| `/api/admin/tenant-bootstrap` | POST | Provision tenant scaffolding | High-privilege |
| `/api/admin/vertical-bootstrap` | POST | Provision vertical config | High-privilege |
| `/api/admin/dev/create-org` | POST | Create org (dev) | **Dev-only — must be disabled/guarded in production** |
| `/api/admin/send-password-reset` | POST | Trigger password reset | Auth/abuse-sensitive |

`dev/create-org` and the bootstrap routes are the highest-privilege endpoints in the surface; they must be flag/role guarded. Flagged in the [audit](api-documentation-audit.md).

## Public / external entry points (no admin session by design)

| Path | Methods | Auth | Purpose |
|------|---------|------|---------|
| `/api/book-v2/{availability,quote-start,quote-refine,specialty-quote-start,service-details,opportunity-discount,validate-promo,ensure-customer,confirm}` | GET POST | public-org / input validation | Public booking funnel |
| `/api/public/booking-config` | GET | public | Booking widget config |
| `/api/public/tour-booking/[token]/{resolve,slots,book}` | GET POST | token | Public tour booking |
| `/api/leads/gutters` | POST | public | Lead capture (vertical) |
| `/api/marketing/demo-request` | POST | public | Marketing demo request |
| `/api/vendor-application` | POST | public | Vendor application intake |
| `/api/verticals` | GET | public | Public vertical list |

These resolve org via `ALLOY_PUBLIC_ORG_ID` / public-org helpers or a token, and use `createServiceRoleClient` server-side. They rely on **input validation + rate/abuse controls** rather than an admin gate. Several (`book-v2/{quote-refine,service-details,opportunity-discount,validate-promo}`, `marketing/demo-request`, `verticals`) showed **no detected auth helper** — expected for public routes, but each must validate inputs and constrain writes to the public org. See [audit](api-documentation-audit.md).

---

## Validation, envelopes & side effects

- **Validation:** Public booking validates promo/quote inputs; `validate-promo` returns `{ valid, reason, message }`. Bootstrap validates org/vertical identifiers.
- **Envelopes:** Domain-specific (booking funnel shapes, `{ valid, … }`).
- **Side effects:** `book-v2/ensure-customer` and `confirm` create customers/opportunities for the public org; bootstrap routes provision large amounts of config. These are write-heavy and privilege-sensitive — they are the clearest "do not expose without review" set.

Source root: `web/app/api/admin/{debug,access-scope-debug,db-relationships,deletion-eligibility,tenant-bootstrap,vertical-bootstrap,dev,send-password-reset}`, `web/app/api/{book-v2,public/booking-config,public/tour-booking,leads,marketing,vendor-application,verticals,public/field-definitions}`.
