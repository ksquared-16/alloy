/**
 * Can this stage actually hand a parent the paperwork it says it requires?
 *
 * Configuration Health answers "is this process ready for OPERATORS" — a workspace tile, queue
 * views, a records query, an actions matrix. Measured against a real Enrolling stage requiring four
 * Forms, it reported HEALTHY without once asking whether any of those Forms could produce
 * participant work. A stage can require a Form that was never published, or ask a family to attach
 * a document without saying which document, and every operator-side check still passes.
 *
 * These are the participant-facing rows for that same surface. Each one exists because it is a way
 * the real configuration can be finished-looking and unusable, and each is decided from a fact an
 * authoritative owner already holds — Forms owns publication and schema, the requirement section
 * owns level and enforcement, the fidelity mapping owns whether a mark has somewhere to land.
 * Nothing here re-validates what another owner already refuses.
 *
 * Pure. The caller supplies the facts; this module only decides what they mean.
 */

/** What Forms already knows about one referenced definition. */
export type ReferencedFormFacts = {
    readonly form_definition_id: string;
    /** Absent means the requirement points at a definition that no longer resolves. */
    readonly exists: boolean;
    readonly name: string | null;
    readonly has_published_version: boolean;
    /** Questions on the published version — empty when there is no published version. */
    readonly published_field_count: number;
    /** Upload questions and the classification each carries, if any. */
    readonly uploads: ReadonlyArray<{ label: string; document_type: string | null; required: boolean }>;
    /** Signature questions on the published version. */
    readonly signature_field_ids: readonly string[];
    /** Signature field ids the fidelity mapping can actually place a mark for. */
    readonly signature_placement_field_ids: readonly string[];
    /** True when this form renders onto a source document (a fidelity mapping is present). */
    readonly renders_source_document: boolean;
};

export type StageFormRequirementFacts = {
    readonly requirement_id: string;
    readonly form_definition_id: string;
    readonly level: "recommended" | "required" | "enforced";
};

export type ParticipantReadinessCheckId =
    | "participant_work_exists"
    | "required_forms_published"
    | "required_forms_resolve"
    | "upload_requests_classified"
    | "signature_can_be_placed";

export type ParticipantReadinessCheck = {
    readonly id: ParticipantReadinessCheckId;
    readonly label: string;
    readonly pass: boolean;
    readonly summary: string;
    /** True when a passing row is a statement of fact rather than an achievement. */
    readonly informational?: boolean;
};

/*
 * Four rows below judge the live paperwork. With no live paperwork they judged an empty list and
 * reported "Every required form resolves" — three green ticks that had verified nothing, which read
 * as a healthy configuration sitting beside the one red row that was telling the truth.
 */
const NOTHING_LIVE_TO_CHECK = "Nothing to check — no paperwork is required in the live configuration.";

const ORDER: ParticipantReadinessCheckId[] = [
    "participant_work_exists",
    "required_forms_resolve",
    "required_forms_published",
    "upload_requests_classified",
    "signature_can_be_placed",
];

/** A requirement a family must actually satisfy, as opposed to one merely suggested to staff. */
function isParticipantObligation(r: StageFormRequirementFacts): boolean {
    return r.level === "required" || r.level === "enforced";
}

function list(names: readonly string[]): string {
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function nameOf(facts: ReferencedFormFacts | undefined, id: string): string {
    return facts?.name?.trim() || `a form that no longer exists (${id.slice(0, 8)})`;
}

/**
 * Decide the participant-facing readiness rows for one stage.
 *
 * Operator language throughout: the administrator is told what a family would hit, not which
 * contract field is unset.
 */
export function participantPaperworkReadiness(input: {
    readonly requirements: readonly StageFormRequirementFacts[];
    readonly forms: readonly ReferencedFormFacts[];
    /**
     * What the UNPUBLISHED draft would require, when it differs from what is live.
     *
     * These rows judge the LIVE configuration — that is what families meet, and saying a saved
     * change is already true would be the worst possible lie here. But reporting "no paperwork is
     * required" while the administrator is looking at a draft that adds it reads as though their
     * work was lost, which is exactly the confusion this whole investigation began with. So the
     * live answer is given first and the draft is named as pending, never as done.
     */
    readonly draftObligationCount?: number;
}): ParticipantReadinessCheck[] {
    const byId = new Map(input.forms.map((f) => [f.form_definition_id, f]));
    const obligations = input.requirements.filter(isParticipantObligation);

    const rows: ParticipantReadinessCheck[] = [];

    // 1. A stage that requires nothing of a family cannot hand them anything to do.
    rows.push({
        id: "participant_work_exists",
        label: "Families have paperwork to complete",
        pass: obligations.length > 0,
        summary: obligations.length
            ? `${obligations.length} form${obligations.length === 1 ? "" : "s"} a family must complete in this stage.`
            : (input.draftObligationCount ?? 0) > 0
              ? `No paperwork is required in the LIVE configuration, so a family reaches this stage with nothing to do. A saved draft change adds ${input.draftObligationCount} — publish it to apply.`
              : "No paperwork is required here, so a family reaches this stage with nothing to do.",
        informational: obligations.length > 0,
    });

    // 2. A requirement pointing at a definition that no longer resolves stops the launch.
    const missing = obligations.filter((r) => !byId.get(r.form_definition_id)?.exists);
    rows.push({
        id: "required_forms_resolve",
        label: "Required paperwork still exists",
        pass: missing.length === 0,
        summary: missing.length
            ? `${missing.length} requirement${missing.length === 1 ? "" : "s"} point at paperwork that has been deleted. Remove or replace ${missing.length === 1 ? "it" : "them"}.`
            : obligations.length ? "Every required form resolves." : NOTHING_LIVE_TO_CHECK,
    });

    // 3. Only a PUBLISHED version can be handed to a family.
    const unpublished = obligations
        .map((r) => byId.get(r.form_definition_id))
        .filter((f): f is ReferencedFormFacts => !!f && f.exists && !f.has_published_version);
    rows.push({
        id: "required_forms_published",
        label: "Required paperwork is published",
        pass: unpublished.length === 0,
        summary: unpublished.length
            ? `${list(unpublished.map((f) => f.name ?? "Untitled form"))} ${unpublished.length === 1 ? "is" : "are"} still a draft, so ${unpublished.length === 1 ? "it cannot" : "they cannot"} be sent to a family. Publish ${unpublished.length === 1 ? "it" : "them"} from Forms.`
            : obligations.length ? "Every required form has a published version." : NOTHING_LIVE_TO_CHECK,
    });

    // 4. An unclassified upload can be attached but never recognised.
    const unclassified: string[] = [];
    for (const r of obligations) {
        const f = byId.get(r.form_definition_id);
        if (!f?.exists || !f.has_published_version) continue;
        for (const u of f.uploads) {
            if (!u.required) continue;
            if (!(u.document_type ?? "").trim()) unclassified.push(`${f.name ?? "a form"} — ${u.label}`);
        }
    }
    rows.push({
        id: "upload_requests_classified",
        label: "Requested documents are identified",
        pass: unclassified.length === 0,
        summary: unclassified.length
            ? `${list(unclassified)} ${unclassified.length === 1 ? "asks" : "ask"} a family to attach a document without saying which document it is, so Alloy cannot tell them what they still owe.`
            : obligations.length ? "Every requested document is identified." : NOTHING_LIVE_TO_CHECK,
    });

    // 5. A signature on a rendered document needs somewhere on the page to land.
    const unplaceable: string[] = [];
    for (const r of obligations) {
        const f = byId.get(r.form_definition_id);
        if (!f?.exists || !f.has_published_version || !f.renders_source_document) continue;
        const placed = new Set(f.signature_placement_field_ids);
        if (f.signature_field_ids.some((id) => !placed.has(id))) unplaceable.push(f.name ?? "a form");
    }
    rows.push({
        id: "signature_can_be_placed",
        label: "Signatures land on the paperwork",
        pass: unplaceable.length === 0,
        summary: unplaceable.length
            ? `${list(unplaceable)} asks for a signature that has nowhere to appear on the document a family reviews.`
            : obligations.length ? "Every signature has a place on the document." : NOTHING_LIVE_TO_CHECK,
    });

    return ORDER.map((id) => rows.find((r) => r.id === id)!);
}

/** How the surface says it: READY TO USE, or NEEDS SETUP — N ITEMS. */
export function participantPaperworkHeadline(checks: readonly ParticipantReadinessCheck[]): string {
    const failing = checks.filter((c) => !c.pass).length;
    return failing === 0 ? "READY TO USE" : `NEEDS SETUP — ${failing} ITEM${failing === 1 ? "" : "S"}`;
}

/**
 * How each participant row is named on the shared activation checklist.
 *
 * Two vocabularies meet here — this module's own ids and the activation check union — so the
 * mapping is stated once rather than spelled out at the call site.
 */
export const PARTICIPANT_CHECK_ID_BY_READINESS_ID: Record<
    ParticipantReadinessCheckId,
    | "participant_work_exists"
    | "participant_forms_resolve"
    | "participant_forms_published"
    | "participant_uploads_classified"
    | "participant_signature_placement"
> = {
    participant_work_exists: "participant_work_exists",
    required_forms_resolve: "participant_forms_resolve",
    required_forms_published: "participant_forms_published",
    upload_requests_classified: "participant_uploads_classified",
    signature_can_be_placed: "participant_signature_placement",
};
