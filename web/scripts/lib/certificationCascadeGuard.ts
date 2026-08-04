/**
 * Cascade safety and exact-set preservation.
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md
 *
 * WHY THIS EXISTS
 *
 * The 2026-08-04 reset deleted a protected configuration row nobody selected. `locations.customer_id`
 * references `customers(id)` ON DELETE CASCADE, so removing a customer silently took a location with
 * it — `locations: 21 → 20`.
 *
 * The guard inventory had enumerated RESTRICT foreign keys, which BLOCK a delete and announce
 * themselves by failing. It never enumerated CASCADE / SET NULL / SET DEFAULT, which do the exact
 * opposite: they succeed, quietly, and change rows outside the deletion graph.
 *
 * And the verification could not catch it, because it asserted only that a protected table still had
 * SOME rows. "Still has something" is not "unchanged"; for a preservation contract only the second
 * one means anything.
 */

/** Tables whose contents are configuration and must survive a certification reset untouched. */
export const PROTECTED_CONFIG_TABLES = [
    "orgs",
    "locations",
    "location_types",
    "location_program_categories",
    "departments",
    "work_units",
    "status_definitions",
    "field_definitions",
    "field_section_definitions",
    "action_definitions",
    "action_placements",
    "entity_layouts",
    "option_sets",
    "form_definitions",
    "form_definition_versions",
    "form_packet_definitions",
    "form_packet_items",
    "schedule_patterns",
    "programs",
    "program_offerings",
    "business_process_drafts",
    "business_process_revisions",
    "configuration_publications",
    "user_roles",
    "user_access_profiles",
    "user_department_access",
    "user_site_access",
    "communication_provider_accounts",
    "communication_identities",
] as const;

export type CascadeAction = "CASCADE" | "SET NULL" | "SET DEFAULT" | "RESTRICT" | "NO ACTION";

export type CascadeEdge = {
    /** Table that would be mutated when the parent row goes. */
    childTable: string;
    childColumn: string;
    /** Table inside the deletion graph. */
    parentTable: string;
    action: CascadeAction;
    /** Rows in the child that would actually be hit, for this org and this delete set. */
    affectedCount: number;
    affectedIds: string[];
};

export type CascadeClass =
    | "intended_dependent_deletion"
    | "protected_configuration_mutation"
    | "safe_nullification"
    | "unexpected_propagation";

export type CascadeVerdict = {
    edge: CascadeEdge;
    classification: CascadeClass;
    blocks: boolean;
    reason: string;
};

/**
 * Explicit policy for edges we have already adjudicated.
 *
 * `customers → locations` is the edge that cost a configuration row. The policy is NOT "allow it
 * now that we know" — it is that a location owned by an operational customer is an operational
 * artifact sitting in a configuration table, and the run must stop so a human says which it is.
 */
export const ADJUDICATED_EDGES: Record<string, { classification: CascadeClass; blocks: boolean; reason: string }> = {
    "locations.customer_id<-customers": {
        classification: "protected_configuration_mutation",
        blocks: true,
        reason:
            "A location owned by an operational customer is an operational artifact stored in a configuration " +
            "table. Deleting the customer silently deletes the location (this removed Firefly's 21st location " +
            "on 2026-08-04). The run must stop and the row be classified deliberately, not cascaded.",
    },
};

export function edgeKey(edge: Pick<CascadeEdge, "childTable" | "childColumn" | "parentTable">): string {
    return `${edge.childTable}.${edge.childColumn}<-${edge.parentTable}`;
}

/**
 * Classify one propagation edge.
 *
 * The default for anything unrecognised is to BLOCK. A propagation edge nobody has looked at is
 * exactly the shape that caused the loss, and there is no safe default reading of it.
 */
export function classifyCascadeEdge(edge: CascadeEdge, deletionGraphTables: readonly string[]): CascadeVerdict {
    const adjudicated = ADJUDICATED_EDGES[edgeKey(edge)];
    if (adjudicated) {
        return { edge, classification: adjudicated.classification, blocks: adjudicated.blocks, reason: adjudicated.reason };
    }

    const childIsProtected = (PROTECTED_CONFIG_TABLES as readonly string[]).includes(edge.childTable);
    const childInGraph = deletionGraphTables.includes(edge.childTable);

    // Nothing to propagate to — an edge with no affected rows cannot change anything.
    if (edge.affectedCount === 0) {
        return {
            edge,
            classification: childInGraph ? "intended_dependent_deletion" : "safe_nullification",
            blocks: false,
            reason: "no rows affected for this organization and delete set",
        };
    }

    if (childIsProtected) {
        return {
            edge,
            classification: "protected_configuration_mutation",
            blocks: true,
            reason: `${edge.action} would modify ${edge.affectedCount} row(s) in protected configuration table "${edge.childTable}"`,
        };
    }

    if (childInGraph && edge.action === "CASCADE") {
        return {
            edge,
            classification: "intended_dependent_deletion",
            blocks: false,
            reason: `"${edge.childTable}" is already inside the deletion contract; the cascade is redundant, not extra`,
        };
    }

    return {
        edge,
        classification: "unexpected_propagation",
        blocks: true,
        reason:
            `${edge.action} from "${edge.parentTable}" would touch ${edge.affectedCount} row(s) in ` +
            `"${edge.childTable}", which is outside the deletion contract and has no policy`,
    };
}

export function summariseCascadeVerdicts(verdicts: CascadeVerdict[]): { blocking: CascadeVerdict[]; ok: boolean } {
    const blocking = verdicts.filter((v) => v.blocks);
    return { blocking, ok: blocking.length === 0 };
}

// ---------------------------------------------------------------------------------------------
// Exact-set preservation
// ---------------------------------------------------------------------------------------------

export type PreservationSnapshot = Record<string, { count: number; idHash: string }>;

export type PreservationDelta = {
    table: string;
    beforeCount: number;
    afterCount: number;
    idsChanged: boolean;
    approved: boolean;
    problem: string | null;
};

/**
 * Compare exact preserved sets, not "is it still non-empty".
 *
 * `21 → 20` must fail. The previous check asked whether a table that had rows still had rows, which
 * a single silent cascade passes trivially.
 */
export function comparePreservation(
    before: PreservationSnapshot,
    after: PreservationSnapshot,
    approvedDeltas: Record<string, { expectedAfterCount: number; reason: string }> = {},
): { ok: boolean; deltas: PreservationDelta[] } {
    const deltas: PreservationDelta[] = [];

    for (const table of Object.keys(before).sort()) {
        const b = before[table];
        const a = after[table];
        const approved = approvedDeltas[table];

        if (!a) {
            deltas.push({
                table,
                beforeCount: b.count,
                afterCount: 0,
                idsChanged: true,
                approved: false,
                problem: `protected table "${table}" is missing from the post-reset snapshot`,
            });
            continue;
        }

        const idsChanged = a.idHash !== b.idHash;
        if (!idsChanged && a.count === b.count) {
            deltas.push({ table, beforeCount: b.count, afterCount: a.count, idsChanged: false, approved: false, problem: null });
            continue;
        }

        if (approved && a.count === approved.expectedAfterCount) {
            deltas.push({
                table,
                beforeCount: b.count,
                afterCount: a.count,
                idsChanged,
                approved: true,
                problem: null,
            });
            continue;
        }

        deltas.push({
            table,
            beforeCount: b.count,
            afterCount: a.count,
            idsChanged,
            approved: false,
            problem:
                a.count !== b.count
                    ? `protected table "${table}" changed from ${b.count} to ${a.count} rows`
                    : `protected table "${table}" kept its row count but its ID set changed`,
        });
    }

    return { ok: deltas.every((d) => d.problem === null), deltas };
}
