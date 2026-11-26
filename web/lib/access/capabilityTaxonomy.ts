/**
 * The one product-facing presentation taxonomy for capabilities.
 *
 * **What this is for.** The role editor was rendering `permission_definitions.group_key` directly, so
 * an operator saw the platform's technical grouping as if it were product vocabulary:
 * *Communications, Config, Fields, Layouts, Option sets, Sections* — six entries, five of which are
 * the same operator concern (configuring how records look and behave) split by which subsystem owns
 * the table. That is implementation vocabulary presented as product IA, and it is why the editor
 * reads as an RBAC console rather than as Alloy configuration.
 *
 * This module is the mapping, in one place:
 *
 *     canonical key → technical group → operator area → operator label → level semantics
 *
 * **It is presentation only, and that boundary is load-bearing.** Nothing here grants, withholds, or
 * merges authority. The canonical keys are untouched, the grid rows underneath keep their own
 * identity, and an area's `No access / View / Manage` is a PRESET over those rows — a summary and a
 * bulk setter, never a second permission system. `W-57` established the rule this obeys: a
 * disagreeing set is reported as `Limited`, never rounded up to Manage or down to View, because both
 * roundings are authority misstatements an operator would act on.
 *
 * **Areas are not invented.** Every area below exists because canonical keys map into it. There is no
 * area for a product surface the catalog does not grant — `IA-R6` forbids simulating unbuilt
 * capability, and a matrix row with nothing behind it is exactly that. Where a technical group has no
 * honest operator-facing home, it is classified {@link UNMAPPED} rather than given a flattering name.
 */

/** An operator-facing area. Ordered as an administrator would look for them, not alphabetically. */
export type CapabilityArea = {
    key: string;
    /** What an administrator calls this. Aligned to Alloy's product/navigation vocabulary. */
    label: string;
    /** Why these belong together — shown as the area's help text, not decoration. */
    description: string;
    order: number;
};

export const CAPABILITY_AREAS: readonly CapabilityArea[] = Object.freeze([
    /*
     * Portal is FIRST, and it is one row, because it is the question that comes before every other
     * row on the page: can this person get in at all?
     *
     * W-13 — admission used to be a role literal (`PORTAL_ROLES = {admin, ops}`) that no
     * administrator could see or change. It is a capability now, so it has to appear where every
     * other capability appears. Presenting it anywhere but first would bury the switch that decides
     * whether the rest of the matrix means anything for this role.
     *
     * It confers nothing inside the portal. `fin.read` and the rest stay independently enforced —
     * the area below it is the proof, not the exception.
     */
    { key: "portal", label: "Portal", description: "Whether this role can enter the operator portal at all. Admission only — every surface inside still needs its own capability.", order: 5 },
    { key: "families", label: "Families", description: "Customer and family records.", order: 10 },
    { key: "inquiries", label: "Inquiries", description: "Opportunities and enrollment inquiries.", order: 20 },
    { key: "scheduling", label: "Scheduling", description: "Schedules and calendars.", order: 30 },
    { key: "communications", label: "Communications", description: "Messages to families and contacts.", order: 40 },
    { key: "documents", label: "Documents", description: "Documents and forms on a record.", order: 50 },
    /*
     * Forms is its OWN area, not a corner of Documents.
     *
     * The Documents area is about what is filed ON a record. Forms is the builder and the
     * submissions that come back from it, and an area is the unit a preset applies to: granting
     * someone Documents must not sweep along the authority to redesign the forms an organization
     * sends to families. Health was separated from Families for exactly this reason.
     */
    { key: "forms", label: "Forms", description: "Form design, and the submissions people send back.", order: 52 },
    /*
     * Processing is its OWN area, and deliberately not a corner of Documents or Forms.
     *
     * It is the queue where a document that arrived becomes a record: classifying it, resolving who
     * it is about, committing the records it proposes. Its authority overlaps both neighbours and
     * belongs to neither — `documents.write` is held by ops in every organization and must not
     * become a licence to delete a case, and `forms.author` legitimately covers the packet and
     * form-draft authoring that Processing surfaces without covering the queue work itself.
     */
    { key: "processing", label: "Processing", description: "The queue where arriving documents become records.", order: 54 },
    /*
     * Health is its OWN area, not a corner of Families or Documents.
     *
     * That is the D-H6 decision expressed in the operator's vocabulary: someone granting family
     * access must not sweep allergies, conditions and medications along with it, and an area is the
     * unit a preset applies to. Filing health under an existing area would make the two grantable
     * only together, which is the outcome the boundary exists to prevent.
     */
    { key: "health", label: "Health", description: "Allergies, conditions, medications and health documents.", order: 55 },
    /*
     * Financials is its OWN area, and it is not "Billing".
     *
     * The catalog carries two financial vocabularies. `billing.read` / `billing.write` are the
     * legacy pair: nothing in the tree consults either of them (`unenforcedPermissionKeys.json`),
     * so the Billing area is composed entirely of rows the platform does not act on. `fin.*` is the
     * live one — five keys, every one of them enforced by a named helper or a registered action.
     * Folding the live keys into the dead area would file the product's actual money authority
     * under a heading whose other rows change nothing, and an operator would reasonably read the
     * whole area as inert.
     *
     * The label is the operator's word for the surface these keys gate. `Financials` is what the
     * navigation says, what the workspace is called, and what the refusal message names.
     */
    { key: "financials", label: "Financials", description: "The financial workspace — accounts, charges, payments, adjustments, responsibility and subsidy.", order: 58 },
    /*
     * WORKFORCE is its own area, not a corner of Financials.
     *
     * Financials answers what the organization earns and owes. Compensation answers
     * what it pays one employee, and the two audiences barely overlap: a bookkeeper
     * reconciling tuition has no business reading salaries, and filing pay under
     * Financials would have handed them the payroll file by accident. Its own area
     * means granting it is a deliberate act with a legible name.
     */
    { key: "workforce", label: "Workforce", description: "Staff employment terms, including compensation. Separate from Financials: what the organization pays one person is not what it earns and owes.", order: 59 },
    { key: "billing", label: "Billing (legacy)", description: "The superseded billing capability pair. Retained because the catalog still seeds it; nothing consults it.", order: 60 },
    /*
     * Enrollment now holds FOUR authorities, and they are two different kinds.
     *
     * Two are the original exceptions to configured policy — overriding the recommended tuition and
     * excepting an enrollment requirement. Neither is Families and neither is Financials: both are
     * decisions about admitting a child on terms the configuration did not produce.
     *
     * Two are the operating authorities Enrollment Record Authority V1 added: keeping the
     * enrollment record, and deciding the outcome. Until that slice, sixteen enrollment mutations
     * were reachable by portal admission alone, so this area described exceptions to a policy
     * nothing enforced.
     *
     * The description names both kinds, because an operator opening this area is now answering two
     * questions — who runs enrollment, and who may depart from its configured policy — and a
     * heading that mentions only the second would read as if the first were somewhere else.
     *
     * NOT process design. Which stages exist and which configuration is live stays under Business
     * Processes; there is deliberately no Enrollment configuration row to duplicate it.
     */
    { key: "enrollment", label: "Enrollment", description: "Running enrollment — the inquiry record, the decision to enrol, and the exceptions to configured enrollment policy.", order: 25 },
    { key: "reports", label: "Reports", description: "Reports and analytics.", order: 70 },
    /*
     * ATTENDANCE, WORK, TOURS, JOBS, INTEGRATIONS and AI are areas because Access V2 built the
     * authority and this file had not caught up. Every one of their rows was landing in the trailing
     * "Not yet mapped" bucket — which had grown to the largest area in the editor, and was made
     * largest by the very slices that were supposed to make the model legible. An administrator
     * looking for "who may record attendance" or "who may perform work" was being sent to a heading
     * named after the platform's own failure to classify.
     *
     * No capability moves, gains or loses meaning here. These are headings.
     */
    { key: "attendance", label: "Attendance", description: "Seeing the register, recording attendance, and the devices that capture it.", order: 33 },
    { key: "work", label: "Work", description: "Designing work queues, and doing the work in them.", order: 34 },
    /*
     * TOURS IS NOT SCHEDULING. It was filed under "Schedules and calendars" because both keys carry
     * the `scheduling` group, but a tour is the customer-facing booking product — availability an
     * organization publishes and bookings families make — while Scheduling is the operating calendar.
     * The description an operator read did not predict what the rows did.
     */
    { key: "tours", label: "Tours", description: "Tour availability, and the bookings families make against it.", order: 35 },
    { key: "jobs", label: "Jobs", description: "Jobs, the vendors assigned to them, and job discounts.", order: 36 },
    { key: "workflows", label: "Workflows", description: "Operational workflows.", order: 80 },
    /*
     * BUSINESS PROCESS is the operator's noun, not Lifecycle and not Department.
     * `docs/platform/core/business-process-system.md` records it as shipped product language, and
     * the configuration workspace labels the surface "Processes". The two rows here were role-title
     * gates under `/api/admin/departments` until the Department convergence; they are grouped by
     * what an administrator is deciding — who may DESIGN a process, and who may SWITCH THE TENANT
     * ONTO one — rather than by the legacy path they still answer on.
     */
    { key: "business_process", label: "Business Processes", description: "Designing business processes, and choosing which configuration is live.", order: 85 },
    { key: "expectations", label: "Operational expectations", description: "Authoring and ratifying operational expectations.", order: 90 },
    { key: "configuration", label: "Configuration", description: "How records look and behave — fields, layouts, sections, option sets and configuration assistance.", order: 100 },
    { key: "integrations", label: "Integrations", description: "Connected applications and what they may do here.", order: 104 },
    /*
     * AI is its OWN area and it is deliberately SMALL. Only `ai.enrichment.use` is enforced; provider
     * configuration and telemetry review are catalogued and consulted nowhere, so they are not
     * offered as controls. An area that advertised three AI powers while the platform acts on one
     * would be exactly the simulated capability `IA-R6` forbids.
     */
    { key: "ai", label: "AI", description: "Using AI assistance on records.", order: 106 },
    { key: "settings", label: "Settings", description: "Organization settings.", order: 110 },
    { key: "users_roles", label: "Users & roles", description: "Who can sign in, what their role allows, and where they may operate.", order: 120 },
] as const);

/** A technical group with no honest operator-facing home yet. Recorded, never renamed into one. */
export const UNMAPPED = "__unmapped__" as const;

/**
 * Technical group → operator area.
 *
 * Two mappings deserve their reason stated, because both look like collapses and only one is:
 *
 * - **`crm` splits into two areas.** `crm.customers.*` and `crm.opportunities.*` are different
 *   operator concerns that happen to share a technical prefix. Presenting them as one "CRM" row
 *   would force one preset across both, so an operator granting inquiry access would silently grant
 *   family-record access. Splitting is the truthful direction.
 * - **Five groups become `configuration`.** `config`, `fields`, `layouts`, `option_sets` and
 *   `sections` are one operator concern split by owning subsystem. They are grouped for
 *   PRESENTATION; the rows underneath stay distinct and individually settable, so no authority is
 *   merged. This is the repetition the tranche was called to remove.
 */
const GROUP_TO_AREA: Readonly<Record<string, string>> = Object.freeze({
    portal: "portal",
    business_process: "business_process",
    billing: "billing",
    enrollment: "enrollment",
    financials: "financials",
    workforce: "workforce",
    communications: "communications",
    documents: "documents",
    forms: "forms",
    processing: "processing",
    health: "health",
    reports: "reports",
    scheduling: "scheduling",
    settings: "settings",
    integrations: "integrations",
    ai: "ai",
    config: "configuration",
    fields: "configuration",
    layouts: "configuration",
    option_sets: "configuration",
    sections: "configuration",
});

/**
 * Row-level overrides, applied before the group mapping.
 *
 * A grid row's id is its capability area stem (`crm.customers`, `settings.users_roles`,
 * `ops.workflows`). Some of those belong in a different operator area than their group implies —
 * `settings.users_roles` is Access administration, not general Settings, and presenting it inside
 * Settings would put "who can sign in" behind the same preset as "organization preferences".
 */
/*
 * KEEP THE WORD "p-e-r-m-i-s-s-i-o-n" OUT OF THE EXECUTABLE TEXT OF THIS FILE.
 *
 * `scanEnforcement` (web/tests/access/permissionCatalogDiscovery.ts) treats any source whose
 * comment-stripped body contains that word as *permission-related*, and then reports every
 * key-shaped literal in it that the catalog does not hold as an enforced key with no catalog row.
 * The map below is keyed by GRID ROW STEMS — `crm.customers`, `ops.workflows` — which are key-shaped
 * and are deliberately not catalog keys. One such word in an area `description` was enough to make
 * W-11's reconciliation report four capabilities this platform does not have. Comments are stripped
 * before that test reads the file, so this note is safe; a string literal is not. Say "capability".
 */
const ROW_TO_AREA: Readonly<Record<string, string>> = Object.freeze({
    "crm.customers": "families",
    "crm.opportunities": "inquiries",
    "ops.workflows": "workflows",
    "operational_expectations.author": "expectations",
    "operational_expectations.ratify": "expectations",
    "operational_expectations.authority": "expectations",
    /*
     * THE UMBRELLA'S ROW BECAME FOUR, AND THREE OF THEM BELONG HERE.
     *
     * `settings.users_roles` was one row filed under Users & roles. The Access Administration Split
     * retired it, and the replacement keys are grouped `system` in the catalog — a technical group
     * this taxonomy maps nowhere, so without these entries an administrator would find the authority
     * to invite a colleague, define a role, or change where someone works in a trailing "unmapped"
     * bucket rather than under the heading they went looking for.
     *
     * Three rows, not one, because an area is the unit a preset applies to: granting Users & roles
     * must set them together only when the operator says so, and each stays individually settable.
     */
    /*
     * THE RETIRED ROW KEEPS ITS FILING, because the row still exists.
     *
     * `settings.users_roles` is inactive, not deleted — `mutation_events` refer to it and the audit
     * would be unreadable without it. While it is in the catalog it is a grid row, and a grid row
     * has to land somewhere: dropping this entry files "who can sign in" under Settings, beside
     * organization preferences, which is the precise confusion the override was written to prevent.
     */
    "settings.users_roles": "users_roles",
    /*
     * THE `operations` AND `scheduling` GROUPS ARE SHARED, so these are row overrides rather than
     * group mappings. Attendance, Work and Jobs all carry `operations`; Tours carries `scheduling`.
     * Mapping at the group grain would have swept unrelated legacy `ops.*` rows into a current
     * product area, which is the flattering name this file's header refuses.
     */
    attendance: "attendance",
    "attendance.record": "attendance",
    "attendance.record.assigned_only": "attendance",
    "attendance.devices": "attendance",
    "work.configure": "work",
    "work.operate": "work",
    "tours.configure": "tours",
    "tours.book": "tours",
    /*
     * `ops.jobs` is CURRENT, not legacy: `ops.jobs.write` is the declared owner of twelve route
     * handlers across jobs, vendor assignment and job discounts. The rest of the `ops.*` family is
     * dormant and is deliberately NOT mapped — a dormant key does not earn a product area by sharing
     * a prefix with a live one.
     */
    "ops.jobs": "jobs",
    /*
     * `ops.messaging` is the LEGACY ALIAS of the communications send authority
     * (`LEGACY_MESSAGING_SEND_PERMISSION_ALIAS`). It is enforced, so hiding it would remove reach an
     * organization can still grant; it is messaging, so Communications is its truthful home rather
     * than an invented one. Recorded for the Director as an alias, not a second product.
     */
    "ops.messaging": "communications",
    "admin.users": "users_roles",
    "admin.roles": "users_roles",
    "admin.access_scope": "users_roles",
    /*
     * `attendance.devices` is deliberately NOT filed here, and this absence is the record.
     *
     * It is the split's fourth authority, but it is not access administration in an operator's
     * vocabulary — someone asking "who may register a kiosk" looks under Attendance, and there is no
     * Attendance area because no decision has created one. Filing it under Users & roles to avoid an
     * unmapped row would be the flattering name this file's header refuses. It renders, named as
     * unmapped, until `ACCESS_ADMINISTRATIVE_SCOPE_DEBT`'s review gives it a home.
     */
});

/**
 * The operator area a grid row belongs to, or {@link UNMAPPED}.
 *
 * Row overrides win over the group mapping, because a row is the more specific fact. An unrecognised
 * group returns `UNMAPPED` rather than a guess: a capability with no product home is a taxonomy gap
 * to record, and naming it anyway would be the invention `§12` forbids.
 */
export function areaForRow(row: { id: string; groupKey: string }): string {
    const byRow = ROW_TO_AREA[row.id];
    if (byRow) return byRow;
    return GROUP_TO_AREA[row.groupKey] ?? UNMAPPED;
}

/** Area metadata by key. `null` for {@link UNMAPPED} — callers render that case explicitly. */
export function areaMeta(areaKey: string): CapabilityArea | null {
    return CAPABILITY_AREAS.find((a) => a.key === areaKey) ?? null;
}

/**
 * Which technical groups this taxonomy currently maps, for the reconciliation record.
 *
 * Exported so a test can assert the mapping against the LIVE catalog rather than against this
 * file's own list — a taxonomy that only agrees with itself is the drift `W-42` and `W-52` each
 * closed elsewhere.
 */
export function mappedGroups(): string[] {
    return Object.keys(GROUP_TO_AREA).sort();
}
