/**
 * Business-concept catalog + value resolver (Presentation Data doctrine).
 *
 * The Experience Builder never exposes raw database columns. Administrators bind
 * to BUSINESS CONCEPTS expressed as a path:
 *
 *   Enrollment → Primary Contact → Phone
 *   Enrollment → Children → Name
 *   Enrollment → Assigned Employee → Employee ID
 *
 * This module owns:
 *   - the concept TREE that drives the cascading picker, and
 *   - a `resolveConceptValue` that maps a concept path to a display string from a
 *     record (Household is the complete reference; other branches resolve where the
 *     demo/record provides data, else a clean empty state).
 *
 * The same resolver runs in the editor canvas and the operator runtime, so a bound
 * field renders identically in both.
 */

export const CONCEPT_ROOT = "Enrollment" as const;
export const CONCEPT_SEP = " → ";

/** A leaf concept (an attribute) under a branch. */
export type ConceptLeaf = { label: string };
/** A branch (relationship / category) exposing leaf concepts. */
export type ConceptBranch = { label: string; leaves: ConceptLeaf[] };

/** Concept tree under the Enrollment root (drives the picker). */
export const CONCEPT_TREE: ConceptBranch[] = [
    {
        label: "Primary Contact",
        leaves: [
            { label: "Name" },
            { label: "Phone" },
            { label: "Email" },
            { label: "Address" },
            { label: "City" },
            { label: "State" },
            { label: "ZIP" },
        ],
    },
    { label: "Secondary Contact", leaves: [{ label: "Name" }, { label: "Phone" }, { label: "Email" }] },
    { label: "Additional Contacts", leaves: [{ label: "Count" }, { label: "Summary" }] },
    {
        label: "Children",
        leaves: [
            { label: "Summary" },
            { label: "Count" },
            { label: "Name" },
            { label: "Age" },
            { label: "Status" },
            { label: "Current Room" },
        ],
    },
    { label: "Authorized Pickups", leaves: [{ label: "Count" }, { label: "Summary" }] },
    { label: "Emergency Contacts", leaves: [{ label: "Count" }, { label: "Summary" }] },
    { label: "Assigned Employee", leaves: [{ label: "Name" }, { label: "Employee ID" }, { label: "Email" }] },
    { label: "Billing", leaves: [{ label: "Balance" }, { label: "Status" }, { label: "Autopay" }] },
    {
        label: "Program",
        leaves: [
            { label: "Name" },
            { label: "Schedule" },
            { label: "Desired Start" },
            { label: "Room" },
            { label: "Location" },
        ],
    },
    { label: "Stage & Status", leaves: [{ label: "Stage" }, { label: "Status" }, { label: "Location" }] },
];

/** Build a concept path string from branch + leaf. */
export function buildConceptPath(branch: string, leaf: string): string {
    return [CONCEPT_ROOT, branch, leaf].join(CONCEPT_SEP);
}

/** Parse a concept path into [root, branch, leaf] (best-effort). */
export function parseConceptPath(concept: string): { root: string; branch: string; leaf: string } {
    const parts = concept.split(CONCEPT_SEP).map((p) => p.trim());
    return { root: parts[0] ?? CONCEPT_ROOT, branch: parts[1] ?? "", leaf: parts[2] ?? "" };
}

/** All concept paths (flat) — handy for option lists / fallbacks. */
export function allConceptPaths(): string[] {
    return CONCEPT_TREE.flatMap((branch) => branch.leaves.map((leaf) => buildConceptPath(branch.label, leaf.label)));
}

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
}

type ChildRow = { display_name?: string | null; age?: string | null; outcome_status_label?: string | null };

function childRows(record: Record<string, unknown>): ChildRow[] {
    const raw = record._inquiry_children;
    return Array.isArray(raw) ? (raw as ChildRow[]) : [];
}

function pluralChildren(n: number): string {
    return n === 1 ? "1 child" : `${n} children`;
}

/**
 * Resolve a concept path to a display string for a record. `expanded` and
 * `maxRows` shape list-like concepts (Summary). Returns `null` when the record
 * has no value for the concept (caller renders a clean empty state).
 */
export function resolveConceptValue(
    concept: string,
    record: Record<string, unknown>,
    opts: { expanded?: boolean; maxRows?: number } = {},
): string | null {
    const { branch, leaf } = parseConceptPath(concept);
    const ident = (record._identity as Record<string, unknown> | null | undefined) ?? null;
    const primaryPerson = (ident?.primary_person as Record<string, unknown> | null | undefined) ?? null;
    const maxRows = opts.maxRows ?? 3;

    switch (branch) {
        case "Primary Contact":
            if (leaf === "Name")
                return trimOrNull(record["person.primary_contact_name"]) ?? trimOrNull(primaryPerson?.label);
            if (leaf === "Phone") return trimOrNull(record["person.primary_phone"]);
            if (leaf === "Email") return trimOrNull(record["person.primary_email"]);
            if (leaf === "Address") return trimOrNull(record["person.primary_address_line1"]);
            if (leaf === "City") return trimOrNull(record["person.primary_address_city"]);
            if (leaf === "State") return trimOrNull(record["person.primary_address_state"]);
            if (leaf === "ZIP") return trimOrNull(record["person.primary_address_postal_code"]);
            return null;
        case "Secondary Contact":
            if (leaf === "Name") return trimOrNull(record["person.secondary_contact_name"]);
            if (leaf === "Phone") return trimOrNull(record["person.secondary_phone"]);
            if (leaf === "Email") return trimOrNull(record["person.secondary_email"]);
            return null;
        case "Additional Contacts": {
            const names = [trimOrNull(record["person.secondary_contact_name"])].filter(Boolean) as string[];
            if (leaf === "Count") return names.length ? String(names.length) : null;
            if (leaf === "Summary") return names.length ? names.join(", ") : null;
            return null;
        }
        case "Children": {
            const rows = childRows(record);
            if (rows.length === 0) return null;
            if (leaf === "Count") return pluralChildren(rows.length);
            if (leaf === "Name") return trimOrNull(rows[0]?.display_name);
            if (leaf === "Age") return trimOrNull(rows[0]?.age);
            if (leaf === "Status") return trimOrNull(rows[0]?.outcome_status_label);
            if (leaf === "Current Room") return null;
            // Summary (default): names, honoring maxRows + expansion.
            const limit = opts.expanded ? rows.length : Math.min(maxRows, rows.length);
            const names = rows
                .slice(0, limit)
                .map((r) => trimOrNull(r.display_name) ?? "Child")
                .join(", ");
            const overflow = rows.length - limit;
            return overflow > 0 ? `${names} +${overflow}` : names;
        }
        case "Authorized Pickups":
        case "Emergency Contacts":
            // Not present in the demo record yet → honest empty state.
            return null;
        case "Assigned Employee":
            if (leaf === "Name") return trimOrNull(record["assigned_employee_name"]);
            if (leaf === "Employee ID") return trimOrNull(record["assigned_employee_id"]);
            if (leaf === "Email") return trimOrNull(record["assigned_employee_email"]);
            return null;
        case "Billing":
            if (leaf === "Balance") return trimOrNull(record["billing.balance"]);
            if (leaf === "Status") return trimOrNull(record["billing.status"]);
            if (leaf === "Autopay") return trimOrNull(record["billing.autopay"]);
            return null;
        case "Program":
            if (leaf === "Name") return trimOrNull(record["program.name"]);
            if (leaf === "Schedule") return trimOrNull(record["program.schedule"]);
            if (leaf === "Desired Start") return trimOrNull(record["child.start_date"]);
            if (leaf === "Room") return trimOrNull(record["child.room"]);
            if (leaf === "Location") return trimOrNull(record["opportunity.location"]);
            return null;
        case "Stage & Status":
            if (leaf === "Stage") return trimOrNull(record["queue_row.stage_label"]);
            if (leaf === "Status") return trimOrNull(record["opportunity.status_label"]);
            if (leaf === "Location") return trimOrNull(record["opportunity.location"]);
            return null;
        default:
            return null;
    }
}
