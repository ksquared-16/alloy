/**
 * Deterministic program / room cohort key + display label (Waitlist Phase 2 — Card 2).
 * Maps V1 metadata shapes to stable `program_room_cohort_key` slugs.
 */

export const UNKNOWN_PROGRAM_ROOM_COHORT_KEY = "unknown_program_room" as const;

export const UNKNOWN_PROGRAM_ROOM_GROUP_LABEL = "Program / room not specified" as const;

export type ResolveProgramRoomCohortInput = {
    /** Already-normalized cohort key on a placement_candidates row (wins when non-empty). */
    program_room_cohort_key?: string | null;
    program_room_group_label?: string | null;
    metadata?: Record<string, unknown> | null;
    /** Flat overrides (OCM row, opportunity metadata, etc.). */
    program_room_group?: string | null;
    program_label?: string | null;
    desired_program_type?: string | null;
};

export type ResolveProgramRoomCohortResult = {
    program_room_cohort_key: string;
    program_room_group_label: string;
    /** Which input won for the label (debug / backfill metadata). */
    label_source: string;
    /** Which input won for the raw label text before slugging. */
    key_source: string;
};

function safeMetadata(md: ResolveProgramRoomCohortInput["metadata"]): Record<string, unknown> {
    if (md != null && typeof md === "object" && !Array.isArray(md)) return md;
    return {};
}

function readNested(root: Record<string, unknown>, path: string[]): unknown {
    let cur: unknown = root;
    for (const p of path) {
        if (cur == null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
        cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
}

function trimString(raw: unknown): string | null {
    if (raw == null || typeof raw !== "string") return null;
    const t = raw.trim();
    return t.length ? t : null;
}

/** Stable lowercase slug for cohort partition keys. */
export function slugifyProgramRoomCohortKey(raw: string): string {
    const slug = raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return slug.length ? slug : UNKNOWN_PROGRAM_ROOM_COHORT_KEY;
}

/**
 * Resolve canonical cohort key + human label from V1/V2 placement metadata shapes.
 */
export function resolveProgramRoomCohort(input: ResolveProgramRoomCohortInput): ResolveProgramRoomCohortResult {
    const existingKey = trimString(input.program_room_cohort_key);
    if (existingKey) {
        const label =
            trimString(input.program_room_group_label) ??
            trimString(input.program_room_group) ??
            trimString(input.program_label) ??
            titleCaseFromSlug(existingKey);
        return {
            program_room_cohort_key: slugifyProgramRoomCohortKey(existingKey),
            program_room_group_label: label,
            label_source: "program_room_cohort_key",
            key_source: "program_room_cohort_key",
        };
    }

    const md = safeMetadata(input.metadata);
    const inputs = readNested(md, ["placement_fact_inputs_v1"]) as Record<string, unknown> | undefined;

    const cohortFromMeta = trimString(inputs?.program_room_cohort_key) ?? trimString(md.program_room_cohort_key);
    if (cohortFromMeta) {
        const label =
            trimString(input.program_room_group_label) ??
            trimString(inputs?.program_room_group) ??
            trimString(md.program_room_group) ??
            trimString(input.program_room_group) ??
            trimString(input.program_label) ??
            titleCaseFromSlug(cohortFromMeta);
        return {
            program_room_cohort_key: slugifyProgramRoomCohortKey(cohortFromMeta),
            program_room_group_label: label,
            label_source: "metadata.program_room_cohort_key",
            key_source: "metadata.program_room_cohort_key",
        };
    }

    const candidates: Array<{ raw: string; keySource: string; labelSource: string }> = [];

    const push = (raw: unknown, keySource: string, labelSource: string) => {
        const t = trimString(raw);
        if (t) candidates.push({ raw: t, keySource, labelSource });
    };

    push(input.program_room_group, "program_room_group", "program_room_group");
    push(inputs?.program_room_group, "metadata.placement_fact_inputs_v1.program_room_group", "metadata.placement_fact_inputs_v1.program_room_group");
    push(md.program_room_group, "metadata.program_room_group", "metadata.program_room_group");
    push(input.program_label, "program_label", "program_label");
    push(md.program_label, "metadata.program_label", "metadata.program_label");
    push(input.desired_program_type, "desired_program_type", "desired_program_type");
    push(inputs?.desired_program_type, "metadata.placement_fact_inputs_v1.desired_program_type", "metadata.placement_fact_inputs_v1.desired_program_type");
    push(md.desired_program_type, "metadata.desired_program_type", "metadata.desired_program_type");

    const memMeta = md;
    push(memMeta.demo_program_label, "metadata.demo_program_label", "metadata.demo_program_label");

    if (candidates.length) {
        const win = candidates[0]!;
        return {
            program_room_cohort_key: slugifyProgramRoomCohortKey(win.raw),
            program_room_group_label: win.raw,
            label_source: win.labelSource,
            key_source: win.keySource,
        };
    }

    return {
        program_room_cohort_key: UNKNOWN_PROGRAM_ROOM_COHORT_KEY,
        program_room_group_label: UNKNOWN_PROGRAM_ROOM_GROUP_LABEL,
        label_source: "fallback",
        key_source: "fallback",
    };
}

function titleCaseFromSlug(slug: string): string {
    if (slug === UNKNOWN_PROGRAM_ROOM_COHORT_KEY) return UNKNOWN_PROGRAM_ROOM_GROUP_LABEL;
    return slug
        .split("_")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}
