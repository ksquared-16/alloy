/**
 * Opportunity → {@link FactBag} for placement evaluation (Card 5).
 * Pure extraction only — **no** buckets, tiers, or QueueService wiring.
 */

import type { FactBag, FactValue } from "@/lib/orchestration/placement/placementPriorityTypes";
import {
    CHILDCARE_PLACEMENT_FACT_START_DATE,
    CHILDCARE_PLACEMENT_FACT_FLAG_COMMUNITY_PRIORITY,
    CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD,
    CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED,
    CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER,
    CHILDCARE_PLACEMENT_FACT_FLAG_STAFF_HOUSEHOLD,
    CHILDCARE_PLACEMENT_FACT_PROGRAM_ROOM_GROUP,
    CHILDCARE_PLACEMENT_FACT_WAIT_SINCE,
} from "@/lib/orchestration/placement/childcarePlacementFactContractV1";
import { parseEnrollmentOperationalFromMetadata } from "@/lib/opportunities/enrollmentOperationalMetadata";

/** Matches queue DB row / `OpportunityRowPreview` core fields (before CRM enrichment). */
export type OpportunityPlacementFactSource = {
    created_at?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type BuildOpportunityPlacementFactsOptions = {
    /**
     * When no explicit `wait_since` is found, use **`created_at`** as ISO basis for FIFO tie-break.
     * **Documented opt-in** — default **false** so FIFO stays explicit via enrollment ops metadata.
     */
    wait_since_fallback_created_at?: boolean;
};

function safeMetadata(metadata: OpportunityPlacementFactSource["metadata"]): Record<string, unknown> {
    if (metadata != null && typeof metadata === "object" && !Array.isArray(metadata)) {
        return metadata;
    }
    return {};
}

function parseIsoInstant(raw: unknown): string | null {
    if (raw == null || typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) return null;
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? t : null;
}

function booleanFact(raw: unknown, sourceLabel: string): FactValue | null {
    if (raw === "unknown" || raw === "pending" || raw === "pending_verification") {
        return { presence: "unknown", source: sourceLabel };
    }
    if (raw === true || raw === false) return { presence: "present", value: raw, source: sourceLabel };
    if (raw === "true") return { presence: "present", value: true, source: sourceLabel };
    if (raw === "false") return { presence: "present", value: false, source: sourceLabel };
    return null;
}

function readNested(root: Record<string, unknown>, path: string[]): unknown {
    let cur: unknown = root;
    for (const p of path) {
        if (cur == null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
        cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
}

function firstDefined<T>(...vals: (T | undefined | null)[]): T | undefined {
    for (const v of vals) {
        if (v !== undefined && v !== null) return v;
    }
    return undefined;
}

/**
 * Reads boolean-like facts from conventional metadata locations (flat + nested); **does not** infer from CRM rows.
 */
function readBooleanPlacementFact(md: Record<string, unknown>, factKey: string): FactValue {
    const inputs = readNested(md, ["placement_fact_inputs_v1"]) as Record<string, unknown> | undefined;

    const candidates: Array<{ raw: unknown; source: string }> = [
        { raw: md[factKey], source: `metadata.${factKey}` },
        { raw: inputs?.[factKey], source: "metadata.placement_fact_inputs_v1" },
        {
            raw: readNested(md, ["enrollment_placement", factKey]),
            source: "metadata.enrollment_placement",
        },
    ];

    for (const { raw, source } of candidates) {
        const b = booleanFact(raw, source);
        if (b) return b;
    }

    return { presence: "absent", source: "not_set" };
}

function extractWaitSince(
    md: Record<string, unknown>,
    created_at: string | null | undefined,
    opts: BuildOpportunityPlacementFactsOptions
): FactValue {
    const eo = parseEnrollmentOperationalFromMetadata(md);
    if (eo.wait_since) {
        return { presence: "present", value: eo.wait_since, source: "metadata.enrollment_operational.wait_since" };
    }

    const rootWs = parseIsoInstant(md.wait_since);
    if (rootWs) {
        return { presence: "present", value: rootWs, source: "metadata.wait_since" };
    }

    if (opts.wait_since_fallback_created_at === true) {
        const ca = typeof created_at === "string" ? created_at.trim() : "";
        if (ca && Number.isFinite(Date.parse(ca))) {
            return { presence: "present", value: ca, source: "created_at_fallback_documented" };
        }
    }

    return { presence: "absent", source: "no_wait_since" };
}

function extractStartDate(md: Record<string, unknown>): FactValue {
    // `desired_start_date` here is the opportunity-level legacy metadata key — not the OCM column.
    const ds = parseIsoInstant(md.desired_start_date);
    if (ds) {
        return { presence: "present", value: ds, source: "metadata.desired_start_date" };
    }
    const nested = parseIsoInstant(readNested(md, ["placement_fact_inputs_v1", "desired_start_date"]));
    if (nested) {
        return { presence: "present", value: nested, source: "metadata.placement_fact_inputs_v1.desired_start_date" };
    }
    return { presence: "absent", source: "no_start_date" };
}

/**
 * Sister-center / transfer signals → **`flag_sister_center`** (adapter boundary only).
 */
function extractSisterCenter(md: Record<string, unknown>): FactValue {
    const direct = booleanFact(md.flag_sister_center, "metadata.flag_sister_center");
    if (direct && direct.presence !== "absent") return direct;

    const transferRaw = firstDefined(
        md.sister_center_transfer,
        readNested(md, ["enrollment_placement", "sister_center_transfer"]),
        readNested(md, ["placement_fact_inputs_v1", "sister_center_transfer"]),
        readNested(md, ["placement_fact_inputs_v1", "flag_sister_center"])
    );
    const t = booleanFact(transferRaw, "metadata.sister_center_transfer");
    if (t && t.presence !== "absent") return t;

    return { presence: "absent", source: "no_sister_center_signal" };
}

/**
 * Sibling enrollment flag — explicit **`unknown`** strings supported for verification-pending UX.
 */
function extractSiblingEnrolled(md: Record<string, unknown>): FactValue {
    const inputs = readNested(md, ["placement_fact_inputs_v1"]) as Record<string, unknown> | undefined;

    const raw = firstDefined(
        md.flag_sibling_enrolled,
        inputs?.flag_sibling_enrolled,
        readNested(md, ["enrollment_placement", "flag_sibling_enrolled"]),
        md.sibling_enrollment_status
    );

    const b = booleanFact(raw, "metadata.flag_sibling_enrolled");
    if (b && b.presence !== "absent") return b;

    return { presence: "absent", source: "no_sibling_flag" };
}

function extractProgramRoomGroup(md: Record<string, unknown>): FactValue {
    const inputs = readNested(md, ["placement_fact_inputs_v1"]) as Record<string, unknown> | undefined;
    const fromInputs = typeof inputs?.program_room_group === "string" ? inputs.program_room_group.trim() : "";
    if (fromInputs) {
        return {
            presence: "present",
            value: fromInputs,
            source: "metadata.placement_fact_inputs_v1.program_room_group",
        };
    }

    const direct = typeof md.program_room_group === "string" ? md.program_room_group.trim() : "";
    if (direct) {
        return { presence: "present", value: direct, source: "metadata.program_room_group" };
    }

    const pl = typeof md.program_label === "string" ? md.program_label.trim() : "";
    if (pl) {
        return { presence: "present", value: pl, source: "metadata.program_label_fallback" };
    }

    return { presence: "absent", source: "no_program_room_group" };
}

/**
 * Build childcare contract **`FactBag`** from opportunity row data available to **`QueueService`** today (`metadata`, `created_at`).
 */
export function buildOpportunityPlacementFacts(
    row: OpportunityPlacementFactSource,
    options: BuildOpportunityPlacementFactsOptions = {}
): FactBag {
    const md = safeMetadata(row.metadata);

    return {
        [CHILDCARE_PLACEMENT_FACT_WAIT_SINCE]: extractWaitSince(md, row.created_at ?? null, options),
        [CHILDCARE_PLACEMENT_FACT_START_DATE]: extractStartDate(md),
        [CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD]: readBooleanPlacementFact(md, CHILDCARE_PLACEMENT_FACT_FLAG_EMPLOYEE_HOUSEHOLD),
        [CHILDCARE_PLACEMENT_FACT_FLAG_STAFF_HOUSEHOLD]: readBooleanPlacementFact(md, CHILDCARE_PLACEMENT_FACT_FLAG_STAFF_HOUSEHOLD),
        [CHILDCARE_PLACEMENT_FACT_FLAG_COMMUNITY_PRIORITY]: readBooleanPlacementFact(md, CHILDCARE_PLACEMENT_FACT_FLAG_COMMUNITY_PRIORITY),
        [CHILDCARE_PLACEMENT_FACT_FLAG_SIBLING_ENROLLED]: extractSiblingEnrolled(md),
        [CHILDCARE_PLACEMENT_FACT_FLAG_SISTER_CENTER]: extractSisterCenter(md),
        [CHILDCARE_PLACEMENT_FACT_PROGRAM_ROOM_GROUP]: extractProgramRoomGroup(md),
    };
}
