# Processing Identity Resolution — Local Certification Data Cleanup

**Status:** Implemented locally · Locally certified · Awaiting staging reconciliation · Not promoted · Not deployed.

**Scope:** Isolated certification database only (`127.0.0.1:55322`, project `alloy-processing-identity-cert`). No shared/staging/production data was touched.

**Method:** Targeted local SQL. No canonical delete/archive identity commands exist in V1 for Person/Child/Household/Lead; immutability/append-only triggers were bypassed for the cleanup transaction only via `SET LOCAL session_replication_role = replica`. No merge behavior and no production cleanup logic were added.

## Canonical fixtures retained

| Table | ID | Label |
|-------|-----|-------|
| `persons` | `c1000001-0001-4001-8001-000000000001` | Existing ParentA |
| `persons` | `c1000001-0001-4001-8001-000000000002` | Existing ParentB |
| `customers` | `d1000001-0001-4001-8001-000000000001` | Existing Family A |
| `customers` | `d1000001-0001-4001-8001-000000000002` | Existing Family B |
| `customer_members` | `e1000001-0001-4001-8001-000000000001` | Existing Child A |
| `customer_members` | `e1000001-0001-4001-8001-000000000002` | Same Name Child |
| `opportunities` | `f1000001-0001-4001-8001-000000000001` | Legacy null-org fixture (diagnostic) |

## Removed (certification-created only)

| Table | Count | Reason |
|-------|------:|--------|
| `persons` | 4 | Manual Create Lead / Public Form / state-flow cert commits |
| `customers` | 4 | Certification-created households |
| `customer_members` | 5 | Certification-created children (incl. UniqueChild on fixture household) |
| `opportunities` | 7 | Certification-created leads |
| `processing_cases` | 15 | Certification cases (+ cascaded facts/resolutions/plans/attempts/sources) |

Machine-readable ID list: [`processing-identity-resolution-cert-cleanup-log.csv`](./processing-identity-resolution-cert-cleanup-log.csv).

## Post-cleanup residual (org A)

`persons=1`, `customers=1`, `customer_members=1`, `opportunities=0`, `processing_cases=0` — fixture family only.
