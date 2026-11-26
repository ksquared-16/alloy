/**
 * D3 — the document type policy vocabulary, and the validation the Studio editor shows.
 *
 * The AUTHORITY is the database: `public.document_type_version_problems` (migration 20261209090100) runs on validate
 * and again on publish. This module mirrors it so the editor can show the same problems before a round trip; a test
 * pins the two to the same codes. Never decide authorization from this module alone.
 *
 * `default_sensitivity` is enforced by the database for new and re-typed documents, raise-only (D3). Since D5, subject
 * types, formats and review are enforced when a document is filed or uploaded, and replacement when it is filed or
 * replaced (`documentTypeEnforcement.ts`, `public.document_file`). Since D7, validity is EVALUATED on read: the
 * validity evaluator (`lib/documents/validity/documentValidity.ts`) derives valid / expiring soon / expired / date
 * missing, and an expired document no longer satisfies a requirement. No write is refused for validity.
 * `POLICY_ENFORCEMENT` says so, and the Studio labels each field accordingly.
 */
import { DECLARED_DOCUMENT_SENSITIVITIES, type DeclaredDocumentSensitivity } from "@/lib/documents/documentSensitivity";
import { DOCUMENT_SUBJECT_TYPES, type DocumentSubjectType } from "@/lib/documents/documentSubjects";
import type { DocumentContentKind } from "@/lib/documents/documentContentSignature";

export const DOCUMENT_TYPE_FORMATS: readonly DocumentContentKind[] = Object.freeze(["pdf", "png", "jpeg", "docx", "doc", "txt", "csv", "html"]);
export const REPLACEMENT_POLICIES = Object.freeze(["new_version", "new_document", "not_allowed"] as const);
export type ReplacementPolicy = (typeof REPLACEMENT_POLICIES)[number];
export const VALIDITY_KINDS = Object.freeze(["none", "explicit_date", "duration", "periodic_reconfirmation", "event_renewal"] as const);
export type ValidityKind = (typeof VALIDITY_KINDS)[number];
export const VALIDITY_UNITS = Object.freeze(["days", "months", "years"] as const);
/** Renewal events the platform can name today. A rule on any other event cannot be declared. */
export const VALIDITY_EVENTS = Object.freeze(["enrollment_start", "program_year_start", "birthday"] as const);

/** Must equal `public.document_medical_type_keys()` and MEDICAL_DOCUMENT_TYPES. */
export const MEDICAL_TYPE_KEYS: readonly string[] = Object.freeze(["physical", "immunization_record", "health_care_plan", "medication_authorization"]);

export const POLICY_ENFORCEMENT = Object.freeze({
    default_sensitivity: "enforced",
    review_required: "enforced_filing",
    replacement_policy: "enforced_replacement",
    allowed_formats: "enforced_filing",
    subject_types: "enforced_filing",
    validity_policy: "enforced_evaluation",
} as const);

export type ValidityPolicy = {
    kind: ValidityKind;
    value?: number;
    unit?: (typeof VALIDITY_UNITS)[number];
    event?: (typeof VALIDITY_EVENTS)[number];
    warning_days?: number[];
    review_on_renewal?: boolean;
};

export type DocumentTypeDraft = {
    label: string;
    description?: string | null;
    category_id: string | null;
    subject_types: DocumentSubjectType[];
    allowed_formats: DocumentContentKind[];
    default_sensitivity: DeclaredDocumentSensitivity;
    review_required: boolean;
    replacement_policy: ReplacementPolicy;
    validity_policy: ValidityPolicy;
};

export type PolicyProblem = { field: string; code: string };

/** The raise-only rule, as `public.document_sensitivity_raise`. */
export function raiseSensitivity(current: DeclaredDocumentSensitivity, proposed: DeclaredDocumentSensitivity): DeclaredDocumentSensitivity {
    if (proposed === "standard") return current;
    if (current === "standard") return proposed;
    if (proposed === "restricted") return "restricted";
    return current;
}

const isInt = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * The problems the database would report for this draft. `context` carries what only the server knows: the type key,
 * whether the category is an active category of the organization, and the published default it may not go below.
 */
export function documentTypeDraftProblems(
    draft: DocumentTypeDraft,
    context: { typeKey: string; categoryActive: boolean; publishedSensitivity: DeclaredDocumentSensitivity | null },
): PolicyProblem[] {
    const p: PolicyProblem[] = [];
    const label = (draft.label ?? "").trim();
    if (!label || draft.label.length > 120) p.push({ field: "label", code: "label_required" });
    if (!draft.category_id) p.push({ field: "category_id", code: "category_required" });
    else if (!context.categoryActive) p.push({ field: "category_id", code: "category_not_active" });
    if (!draft.subject_types?.length) p.push({ field: "subject_types", code: "subject_types_required" });
    else if (draft.subject_types.some((s) => !(DOCUMENT_SUBJECT_TYPES as readonly string[]).includes(s))) p.push({ field: "subject_types", code: "subject_type_unknown" });
    if (!draft.allowed_formats?.length) p.push({ field: "allowed_formats", code: "allowed_formats_required" });
    else if (draft.allowed_formats.some((f) => !DOCUMENT_TYPE_FORMATS.includes(f))) p.push({ field: "allowed_formats", code: "allowed_format_unknown" });
    if (!(DECLARED_DOCUMENT_SENSITIVITIES as readonly string[]).includes(draft.default_sensitivity)) {
        p.push({ field: "default_sensitivity", code: "sensitivity_unknown" });
    } else {
        if (MEDICAL_TYPE_KEYS.includes(context.typeKey) && draft.default_sensitivity !== "medical" && draft.default_sensitivity !== "restricted") {
            p.push({ field: "default_sensitivity", code: "medical_type_floor" });
        }
        if (context.publishedSensitivity && raiseSensitivity(context.publishedSensitivity, draft.default_sensitivity) !== draft.default_sensitivity) {
            p.push({ field: "default_sensitivity", code: "sensitivity_lowering" });
        }
    }
    if (!(REPLACEMENT_POLICIES as readonly string[]).includes(draft.replacement_policy)) p.push({ field: "replacement_policy", code: "replacement_unknown" });

    const vp = (draft.validity_policy ?? {}) as Record<string, unknown>;
    const kind = vp.kind as string | undefined;
    if (!kind || !(VALIDITY_KINDS as readonly string[]).includes(kind)) {
        p.push({ field: "validity_policy.kind", code: "validity_kind_unknown" });
        return p;
    }
    if (kind === "duration" || kind === "periodic_reconfirmation") {
        if (!isInt(vp.value, 1, 120)) p.push({ field: "validity_policy.value", code: "validity_value_range" });
        if (!(VALIDITY_UNITS as readonly string[]).includes(String(vp.unit ?? ""))) p.push({ field: "validity_policy.unit", code: "validity_unit_unknown" });
    } else if ("value" in vp || "unit" in vp) {
        p.push({ field: "validity_policy", code: "validity_fields_not_applicable" });
    }
    if (kind === "event_renewal") {
        if (!(VALIDITY_EVENTS as readonly string[]).includes(String(vp.event ?? ""))) p.push({ field: "validity_policy.event", code: "validity_event_unsupported" });
    } else if ("event" in vp) {
        p.push({ field: "validity_policy.event", code: "validity_fields_not_applicable" });
    }
    if ("warning_days" in vp) {
        const w = vp.warning_days;
        if (kind === "none") p.push({ field: "validity_policy.warning_days", code: "warning_without_expiry" });
        else if (!Array.isArray(w) || w.length > 5) p.push({ field: "validity_policy.warning_days", code: "warning_days_shape" });
        else {
            let prev = 400;
            for (const d of w) {
                if (!isInt(d, 1, 365) || (d as number) >= prev) {
                    p.push({ field: "validity_policy.warning_days", code: "warning_days_order" });
                    break;
                }
                prev = d as number;
            }
        }
    }
    if ("review_on_renewal" in vp && typeof vp.review_on_renewal !== "boolean") p.push({ field: "validity_policy.review_on_renewal", code: "review_on_renewal_boolean" });
    if (Object.keys(vp).some((k) => !["kind", "value", "unit", "event", "warning_days", "review_on_renewal"].includes(k))) {
        p.push({ field: "validity_policy", code: "validity_field_unknown" });
    }
    return p;
}

/** Normalize an untrusted request body into a draft. Unknown fields are dropped; the database validates the rest. */
export function parseDocumentTypeDraft(body: unknown): DocumentTypeDraft | null {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()) : []);
    const vp = b.validity_policy && typeof b.validity_policy === "object" ? (b.validity_policy as ValidityPolicy) : { kind: "none" as const };
    return {
        label: typeof b.label === "string" ? b.label.trim() : "",
        description: typeof b.description === "string" ? b.description.trim() || null : null,
        category_id: typeof b.category_id === "string" && b.category_id.trim() ? b.category_id.trim() : null,
        subject_types: [...new Set(arr(b.subject_types))] as DocumentSubjectType[],
        allowed_formats: [...new Set(arr(b.allowed_formats))] as DocumentContentKind[],
        default_sensitivity: (typeof b.default_sensitivity === "string" ? b.default_sensitivity : "standard") as DeclaredDocumentSensitivity,
        review_required: b.review_required === true,
        replacement_policy: (typeof b.replacement_policy === "string" ? b.replacement_policy : "new_version") as ReplacementPolicy,
        validity_policy: vp,
    };
}

export function slugKey(label: string): string {
    return label
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/^([0-9])/, "t_$1")
        .slice(0, 63);
}

export const KEY_RE = /^[a-z][a-z0-9_]{1,62}$/;
