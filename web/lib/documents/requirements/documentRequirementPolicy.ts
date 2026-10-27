/**
 * D6 — the document requirement vocabulary, and the validation the Studio editor shows.
 *
 * The AUTHORITY is the database: `public.document_requirement_version_problems` (migration 20261212090000) runs on
 * validate and again on publish. This module mirrors it so the editor can show the same problems before a round trip;
 * a test pins the two to the same codes. Never decide authorization from this module alone.
 *
 * No server imports: the Studio editor imports it.
 */
export const REQUIREMENT_SUBJECT_TYPES = Object.freeze(["household", "person", "child", "opportunity"] as const);
export type RequirementSubjectType = (typeof REQUIREMENT_SUBJECT_TYPES)[number];

/** Grains a Business Process scope can resolve: the journey's child, its household, or its case. */
export const BUSINESS_PROCESS_SCOPE_SUBJECT_TYPES: readonly RequirementSubjectType[] = Object.freeze(["child", "household", "opportunity"]);

export const REQUIREMENT_POLICIES = Object.freeze(["required", "optional"] as const);
export type RequirementPolicy = (typeof REQUIREMENT_POLICIES)[number];

export type RequirementScope =
    | { kind: "all" }
    | { kind: "business_process"; process_key: string; stage_keys?: string[] };
export type RequirementTiming = { kind: "immediate" } | { kind: "within_days"; days: number };

export type DocumentRequirementDraft = {
    label: string;
    description?: string | null;
    document_type_key: string;
    subject_type: RequirementSubjectType;
    scope: RequirementScope;
    timing: RequirementTiming;
    policy: RequirementPolicy;
    waivable: boolean;
    effective_from: string | null;
    effective_until: string | null;
};

export type RequirementProblem = { field: string; code: string };

const KEY = /^[a-z][a-z0-9_]{0,62}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The problems the database would report for this draft. `context` carries what only the server knows: the published
 * subject types of the named Studio type (null when the type is not published and active), and whether another live
 * requirement already covers the same type, grain and scope.
 */
export function documentRequirementDraftProblems(
    draft: DocumentRequirementDraft,
    context: { typeSubjectTypes: readonly string[] | null; duplicate: boolean },
): RequirementProblem[] {
    const p: RequirementProblem[] = [];
    const label = typeof draft.label === "string" ? draft.label.trim() : "";
    if (label.length === 0 || draft.label.length > 120) p.push({ field: "label", code: "label_required" });
    if (!(REQUIREMENT_SUBJECT_TYPES as readonly string[]).includes(draft.subject_type)) p.push({ field: "subject_type", code: "subject_type_unsupported" });
    if (context.typeSubjectTypes === null) p.push({ field: "document_type_key", code: "document_type_not_published" });
    else if (!context.typeSubjectTypes.includes(draft.subject_type)) p.push({ field: "subject_type", code: "subject_type_not_accepted_by_type" });

    const scope = draft.scope as unknown;
    const sk = isRecord(scope) ? scope.kind : undefined;
    if (sk !== "all" && sk !== "business_process") {
        p.push({ field: "scope.kind", code: "scope_kind_unknown" });
    } else if (sk === "all") {
        if (Object.keys(scope as object).some((k) => k !== "kind")) p.push({ field: "scope", code: "scope_field_unknown" });
    } else {
        const s = scope as Record<string, unknown>;
        if (typeof s.process_key !== "string" || !KEY.test(s.process_key)) p.push({ field: "scope.process_key", code: "scope_process_required" });
        if ("stage_keys" in s) {
            const keys = s.stage_keys;
            if (!Array.isArray(keys) || keys.length > 20 || keys.some((k) => typeof k !== "string" || !KEY.test(k))) {
                p.push({ field: "scope.stage_keys", code: "scope_stage_keys_shape" });
            }
        }
        if (!BUSINESS_PROCESS_SCOPE_SUBJECT_TYPES.includes(draft.subject_type)) p.push({ field: "scope", code: "scope_grain_unsupported" });
        if (Object.keys(s).some((k) => !["kind", "process_key", "stage_keys"].includes(k))) p.push({ field: "scope", code: "scope_field_unknown" });
    }

    const timing = draft.timing as unknown;
    const tk = isRecord(timing) ? timing.kind : undefined;
    if (tk !== "immediate" && tk !== "within_days") {
        p.push({ field: "timing.kind", code: "timing_kind_unknown" });
    } else if (tk === "within_days") {
        const t = timing as Record<string, unknown>;
        if (typeof t.days !== "number" || !Number.isInteger(t.days) || t.days < 1 || t.days > 365) p.push({ field: "timing.days", code: "timing_days_range" });
        if (Object.keys(t).some((k) => k !== "kind" && k !== "days")) p.push({ field: "timing", code: "timing_field_unknown" });
    } else if (Object.keys(timing as object).some((k) => k !== "kind")) {
        p.push({ field: "timing", code: "timing_field_unknown" });
    }

    if (draft.effective_from && draft.effective_until && draft.effective_until < draft.effective_from) {
        p.push({ field: "effective_until", code: "effective_range_inverted" });
    }
    if (context.duplicate) p.push({ field: "document_type_key", code: "requirement_duplicate" });
    return p;
}

/** Normalize an untrusted request body into a draft. Shape errors surface as validation problems, not exceptions. */
export function parseDocumentRequirementDraft(body: unknown): DocumentRequirementDraft {
    const b = isRecord(body) ? body : {};
    const date = (v: unknown) => (typeof v === "string" && DATE.test(v) ? v : null);
    return {
        label: typeof b.label === "string" ? b.label.trim() : "",
        description: typeof b.description === "string" && b.description.trim() ? b.description.trim().slice(0, 2000) : null,
        document_type_key: typeof b.document_type_key === "string" ? b.document_type_key.trim() : "",
        subject_type: (typeof b.subject_type === "string" ? b.subject_type : "") as RequirementSubjectType,
        scope: (isRecord(b.scope) ? b.scope : { kind: "all" }) as RequirementScope,
        timing: (isRecord(b.timing) ? b.timing : { kind: "immediate" }) as RequirementTiming,
        policy: b.policy === "optional" ? "optional" : "required",
        waivable: b.waivable === true,
        effective_from: date(b.effective_from),
        effective_until: date(b.effective_until),
    };
}
