import type { FormIntakeChildHint, FormIntakeMeta } from "./formLeadCaptureTypes";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import {
    resolveGuardianFromCollectionEnvelope,
    type CollectionEnvelope,
    type EnvelopeGuardian,
} from "./resolveGuardianFromCollectionEnvelope";

/** Per-child value paths (repeater / multi-child forms). */
export type FormIntakeChildFieldPaths = {
    first_name?: string;
    last_name?: string;
    dob?: string;
    location_id?: string;
    program_room_cohort_key?: string;
    program_key?: string;
    schedule_type?: string;
    start_date?: string;
};

/** Top-level `values` field ids used to populate `payload.meta.intake` for lead capture (configurable per link). */
export type FormIntakeValueFieldPaths = {
    guardian_email?: string;
    guardian_phone?: string;
    guardian_full_name?: string;
    /** When set, overrides splitting `guardian_full_name`. */
    guardian_first_name?: string;
    guardian_last_name?: string;
    child_first_name?: string;
    child_last_name?: string;
    child_dob?: string;
    child_location_id?: string;
    child_program_room_cohort_key?: string;
    child_program_key?: string;
    child_schedule_type?: string;
    child_start_date?: string;
    /** Distinct children — when non-empty, overrides single `child_*` paths. */
    children?: FormIntakeChildFieldPaths[];
};

/** Default paths aligned with medication authorization demo and website inquiry field ids. */
export const DEFAULT_FORM_INTAKE_VALUE_PATHS: FormIntakeValueFieldPaths = {
    guardian_email: "guardian_email",
    guardian_phone: "guardian_phone",
    guardian_full_name: "guardian_full_name",
    guardian_first_name: "guardian_first_name",
    guardian_last_name: "guardian_last_name",
    child_first_name: "child_first_name",
    child_last_name: "child_last_name",
    child_dob: "child_dob",
    child_program_room_cohort_key: "program_room_preference",
    child_start_date: "start_date",
};

function readTrimmedString(values: Record<string, unknown>, fieldId: string | undefined): string | null {
    if (!fieldId) return null;
    const v = values[fieldId];
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
}

function splitFullName(full: string | null): { first_name: string | null; last_name: string | null } {
    if (!full) return { first_name: null, last_name: null };
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first_name: null, last_name: null };
    if (parts.length === 1) return { first_name: parts[0]!, last_name: null };
    return { first_name: parts[0]!, last_name: parts.slice(1).join(" ") };
}

function readUuidValue(values: Record<string, unknown>, fieldId: string | undefined): string | null {
    const t = readTrimmedString(values, fieldId);
    if (!t) return null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t) ? t : null;
}

function buildChildHintFromPaths(
    values: Record<string, unknown>,
    paths: FormIntakeChildFieldPaths
): FormIntakeChildHint | null {
    const childFirst = readTrimmedString(values, paths.first_name);
    const childLast = readTrimmedString(values, paths.last_name);
    const childDobRaw = readTrimmedString(values, paths.dob);
    const childDobValid =
        childDobRaw && /^\d{4}-\d{2}-\d{2}$/.test(childDobRaw) ? childDobRaw : null;
    const location_id = readUuidValue(values, paths.location_id);
    const program_room_cohort_key = readTrimmedString(values, paths.program_room_cohort_key);
    const program_key = readTrimmedString(values, paths.program_key);
    const schedule_type = readTrimmedString(values, paths.schedule_type);
    const start_dateRaw = readTrimmedString(values, paths.start_date);
    const start_date =
        start_dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(start_dateRaw) ? start_dateRaw : null;

    if (
        !childFirst &&
        !childLast &&
        !childDobValid &&
        !location_id &&
        !program_room_cohort_key &&
        !program_key &&
        !schedule_type &&
        !start_date
    ) {
        return null;
    }

    return {
        first_name: childFirst,
        last_name: childLast,
        dob: childDobValid,
        display_name:
            [childFirst, childLast].filter(Boolean).join(" ").trim() || childFirst || childLast || null,
        location_id,
        program_room_cohort_key,
        program_key,
        schedule_type,
        start_date,
    };
}

function mergeFieldPaths(linkMetadata: Record<string, unknown> | null | undefined): FormIntakeValueFieldPaths {
    const raw = linkMetadata?.intake_field_paths;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_FORM_INTAKE_VALUE_PATHS };
    return { ...DEFAULT_FORM_INTAKE_VALUE_PATHS, ...(raw as FormIntakeValueFieldPaths) };
}

export type BuildFormIntakeMetaResult =
    | { ok: true; intake: FormIntakeMeta }
    | { ok: false; reason_code: "missing_vertical" | "missing_guardian_contact"; reason: string };

/**
 * Builds `FormIntakeMeta` from top-level form values + link defaults.
 * Does not perform CRM I/O — {@link applyFormLeadCaptureIntake} consumes the result.
 */
export function buildFormIntakeMetaFromPayload(input: {
    values: Record<string, unknown>;
    linkMetadata: Record<string, unknown> | null | undefined;
    /** Stored on intake for trace only */
    submissionId?: string | null;
    /** Canonical structured representation of collection-bound responses (preferred source). */
    collectionEnvelope?: CollectionEnvelope | null;
    /** Published schema — supplies the nested field bindings the envelope values are keyed by. */
    schema?: FormSchemaV1 | null;
}): BuildFormIntakeMetaResult {
    const paths = mergeFieldPaths(input.linkMetadata ?? undefined);

    const verticalRaw =
        typeof input.linkMetadata?.default_vertical_id === "string"
            ? input.linkMetadata.default_vertical_id.trim()
            : null;
    const vertical_id = verticalRaw && /^[0-9a-f-]{36}$/i.test(verticalRaw) ? verticalRaw : null;
    if (!vertical_id) {
        return {
            ok: false,
            reason_code: "missing_vertical",
            reason: "Public link is missing default_vertical_id (required for CRM intake).",
        };
    }

    // ── guardian resolution: STRUCTURED FIRST, flat as fallback ─────────────────────────────────
    // The collection envelope is the canonical representation of a collection-bound response. When a
    // form projects guardians into a collection its flat guardian questions are suppressed, so flat
    // resolution alone would silently fail to open a case.
    const flatEmail = readTrimmedString(input.values, paths.guardian_email);
    const flatPhone = readTrimmedString(input.values, paths.guardian_phone);

    const structured = resolveGuardianFromCollectionEnvelope(input.collectionEnvelope, input.schema);
    const structuredGuardian: EnvelopeGuardian | null = structured.ok ? structured.primary : null;

    // A structured guardian that cannot be contacted is a REAL failure, not a reason to fall back to
    // flat values — falling back would quietly ignore what the respondent actually submitted.
    if (!structured.ok && structured.reason_code === "no_usable_contact") {
        return { ok: false, reason_code: "missing_guardian_contact", reason: structured.reason };
    }

    let email: string | null;
    let phone: string | null;
    let first_name: string | null;
    let last_name: string | null;
    let guardian_person_id: string | null = null;
    let guardian_source: "collection_envelope" | "flat_values" = "flat_values";
    let guardian_conflict: string | null = null;

    if (structuredGuardian) {
        guardian_source = "collection_envelope";
        email = structuredGuardian.email;
        phone = structuredGuardian.phone;
        first_name = structuredGuardian.first_name;
        last_name = structuredGuardian.last_name;
        guardian_person_id = structuredGuardian.person_id;

        // Do not silently merge. If a legacy flat value materially disagrees, record it for operator
        // review rather than picking one arbitrarily.
        const conflicts: string[] = [];
        if (flatEmail && structuredGuardian.email && flatEmail.toLowerCase() !== structuredGuardian.email.toLowerCase()) {
            conflicts.push("email");
        }
        if (flatPhone && structuredGuardian.phone && flatPhone.replace(/\D/g, "") !== structuredGuardian.phone.replace(/\D/g, "")) {
            conflicts.push("phone");
        }
        if (conflicts.length > 0) {
            guardian_conflict = `Flat guardian ${conflicts.join(" and ")} disagree(s) with the submitted parent/guardian collection; the collection was used and this needs operator review.`;
        }
    } else {
        email = flatEmail;
        phone = flatPhone;
        if (!email && !phone) {
            return {
                ok: false,
                reason_code: "missing_guardian_contact",
                reason: "Guardian email or phone is required for intake — map fields via link intake_field_paths or use default guardian_* field ids.",
            };
        }
        first_name = readTrimmedString(input.values, paths.guardian_first_name);
        last_name = readTrimmedString(input.values, paths.guardian_last_name);
        if (!first_name && !last_name) {
            const full = readTrimmedString(input.values, paths.guardian_full_name);
            const sp = splitFullName(full);
            first_name = sp.first_name;
            last_name = sp.last_name;
        }
    }

    const multiChildren =
        Array.isArray(paths.children) && paths.children.length > 0
            ? paths.children
                  .map((cp) => buildChildHintFromPaths(input.values, cp))
                  .filter((c): c is FormIntakeChildHint => c != null)
            : [];

    const singleChild =
        multiChildren.length === 0
            ? buildChildHintFromPaths(input.values, {
                  first_name: paths.child_first_name,
                  last_name: paths.child_last_name,
                  dob: paths.child_dob,
                  location_id: paths.child_location_id,
                  program_room_cohort_key: paths.child_program_room_cohort_key,
                  program_key: paths.child_program_key,
                  schedule_type: paths.child_schedule_type,
                  start_date: paths.child_start_date,
              })
            : null;

    const intake: FormIntakeMeta = {
        vertical_id,
        guardian: {
            email,
            phone,
            first_name,
            last_name,
            ...(guardian_person_id ? { person_id: guardian_person_id } : {}),
        },
        guardian_source,
        ...(guardian_conflict ? { guardian_conflict } : {}),
        // Every guardian the family submitted — selecting a lead contact must not discard the rest.
        ...(structured.all.length > 0 ? { guardians: structured.all } : {}),
        ...(multiChildren.length > 0
            ? { children: multiChildren }
            : singleChild
              ? { child: singleChild }
              : {}),
        idempotency_key: input.submissionId?.trim() || null,
    };

    return { ok: true, intake };
}
