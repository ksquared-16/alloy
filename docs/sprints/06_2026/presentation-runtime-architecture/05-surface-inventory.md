# Surface Inventory — Design Surfaces Alloy Will Support

**Path:** `docs/sprints/06_2026/presentation-runtime-architecture/05-surface-inventory.md`
**Status:** Architecture sprint — design only (June 2026)
**Companion:** [`01-presentation-runtime-doctrine.md`](./01-presentation-runtime-doctrine.md), [`07-architecture-recommendations.md`](./07-architecture-recommendations.md)

---

## 1. Inventory structure

Every row in this inventory is a **Design Surface category** or a **specific Design Surface instance** within a product domain. Each declares:

- **Category** — the Experience Builder queue group
- **Entity binding** — which record type it presents (if any)
- **Ownership model** — System-Owned / Hybrid / Fully Configurable / Capture
- **Status today** — Built / Partial / Planned / Concept
- **Storage today** — current config store
- **Card Types used** — primary Card Types in the surface

---

## 2. Core operational surfaces (shipped / partial)

### 2.1 Queue Row

| Design Surface | Entity | Ownership | Status | Storage | Key Card Types |
|---|---|---|---|---|---|
| Compact Enrollment Row | Opportunity | Hybrid | Built | `queue_record_layout` v3 | Lead Summary (compact) |
| Expanded Enrollment Row | Opportunity | Hybrid | Partial | `queue_record_layout` v3 | Lead Summary (expanded) |
| Waitlist Row | Opportunity | Hybrid | Built | `queue_record_layout` v3 | Lead Summary (compact) |
| Attendance Row | Child | Hybrid | Planned | — | Attendance Status |
| Billing Row | Account | Hybrid | Planned | — | Billing Summary (compact) |
| Scheduling Row | Schedule | Hybrid | Planned | — | Schedule Summary |
| Staff Row | Person | Hybrid | Planned | — | Profile (compact) |
| Processing Case Row (POS) | Processing Case | System-Owned | Built | POS bespoke composer | Case Summary (minimal) |

### 2.2 Focus Panel

| Design Surface | Entity | Ownership | Status | Storage | Key Card Types |
|---|---|---|---|---|---|
| Enrollment Summary | Opportunity | Hybrid | Partial | `LayoutDoc` + VM derivation | Readiness, Family, Timeline, Current Work |
| Enrollment Work | Opportunity | Hybrid | Partial | VM derivation | Work Launcher, Required Info, Workflow Steps |
| Enrollment Activity | Opportunity | Hybrid | Partial | VM derivation | Timeline, Communications (embedded workspace) |
| Person Summary | Person | Hybrid | Partial | `LayoutDoc` | Profile, Family, Connected Children |
| Child Summary | Person (child) | Hybrid | Partial | `LayoutDoc` | Profile, Enrollment, Health & Safety |
| Billing Focus Panel | Account | Hybrid | Planned | — | Billing, Invoices, Payments |
| Attendance Focus Panel | Child | Hybrid | Planned | — | Attendance, Schedule |
| Scheduling Focus Panel | Schedule | Hybrid | Planned | — | Schedule, Capacity, Conflicts |

### 2.3 Workspace

| Design Surface | Entity | Ownership | Status | Storage | Key Card Types |
|---|---|---|---|---|---|
| Command Center | Org | Hybrid | Partial | Dept blocks registry + OIP | Business Process tiles, Org Pulse, KPI strip |
| Operational Pulse | Org | Hybrid | Partial | OIP placements | KPI strip (Metric cards) |
| Business Process Tile | Process | Hybrid | Built | `processNavTile` shell + OIP | Process story, Today's Work, KPI preview |
| Operational Activity Feed | Org | System-Owned | Planned | — | Activity Timeline |

---

## 3. Analytics surfaces

| Design Surface | Entity | Ownership | Status | Storage | Key Card Types |
|---|---|---|---|---|---|
| Enrollment Dashboard | Org/Process | Fully Configurable | Partial | `metric_placements` + viz | Conversion KPI, Funnel Chart, Trend Sparkline |
| Billing Dashboard | Org | Fully Configurable | Planned | — | Revenue KPI, AR Chart, Payment Trend |
| Operations Board | Org | Fully Configurable | Planned | — | Multi-metric grid |
| Executive Summary | Org | Fully Configurable | Planned | — | Scorecard, Comparison, Health Gauge |
| Work Unit KPI Strip | Work Unit | Hybrid | Built | OIP placements + `adminv2-os-kpi` | Metric cards (compact) |
| Workspace KPI Strip | Org | Hybrid | Built | `workspace_kpi_placement` + OIP | Metric cards (compact) |
| OI Panel | Org | Hybrid | Partial | Analytics V2 zones | Overview, Health, Trends, Comparisons |
| Analytics Modal | Org | Hybrid | Built | OIP packs + `OiV2MetricOverview` | KPI health grid, pack sections |
| Forecast View | Org | Fully Configurable | Concept | — | Trend Chart, Projection Line |
| Compliance Audit Report | Org | Fully Configurable | Concept | — | Table, Scorecard |

> Analytics surfaces reuse the **same Metric Archetype Card Type** and **same Renderer catalog** (KPI Card, Trend Card, Sparkline, Chart, Gauge, Scorecard, Table) as operational surfaces. Only the Design Surface category (Dashboard) and zone topology differ.

---

## 4. Documents, Forms, Print

| Design Surface | Entity | Ownership | Status | Storage | Key Card Types |
|---|---|---|---|---|---|
| Enrollment Application (Form) | Opportunity | Capture | Built | `FormSchemaV1` | Form sections (capture) |
| Medical Intake (Form) | Child | Capture | Partial | `FormSchemaV1` | Form sections (capture) |
| Incident Report (Form) | Incident | Capture | Planned | — | Form sections (capture) |
| Invoice (Document) | Invoice | Fully Configurable | Partial | `document_composition` | Header, Line Items (Table), Totals |
| Receipt (Document) | Payment | Fully Configurable | Planned | — | Header, Items, Totals |
| Enrollment Agreement (Document) | Opportunity | Fully Configurable | Planned | — | Header, Terms, Signature |
| Invoice Print View | Invoice | Fully Configurable | Planned | — | Print-optimized blocks |
| Report Print View | Report | Fully Configurable | Concept | — | Cover, Summary, Detail, Appendix |
| Label Print View | Entity | Fully Configurable | Concept | — | QR Code, Text, Photo |
| PDF-from-Upload Template | Form | Fully Configurable | Partial | AcroForm extraction → FormSchemaV1 | Field regions from PDF |

> Forms are **Capture** surfaces — distinct runtime (validation, submission, signatures). They share authoring chrome with the Experience Builder but not the display runtime.

---

## 5. Communications

| Design Surface | Entity | Ownership | Status | Storage | Key Card Types |
|---|---|---|---|---|---|
| Welcome Email | Person | Fully Configurable | Planned | — | Subject, Body blocks, Variables |
| Tour Reminder | Opportunity | Fully Configurable | Planned | — | Subject, Body, Calendar link |
| Payment Notice | Account | Fully Configurable | Planned | — | Subject, Body, Amount (Currency) |
| Waitlist Update | Opportunity | Fully Configurable | Planned | — | Subject, Body, Status |
| SMS Template | Person | Fully Configurable | Planned | — | Body (Text), Variables |
| Communication Embed (Activity) | Opportunity | System-Owned | Built | Embedded workspace slot | Communications module embed |

---

## 6. POS

| Design Surface | Entity | Ownership | Status | Storage | Key Card Types |
|---|---|---|---|---|---|
| POS Checkout | Transaction | Fully Configurable | Planned | — | Items (Table), Totals (Currency), Actions |
| POS Processing | Processing Case | Hybrid | Partial | POS shell | Case Summary, Status, Next Step |
| POS Register | Register | System-Owned | Planned | — | Register status, Session summary |
| POS Forms | Form | Capture | Partial | FormSchemaV1 | Form sections |
| POS Packets | Packet | Hybrid | Partial | Packet definitions | Packet items, Progress |
| POS Documents | Document | Fully Configurable | Partial | Document pipeline | Document viewer |
| POS Sources | Source | Hybrid | Planned | — | Source list, Processing status |

> POS Processing queue intentionally bypasses `queue_record_layout` (avoids lifecycle entanglement). It uses a minimal row composer sharing display Renderers.

---

## 7. Portal / Mobile

| Design Surface | Entity | Ownership | Status | Storage | Key Card Types |
|---|---|---|---|---|---|
| Family Dashboard (Portal) | Household | Fully Configurable | Concept | — | Family Summary, Children, Billing, Documents |
| Enrollment Status (Portal) | Opportunity | Fully Configurable | Concept | — | Status, Timeline, Next Steps |
| Payment Portal | Account | Fully Configurable | Concept | — | Balance, Payment form, History |
| Document Portal | Document | Fully Configurable | Concept | — | Document list, Viewer |
| Teacher Attendance (Mobile) | Classroom | Fully Configurable | Concept | — | Attendance grid, Child cards |
| Director Snapshot (Mobile) | Org | Fully Configurable | Concept | — | KPI strip, Alerts, Quick actions |
| Parent Notification (Mobile) | Person | Fully Configurable | Concept | — | Notification card, Action button |

---

## 8. AI surfaces

| Design Surface | Entity | Ownership | Status | Storage | Key Card Types |
|---|---|---|---|---|---|
| AI Summary Card | Any | Hybrid | Partial | VM derivation | AI Summary (Summary archetype) |
| BOS Insight Panel | Any | System-Owned | Built | BOS rail | BOS-managed |
| AI-Generated Dashboard | Org | Fully Configurable | Concept | — | AI-composed metric cards |
| AI Document Summary | Document | Hybrid | Concept | — | AI Summary + Document Viewer |

---

## 9. Future modules

| Module | Design Surface categories needed | Notes |
|---|---|---|
| **Staffing** | Queue Row, Focus Panel, Dashboard, Schedule | Shares Schedule + Person Card Types |
| **Subsidy** | Focus Panel, Document, Report | Financial + compliance Card Types |
| **Compliance** | Dashboard, Report, Focus Panel | Audit + checklist Card Types |
| **Transportation** | Queue Row, Focus Panel, Mobile | Route + child Card Types |
| **Meals** | Queue Row, Focus Panel, POS | Menu + dietary Card Types |
| **Health** | Focus Panel, Form, Document | Medical + immunization Card Types |
| **Multi-site Corporate** | Workspace, Dashboard, Report | Cross-location aggregation |
| **Franchise** | All categories + inheritance cascade | Platform → Industry → Org → Location → Viewpoint |

Each future module **configures existing Design Surface categories** with domain-specific Card Type instances — it does not invent new surface types.

---

## 10. Surface count summary

| Category | Built | Partial | Planned | Concept | Total |
|---|---|---|---|---|---|
| Queue Row | 3 | 1 | 4 | 0 | 8 |
| Focus Panel | 0 | 6 | 2 | 0 | 8 |
| Workspace | 1 | 2 | 1 | 0 | 4 |
| Dashboard / Analytics | 3 | 2 | 3 | 2 | 10 |
| Document / Print | 0 | 2 | 4 | 2 | 8 |
| Form (Capture) | 1 | 1 | 1 | 0 | 3 |
| Communication | 1 | 0 | 5 | 0 | 6 |
| POS | 1 | 3 | 3 | 0 | 7 |
| Portal / Mobile | 0 | 0 | 0 | 7 | 7 |
| AI | 1 | 1 | 0 | 2 | 4 |
| **Total** | **11** | **16** | **23** | **13** | **63** |

---

## 11. Cross-references

| Concern | Doc |
|---|---|
| Presentation Runtime doctrine | [`01-presentation-runtime-doctrine.md`](./01-presentation-runtime-doctrine.md) |
| Reuse map | [`06-reuse-map.md`](./06-reuse-map.md) |
| Architecture recommendations | [`07-architecture-recommendations.md`](./07-architecture-recommendations.md) |
| Existing surface registry | `web/lib/layout/surfaceLayoutRegistry.ts` |
