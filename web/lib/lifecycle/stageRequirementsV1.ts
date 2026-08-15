/**
 * Stage requirements — canonical Business Process ownership of "this must be satisfied".
 *
 * Phase 1 of the Enrollment end-to-end program, under Director decision D-88.
 *
 * ## Why this lives on the stage record
 *
 * Requirements today are NOT owned by the versioned business-process configuration.
 * They sit in two sibling `departments.metadata` keys —
 * `lifecycle_builder_stage_field_rules_v1` and `lifecycle_progression_requirements_v1`
 * — which any `UPDATE departments SET metadata = …` may rewrite. The publication
 * write guard (migration 20260730130000) is deliberately narrow: it protects
 * `lifecycle_builder_v1` and states that *"unrelated `departments.metadata` keys are
 * untouched"*. So the stages of a process are versioned, immutable once published and
 * CAS-protected, while the requirements OF those stages are none of those things.
 *
 * This module closes that gap in the smallest way the existing contract allows: a
 * per-stage `requirements_v1` section carried inside the business-process payload,
 * exactly as `queue_membership_v1`, `status_rollup_v1`, `stage_operating_plan_v1`,
 * `perspectives_v1` and `action_catalog_v1` already are.
 *
 * Being inside the payload is the whole point. It inherits — with no migration, no new
 * table and no second authority — draft/revision versioning, the immutability trigger,
 * publish-time CAS, forward-only rollback, and the guarded projection into
 * `departments.metadata.lifecycle_builder_v1`.
 *
 * ## What this module does NOT own
 *
 * Business Process owns *that* an artifact is required. It never owns the artifact:
 *
 *   - **Forms** own form definitions and versions. A requirement references a
 *     `form_definition_id`; it does not copy a schema, a version or a field.
 *   - **Fields** own field definitions. A `field` requirement references an existing
 *     `rule_id` from the lifecycle field-requirement catalog — the same identifier the
 *     legacy path uses, so nothing is re-keyed.
 *   - **Documents / submissions** own the evidence that a requirement was satisfied.
 *
 * Consequently a requirement stores an IDENTITY and never a copy. Changing a form's
 * internals must not rewrite the requirement, and cannot: the requirement holds only
 * the definition id.
 *
 * ## Dimensions stay independent
 *
 * `kind`, `scope`, `timing`, `enforcement` and `level` are five separate axes and are
 * deliberately not collapsed into one enum. Scope, timing and enforcement are REUSED
 * from `requirementTimingTypes`, and level from `lifecycleStageRequirementLevels`,
 * rather than redeclared — a second copy of those vocabularies would be the parallel
 * requirement engine that doctrine forbids.
 *
 * Pure. No I/O, no clock, no Supabase.
 *
 * @see lib/lifecycle/requirementTimingTypes.ts — timing/scope/enforcement, reused verbatim
 * @see lib/lifecycle/stageActionCatalogV1.ts — the stage sub-section idiom this follows
 * @see docs/platform/governance/configuration-publication-model.md
 */

import type { PersistedRequirementLevel } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type {
    RequirementEnforcement,
    RequirementScope,
    RequirementTiming,
} from "@/lib/lifecycle/requirementTimingTypes";

/**
 * The requirement kinds Business Process is architecturally capable of requiring.
 *
 * The full vocabulary is declared here — not only the executable subset — because a
 * field-only contract would have to be replaced later (D-89). Declaring a kind is a
 * statement about what BP may own, NOT a claim that the platform can execute it; that
 * second question is answered by {@link REQUIREMENT_KINDS_AUTHORABLE_V1}.
 */
export const REQUIREMENT_KINDS_V1 = [
    "field",
    "form",
    "document",
    "consent",
    "acknowledgment",
    "signature",
] as const;

export type RequirementKindV1 = (typeof REQUIREMENT_KINDS_V1)[number];

/**
 * The kinds Phase 1 will actually accept from an author.
 *
 * `field` — the legacy path already resolves, evaluates and enforces rule ids.
 * `form`  — Forms owns published definitions, and `form_submissions` already proves
 *           satisfaction, so a form requirement is executable end to end today.
 *
 * The other four are refused at authoring time and the reason is concrete rather than
 * "not implemented yet":
 *
 *   - `document`      — no canonical document-requirement owner exists. Evidence lives
 *                       in `form_submission_documents`, which is scoped to a submission,
 *                       so a document required OUTSIDE a form has nowhere to be proven.
 *   - `consent`       — no canonical consent record exists anywhere in the platform. A
 *                       consent is currently only a form control, and a control cannot
 *                       carry withdrawal, versioned policy text, or an audit trail.
 *   - `acknowledgment`— same gap as consent, minus the withdrawal semantics.
 *   - `signature`     — `form_submission_signatures` exists, but only bound to a form
 *                       submission; a standalone signature requirement has no evidence
 *                       owner.
 *
 * Refusing them keeps the vocabulary honest: the architecture admits the kind, and the
 * platform refuses to pretend it can satisfy it. Fabricating an implementation to make
 * all six green is exactly what this constant exists to prevent.
 */
export const REQUIREMENT_KINDS_AUTHORABLE_V1: readonly RequirementKindV1[] = Object.freeze([
    "field",
    "form",
]);

/** Why a declared kind cannot yet be authored. Surfaced to operators and to controls. */
export const REQUIREMENT_KIND_UNSUPPORTED_REASON_V1: Readonly<
    Record<Exclude<RequirementKindV1, "field" | "form">, string>
> = Object.freeze({
    document:
        "No canonical document-requirement owner exists. Document evidence is bound to a form submission, so a document required outside a form has no owner that can prove it was satisfied.",
    consent:
        "No canonical consent record exists. A consent is currently only a form control, which cannot carry withdrawal, versioned policy text, or an audit trail.",
    acknowledgment:
        "No canonical acknowledgment record exists. It is currently only a form control, so there is nothing durable to prove the acknowledgment occurred.",
    signature:
        "Signature evidence exists only as part of a form submission. A standalone signature requirement has no evidence owner.",
});

export function isAuthorableRequirementKind(kind: RequirementKindV1): boolean {
    return REQUIREMENT_KINDS_AUTHORABLE_V1.includes(kind);
}

/**
 * The referenced artifact, discriminated by kind.
 *
 * Identity only. A reference never carries a label, a schema, a version number or any
 * other copy of the artifact — those belong to the owning platform and would go stale
 * the moment the owner changed them.
 *
 * `form` deliberately references the DEFINITION and not a version: an org requires
 * "the immunization form", not "version 3 of the immunization form". Version selection
 * at satisfaction time belongs to Forms.
 */
export type RequirementRefV1 =
    | { readonly kind: "field"; readonly rule_id: string }
    | { readonly kind: "form"; readonly form_definition_id: string }
    | { readonly kind: "document"; readonly document_type_key: string }
    | { readonly kind: "consent"; readonly consent_key: string }
    | { readonly kind: "acknowledgment"; readonly acknowledgment_key: string }
    | { readonly kind: "signature"; readonly signature_key: string };

export type StageRequirementV1 = {
    /** Stable within the stage. Identity for level/meta lookups and for operator edits. */
    readonly requirement_id: string;
    readonly ref: RequirementRefV1;
    readonly level: PersistedRequirementLevel;
    /** Absent means the owning evaluator's default applies; it does not mean "record". */
    readonly scope?: RequirementScope;
    readonly timing?: RequirementTiming | readonly RequirementTiming[];
    readonly enforcement?: RequirementEnforcement;
    readonly applies_to_transition_keys?: readonly string[];
    readonly excluded_transition_keys?: readonly string[];
};

export type StageRequirementsV1 = {
    readonly version: 1;
    readonly requirements: readonly StageRequirementV1[];
};

const LEVELS: ReadonlySet<string> = new Set(["recommended", "required", "enforced"]);
const SCOPES: ReadonlySet<string> = new Set([
    "record",
    "primary_contact",
    "any_child",
    "each_child",
    "relationship",
]);
const TIMINGS: ReadonlySet<string> = new Set([
    "record_creation",
    "stage_progress",
    "stage_exit",
    "process_completion",
]);
const ENFORCEMENTS: ReadonlySet<string> = new Set(["informational", "attention", "blocking"]);

function trimmedString(raw: unknown): string {
    return typeof raw === "string" ? raw.trim() : "";
}

function stringList(raw: unknown): string[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: string[] = [];
    for (const item of raw) {
        const t = trimmedString(item);
        if (t && !out.includes(t)) out.push(t);
    }
    return out.length > 0 ? out : undefined;
}

function parseTiming(raw: unknown): RequirementTiming | RequirementTiming[] | undefined {
    if (typeof raw === "string") {
        const t = raw.trim();
        return TIMINGS.has(t) ? (t as RequirementTiming) : undefined;
    }
    if (Array.isArray(raw)) {
        const out: RequirementTiming[] = [];
        for (const item of raw) {
            const t = trimmedString(item);
            if (TIMINGS.has(t) && !out.includes(t as RequirementTiming)) out.push(t as RequirementTiming);
        }
        return out.length > 0 ? out : undefined;
    }
    return undefined;
}

/**
 * Parses the reference for a declared kind.
 *
 * Returns null when the identifier is absent, which drops the requirement entirely
 * rather than admitting one that points at nothing. A requirement with no referent
 * cannot be satisfied and cannot be explained to an operator, so silently keeping it
 * would create a permanently unsatisfiable stage.
 */
function parseRef(kindRaw: unknown, row: Record<string, unknown>): RequirementRefV1 | null {
    const kind = trimmedString(kindRaw) as RequirementKindV1;
    if (!(REQUIREMENT_KINDS_V1 as readonly string[]).includes(kind)) return null;

    switch (kind) {
        case "field": {
            const rule_id = trimmedString(row.rule_id);
            return rule_id ? { kind, rule_id } : null;
        }
        case "form": {
            const form_definition_id = trimmedString(row.form_definition_id);
            return form_definition_id ? { kind, form_definition_id } : null;
        }
        case "document": {
            const document_type_key = trimmedString(row.document_type_key);
            return document_type_key ? { kind, document_type_key } : null;
        }
        case "consent": {
            const consent_key = trimmedString(row.consent_key);
            return consent_key ? { kind, consent_key } : null;
        }
        case "acknowledgment": {
            const acknowledgment_key = trimmedString(row.acknowledgment_key);
            return acknowledgment_key ? { kind, acknowledgment_key } : null;
        }
        case "signature": {
            const signature_key = trimmedString(row.signature_key);
            return signature_key ? { kind, signature_key } : null;
        }
    }
}

/**
 * Reads a stage's `requirements_v1` section.
 *
 * Absent or unreadable returns null — the caller then falls back to the legacy
 * compatibility projection. Null and "present but empty" are deliberately different:
 * an empty section is an author saying "this stage requires nothing", which must NOT
 * silently resurrect legacy metadata requirements.
 *
 * Malformed individual rows are skipped rather than failing the whole section, matching
 * every sibling stage parser. A row that cannot be read was never authorable through the
 * builder, so the realistic source is a newer writer, and dropping the process's entire
 * requirement set because one row is unreadable would be far more destructive than
 * ignoring it.
 */
export function parseStageRequirementsV1(raw: unknown): StageRequirementsV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;
    if (!Array.isArray(o.requirements)) return null;

    const requirements: StageRequirementV1[] = [];
    const seen = new Set<string>();

    for (const entry of o.requirements) {
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) continue;
        const row = entry as Record<string, unknown>;

        const requirement_id = trimmedString(row.requirement_id);
        if (!requirement_id || seen.has(requirement_id)) continue;

        const ref = parseRef(row.kind, row);
        if (!ref) continue;

        const levelRaw = trimmedString(row.level);
        // Level is required, not defaulted. Inferring "required" would silently promote
        // a row an author never classified, and inferring "recommended" would silently
        // demote one — both change enforcement behaviour without anyone saying so.
        if (!LEVELS.has(levelRaw)) continue;

        const scopeRaw = trimmedString(row.scope);
        const enforcementRaw = trimmedString(row.enforcement);

        seen.add(requirement_id);
        requirements.push({
            requirement_id,
            ref,
            level: levelRaw as PersistedRequirementLevel,
            ...(SCOPES.has(scopeRaw) ? { scope: scopeRaw as RequirementScope } : {}),
            ...(parseTiming(row.timing) ? { timing: parseTiming(row.timing)! } : {}),
            ...(ENFORCEMENTS.has(enforcementRaw)
                ? { enforcement: enforcementRaw as RequirementEnforcement }
                : {}),
            ...(stringList(row.applies_to_transition_keys)
                ? { applies_to_transition_keys: stringList(row.applies_to_transition_keys)! }
                : {}),
            ...(stringList(row.excluded_transition_keys)
                ? { excluded_transition_keys: stringList(row.excluded_transition_keys)! }
                : {}),
        });
    }

    return { version: 1, requirements };
}

/** Serializes back to the payload shape, flattening the ref discriminant onto the row. */
export function serializeStageRequirementsV1(value: StageRequirementsV1): Record<string, unknown> {
    return {
        version: 1,
        requirements: value.requirements.map((r) => ({
            requirement_id: r.requirement_id,
            kind: r.ref.kind,
            ...refFields(r.ref),
            level: r.level,
            ...(r.scope ? { scope: r.scope } : {}),
            ...(r.timing ? { timing: r.timing } : {}),
            ...(r.enforcement ? { enforcement: r.enforcement } : {}),
            ...(r.applies_to_transition_keys
                ? { applies_to_transition_keys: [...r.applies_to_transition_keys] }
                : {}),
            ...(r.excluded_transition_keys
                ? { excluded_transition_keys: [...r.excluded_transition_keys] }
                : {}),
        })),
    };
}

function refFields(ref: RequirementRefV1): Record<string, string> {
    switch (ref.kind) {
        case "field":
            return { rule_id: ref.rule_id };
        case "form":
            return { form_definition_id: ref.form_definition_id };
        case "document":
            return { document_type_key: ref.document_type_key };
        case "consent":
            return { consent_key: ref.consent_key };
        case "acknowledgment":
            return { acknowledgment_key: ref.acknowledgment_key };
        case "signature":
            return { signature_key: ref.signature_key };
    }
}

/** One form definition as the authoring gate needs to see it. */
export type KnownFormDefinition = {
    readonly id: string;
    /** Whether the definition has at least one version with status `published`. */
    readonly has_published_version: boolean;
};

export type FormReferenceRefusal = {
    readonly requirement_id: string;
    readonly form_definition_id: string;
    readonly code: "unknown_form" | "no_published_version";
    readonly detail: string;
};

/**
 * Validates form references against the definitions Forms actually owns.
 *
 * Dependency-injected rather than querying, so the rule stays pure and testable and so
 * Business Process never grows its own read path into Forms tables.
 *
 * Two distinct refusals, because they are different operator problems:
 *
 *  - **`unknown_form`** — the id resolves to nothing in this org. Configuration is
 *    referencing a form that does not exist, which can never be satisfied.
 *  - **`no_published_version`** — the form exists but has only drafts. This mirrors
 *    settled runtime doctrine rather than inventing a rule: `loadPacketProjection`
 *    selects versions `WHERE status = 'published'` and reports a form with none as
 *    missing. A requirement pointing at a draft-only form would therefore be
 *    permanently unsatisfiable at runtime, so authoring refuses it up front instead of
 *    letting an operator discover it through a parent who cannot finish enrolling.
 *
 * Note this validates the REFERENCE, not the version. Which published version answers
 * later is Forms' decision (highest published), and a form republished afterwards keeps
 * satisfying the same requirement — the requirement holds only the definition id.
 */
export function validateFormRequirementReferences(
    requirements: readonly StageRequirementV1[],
    knownForms: readonly KnownFormDefinition[],
): readonly FormReferenceRefusal[] {
    const byId = new Map(knownForms.map((f) => [f.id, f]));
    const refusals: FormReferenceRefusal[] = [];

    for (const req of requirements) {
        if (req.ref.kind !== "form") continue;
        const form = byId.get(req.ref.form_definition_id);
        if (!form) {
            refusals.push({
                requirement_id: req.requirement_id,
                form_definition_id: req.ref.form_definition_id,
                code: "unknown_form",
                detail: "This form does not exist in this organization, so the requirement can never be satisfied.",
            });
            continue;
        }
        if (!form.has_published_version) {
            refusals.push({
                requirement_id: req.requirement_id,
                form_definition_id: req.ref.form_definition_id,
                code: "no_published_version",
                detail: "This form has no published version. The runtime resolves published versions only, so the requirement would be permanently unsatisfiable.",
            });
        }
    }

    return refusals;
}

export type RequirementAuthoringRefusal = {
    readonly code: "unsupported_kind" | "missing_reference" | "invalid_level" | "duplicate_id";
    readonly detail: string;
};

/**
 * Authoring gate. Refuses what {@link parseStageRequirementsV1} would silently drop.
 *
 * The parser is lenient because it reads configuration that already exists; this is
 * strict because it decides what may ENTER configuration. A kind the platform cannot
 * satisfy is refused here with its concrete missing-owner reason, so an operator is
 * told why rather than watching a saved requirement disappear.
 */
export function refuseUnauthorableRequirement(
    candidate: Pick<StageRequirementV1, "requirement_id" | "ref" | "level">,
    existingIds: readonly string[] = [],
): RequirementAuthoringRefusal | null {
    if (!candidate.requirement_id.trim()) {
        return { code: "missing_reference", detail: "A requirement must carry a stable requirement_id." };
    }
    if (existingIds.includes(candidate.requirement_id)) {
        return {
            code: "duplicate_id",
            detail: `requirement_id "${candidate.requirement_id}" is already used on this stage.`,
        };
    }
    if (!isAuthorableRequirementKind(candidate.ref.kind)) {
        const reason =
            REQUIREMENT_KIND_UNSUPPORTED_REASON_V1[
                candidate.ref.kind as Exclude<RequirementKindV1, "field" | "form">
            ];
        return { code: "unsupported_kind", detail: reason };
    }
    if (!LEVELS.has(candidate.level)) {
        return { code: "invalid_level", detail: `Unknown requirement level "${candidate.level}".` };
    }
    return null;
}
