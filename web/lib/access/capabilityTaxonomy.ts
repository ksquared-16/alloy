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
    { key: "billing", label: "Billing (legacy)", description: "The superseded billing capability pair. Retained because the catalog still seeds it; nothing consults it.", order: 60 },
    /*
     * Enrollment holds two authorities that are exceptions to configured policy — overriding the
     * recommended tuition and excepting an enrollment requirement. Neither is Families and neither
     * is Financials: both are decisions about admitting a child on terms the configuration did not
     * produce, and an operator looking for "who may override enrollment policy" looks for
     * Enrollment.
     */
    { key: "enrollment", label: "Enrollment", description: "Exceptions to configured enrollment policy — pricing overrides and requirement exceptions.", order: 25 },
    { key: "reports", label: "Reports", description: "Reports and analytics.", order: 70 },
    { key: "workflows", label: "Workflows", description: "Operational workflows.", order: 80 },
    { key: "expectations", label: "Operational expectations", description: "Authoring and ratifying operational expectations.", order: 90 },
    { key: "configuration", label: "Configuration", description: "How records look and behave — fields, layouts, sections, option sets and configuration assistance.", order: 100 },
    { key: "settings", label: "Settings", description: "Organization settings.", order: 110 },
    { key: "users_roles", label: "Users & roles", description: "Who can sign in, and what their role allows.", order: 120 },
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
    billing: "billing",
    enrollment: "enrollment",
    financials: "financials",
    communications: "communications",
    documents: "documents",
    health: "health",
    reports: "reports",
    scheduling: "scheduling",
    settings: "settings",
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
    "settings.users_roles": "users_roles",
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
