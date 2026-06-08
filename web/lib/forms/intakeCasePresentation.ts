/**
 * Derived Intake Case presentation model (IC-2).
 * Groups submission evidence into operator-facing situations — no persisted intake_cases table.
 */

import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { FORMS_MODULE_ROUTES } from "@/lib/forms/formsModuleNav";
import {
    enrollmentIntakeRequiresOperatorAttention,
    isCleanOperationalizedEnrollmentLead,
} from "@/lib/forms/intakeEnrollmentLeadClassification";
import type { IntakeCommandCenterSessionRow } from "@/lib/forms/intakeCommandCenterPresentation";
import {
    deriveSubmissionOperationalNarrative,
    submissionActivitySortKey,
    submissionFamilyLabel,
    type SubmissionOperationalNarrative,
} from "@/lib/forms/submissionOperationalNarrative";
import type { SubmissionAttachRow } from "@/lib/forms/submissionOutcomeSummary";
import {
    resolveSubmissionInboxLane,
    submissionInboxAttachRow,
    type SubmissionInboxLaneKey,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";

export type IntakeCaseAnchorType = "opportunity" | "packet_session" | "submission";

export type IntakeCaseStatusBucket =
    | "needs_attention"
    | "needs_linking"
    | "review_required"
    | "packet_in_progress"
    | "auto_operationalized"
    | "waiting"
    | "recent";

export type IntakeCaseReviewState =
    | "needs_review"
    | "needs_linking"
    | "packet_review_pending"
    | "in_progress"
    | "clear";

export type IntakeCaseOperationalizedState = "auto_operationalized" | "attached_existing" | "none";

/** Submission row plus optional packet/document hints from list APIs or joins. */
export type IntakeCaseSubmissionInput = SubmissionInboxRow & {
    packet_session_id?: string | null;
    has_generated_document?: boolean;
};

export type IntakeCasePresentationRow = {
    case_key: string;
    anchor_type: IntakeCaseAnchorType;
    anchor_id: string;
    display_title: string;
    subtitle: string;
    status_bucket: IntakeCaseStatusBucket;
    latest_activity_at: string;
    review_state: IntakeCaseReviewState;
    operationalized_state: IntakeCaseOperationalizedState;
    opportunity_id: string | null;
    packet_session_id: string | null;
    submission_ids: string[];
    submission_count: number;
    has_signature: boolean;
    has_generated_document: boolean;
    attention_reasons: string[];
    recommended_next_action: string;
    href: string;
    sort_key: string;
};

const BUCKET_PRIORITY: Record<IntakeCaseStatusBucket, number> = {
    needs_linking: 1,
    needs_attention: 2,
    review_required: 3,
    packet_in_progress: 4,
    waiting: 5,
    auto_operationalized: 6,
    recent: 7,
};

function metaRecord(payloadMeta: unknown): Record<string, unknown> {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) return {};
    return payloadMeta as Record<string, unknown>;
}

function payloadRecord(row: IntakeCaseSubmissionInput): Record<string, unknown> {
    const payload = row.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    return payload as Record<string, unknown>;
}

/** Resolve packet session id from explicit field or stamped submission meta. */
export function resolveSubmissionPacketSessionId(row: IntakeCaseSubmissionInput): string | null {
    const explicit = typeof row.packet_session_id === "string" ? row.packet_session_id.trim() : "";
    if (explicit) return explicit;

    const meta = metaRecord(row.payload?.meta);
    const stamped = typeof meta.packet_session_id === "string" ? meta.packet_session_id.trim() : "";
    return stamped || null;
}

/** Deterministic presentation-only group key (not persisted). */
export function resolveIntakeCaseGroupKey(row: IntakeCaseSubmissionInput): string {
    const opportunityId = typeof row.opportunity_id === "string" ? row.opportunity_id.trim() : "";
    if (opportunityId) return `opportunity:${opportunityId}`;

    const packetSessionId = resolveSubmissionPacketSessionId(row);
    if (packetSessionId) return `packet_session:${packetSessionId}`;

    return `submission:${row.id}`;
}

export function parseIntakeCaseGroupKey(caseKey: string): {
    anchor_type: IntakeCaseAnchorType;
    anchor_id: string;
} | null {
    const m = /^(opportunity|packet_session|submission):(.+)$/.exec(caseKey.trim());
    if (!m) return null;
    const anchor_type = m[1] as IntakeCaseAnchorType;
    const anchor_id = m[2]!.trim();
    if (!anchor_id) return null;
    return { anchor_type, anchor_id };
}

function submissionHasSignature(row: IntakeCaseSubmissionInput): boolean {
    const payload = payloadRecord(row);
    const sigs = payload.signatures;
    if (!sigs || typeof sigs !== "object" || Array.isArray(sigs)) return false;
    return Object.keys(sigs as Record<string, unknown>).length > 0;
}

function submissionHasDocument(row: IntakeCaseSubmissionInput): boolean {
    if (row.has_generated_document === true) return true;
    const meta = metaRecord(row.payload?.meta);
    return typeof meta.document_id === "string" && meta.document_id.trim().length > 0;
}

function isAmbiguousIntake(meta: Record<string, unknown>): boolean {
    const path = typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";
    return path === "ambiguous_contact" || path === "ambiguous_opportunity";
}

function submissionAttachRow(row: IntakeCaseSubmissionInput): SubmissionAttachRow {
    return submissionInboxAttachRow(row);
}

function submissionIsCleanOperationalizedLead(row: IntakeCaseSubmissionInput, meta: Record<string, unknown>): boolean {
    return isCleanOperationalizedEnrollmentLead({
        status: row.status,
        payloadMeta: meta,
        attachRow: submissionAttachRow(row),
    });
}

function submissionOperationalizedState(
    row: IntakeCaseSubmissionInput,
    lane: SubmissionInboxLaneKey,
    meta: Record<string, unknown>
): IntakeCaseOperationalizedState {
    const match = typeof meta.intake_opportunity_match === "string" ? meta.intake_opportunity_match.trim() : "";
    const needsReview = meta.intake_needs_review === true;
    if (submissionIsCleanOperationalizedLead(row, meta)) return "auto_operationalized";
    if (meta.intake_auto_operationalized === true && !needsReview) return "auto_operationalized";
    if ((match === "attached_existing" || meta.intake_resolution_path === "matched_email") && !needsReview) {
        return "attached_existing";
    }
    if (lane === "recentlySubmitted" && !needsReview && row.opportunity_id) return "auto_operationalized";
    return "none";
}

function submissionStatusBucket(
    row: IntakeCaseSubmissionInput,
    lane: SubmissionInboxLaneKey,
    meta: Record<string, unknown>,
    session: IntakeCommandCenterSessionRow | null
): IntakeCaseStatusBucket {
    if (isAmbiguousIntake(meta)) return "needs_attention";

    const packetSessionId = resolveSubmissionPacketSessionId(row);
    if (packetSessionId && session?.status === "in_progress") return "packet_in_progress";

    if (submissionIsCleanOperationalizedLead(row, meta)) return "auto_operationalized";

    if (lane === "needsLinking") return "needs_linking";
    if (lane === "needsReview") return "review_required";

    if (lane === "drafts") {
        if (packetSessionId && session?.status === "in_progress") return "packet_in_progress";
        return "waiting";
    }

    const opState = submissionOperationalizedState(row, lane, meta);
    if (opState === "attached_existing") return "auto_operationalized";
    if (opState === "auto_operationalized") return "auto_operationalized";
    return "recent";
}

function submissionReviewState(
    row: IntakeCaseSubmissionInput,
    lane: SubmissionInboxLaneKey,
    meta: Record<string, unknown>,
    session: IntakeCommandCenterSessionRow | null
): IntakeCaseReviewState {
    if (submissionIsCleanOperationalizedLead(row, meta)) return "clear";
    if (lane === "needsLinking") return "needs_linking";
    if (lane === "needsReview" || meta.intake_needs_review === true) return "needs_review";
    if (row.status === "draft") return "in_progress";

    const packetSessionId = resolveSubmissionPacketSessionId(row);
    if (packetSessionId && session) {
        if (session.status === "in_progress") return "in_progress";
        if (session.status === "completed") {
            const review = session.operator_review_status;
            if (review === "needs_review" || review === "needs_correction" || review == null) {
                return "packet_review_pending";
            }
        }
    }

    return "clear";
}

function pickHigherPriorityBucket(a: IntakeCaseStatusBucket, b: IntakeCaseStatusBucket): IntakeCaseStatusBucket {
    return BUCKET_PRIORITY[a] <= BUCKET_PRIORITY[b] ? a : b;
}

function pickReviewState(states: IntakeCaseReviewState[]): IntakeCaseReviewState {
    if (states.includes("needs_linking")) return "needs_linking";
    if (states.includes("needs_review")) return "needs_review";
    if (states.includes("packet_review_pending")) return "packet_review_pending";
    if (states.includes("in_progress")) return "in_progress";
    return "clear";
}

function pickOperationalizedState(states: IntakeCaseOperationalizedState[]): IntakeCaseOperationalizedState {
    if (states.includes("auto_operationalized")) return "auto_operationalized";
    if (states.includes("attached_existing")) return "attached_existing";
    return "none";
}

function attentionReasonFromNarrative(
    narrative: SubmissionOperationalNarrative,
    row: IntakeCaseSubmissionInput,
    meta: Record<string, unknown>
): string | null {
    if (submissionIsCleanOperationalizedLead(row, meta)) return null;
    if (enrollmentIntakeRequiresOperatorAttention({ payloadMeta: meta, attachRow: submissionAttachRow(row) })) {
        if (meta.intake_identity_name_mismatch === true) {
            return "Possible existing family match";
        }
    }
    if (narrative.lane === "needsLinking") return "Needs family match";
    if (narrative.lane === "needsReview") return "Review required before enrollment continues";
    if (narrative.headline.toLowerCase().includes("duplicate")) return "Needs family match";
    return null;
}

function buildDisplayTitle(
    rows: IntakeCaseSubmissionInput[],
    anchorType: IntakeCaseAnchorType,
    session: IntakeCommandCenterSessionRow | null,
    formsById: Record<string, string>
): string {
    const family =
        rows.map(submissionFamilyLabel).find((label) => typeof label === "string" && label.trim())?.trim() ?? null;

    const subject = family ?? "Intake";
    if (anchorType === "packet_session" && session?.packet_name?.trim()) {
        return `${subject} — ${session.packet_name.trim()}`;
    }

    if (rows.length > 1) {
        return `${subject} — Enrollment intake`;
    }

    const formName = formsById[rows[0]!.form_definition_id] ?? "Form";
    return `${subject} — ${formName} intake`;
}

function buildSubtitle(
    rows: IntakeCaseSubmissionInput[],
    narratives: SubmissionOperationalNarrative[],
    operationalized: IntakeCaseOperationalizedState
): string {
    const count = rows.length;
    const countLine =
        count === 1 ? "1 form received" : `${count} forms received`;

    const leadNarrative = narratives[0];
    if (!leadNarrative) return countLine;

    if (operationalized === "attached_existing") {
        return `${countLine} · Existing family update received`;
    }
    if (operationalized === "auto_operationalized") {
        return `${countLine} · New lead created`;
    }

    return `${countLine} · ${leadNarrative.detail}`;
}

function resolveCaseHref(
    anchorType: IntakeCaseAnchorType,
    anchorId: string,
    latestSubmission: IntakeCaseSubmissionInput
): string {
    if (anchorType === "packet_session") {
        return `${FORMS_MODULE_ROUTES.packetSessions}/${encodeURIComponent(anchorId)}`;
    }
    return `${ADMIN_FORMS_UI_BASE}/${encodeURIComponent(latestSubmission.form_definition_id)}/submissions/${encodeURIComponent(latestSubmission.id)}`;
}

function buildIntakeCaseFromGroup(params: {
    caseKey: string;
    rows: IntakeCaseSubmissionInput[];
    sessionsById: Map<string, IntakeCommandCenterSessionRow>;
    formsById: Record<string, string>;
}): IntakeCasePresentationRow {
    const parsed = parseIntakeCaseGroupKey(params.caseKey);
    const anchor_type = parsed?.anchor_type ?? "submission";
    const anchor_id = parsed?.anchor_id ?? params.rows[0]!.id;

    const sorted = [...params.rows].sort((a, b) =>
        submissionActivitySortKey(b).localeCompare(submissionActivitySortKey(a))
    );
    const latest = sorted[0]!;

    const opportunity_id =
        anchor_type === "opportunity" ? anchor_id
        : typeof latest.opportunity_id === "string" ? latest.opportunity_id
        : null;

    const packet_session_id =
        anchor_type === "packet_session" ? anchor_id : (
            sorted.map(resolveSubmissionPacketSessionId).find((id) => id) ?? null
        );

    const session = packet_session_id ? (params.sessionsById.get(packet_session_id) ?? null) : null;

    const perSubmission = sorted.map((row) => {
        const lane = resolveSubmissionInboxLane(row);
        const meta = metaRecord(row.payload?.meta);
        return {
            row,
            lane,
            meta,
            narrative: deriveSubmissionOperationalNarrative(row),
            bucket: submissionStatusBucket(row, lane, meta, session),
            review: submissionReviewState(row, lane, meta, session),
            operationalized: submissionOperationalizedState(row, lane, meta),
        };
    });

    const status_bucket = perSubmission.reduce(
        (acc, item) => pickHigherPriorityBucket(acc, item.bucket),
        perSubmission[0]!.bucket
    );
    const review_state = pickReviewState(perSubmission.map((item) => item.review));
    const operationalized_state = pickOperationalizedState(perSubmission.map((item) => item.operationalized));

    const attention_reasons = [
        ...new Set(
            perSubmission
                .map((item) => attentionReasonFromNarrative(item.narrative, item.row, item.meta))
                .filter((reason): reason is string => !!reason)
        ),
    ];

    const leadNarrative = perSubmission[0]!.narrative;
    let recommended_next_action = leadNarrative.operatorAction;
    if (status_bucket === "needs_linking") recommended_next_action = "Match to family profile";
    else if (status_bucket === "needs_attention") recommended_next_action = "Resolve duplicate match";
    else if (status_bucket === "review_required") recommended_next_action = "Review intake and continue enrollment";
    else if (status_bucket === "packet_in_progress") recommended_next_action = "Monitor until packet completes";
    else if (review_state === "packet_review_pending") recommended_next_action = "Review completed packet";
    else if (
        (status_bucket === "auto_operationalized" || status_bucket === "recent") &&
        opportunity_id
    ) {
        recommended_next_action = "Continue enrollment";
    }

    return {
        case_key: params.caseKey,
        anchor_type,
        anchor_id,
        display_title: buildDisplayTitle(sorted, anchor_type, session, params.formsById),
        subtitle: buildSubtitle(sorted, perSubmission.map((item) => item.narrative), operationalized_state),
        status_bucket,
        latest_activity_at: submissionActivitySortKey(latest),
        review_state,
        operationalized_state,
        opportunity_id,
        packet_session_id,
        submission_ids: sorted.map((row) => row.id),
        submission_count: sorted.length,
        has_signature: sorted.some(submissionHasSignature),
        has_generated_document: sorted.some(submissionHasDocument),
        attention_reasons,
        recommended_next_action,
        href: resolveCaseHref(anchor_type, anchor_id, latest),
        sort_key: submissionActivitySortKey(latest),
    };
}

/** Group submissions into deterministic intake case keys. */
export function groupSubmissionsByIntakeCaseKey(
    submissions: IntakeCaseSubmissionInput[]
): Map<string, IntakeCaseSubmissionInput[]> {
    const groups = new Map<string, IntakeCaseSubmissionInput[]>();
    const orderedKeys: string[] = [];

    for (const row of submissions) {
        const key = resolveIntakeCaseGroupKey(row);
        if (!groups.has(key)) {
            groups.set(key, []);
            orderedKeys.push(key);
        }
        groups.get(key)!.push(row);
    }

    return groups;
}

/** Build derived intake case rows from workspace submission/session list data. */
export function buildIntakeCasePresentationRows(params: {
    submissions: IntakeCaseSubmissionInput[];
    sessions?: IntakeCommandCenterSessionRow[];
    formsById?: Record<string, string>;
}): IntakeCasePresentationRow[] {
    const formsById = params.formsById ?? {};
    const sessionsById = new Map<string, IntakeCommandCenterSessionRow>();
    for (const session of params.sessions ?? []) {
        sessionsById.set(session.id, session);
    }

    const groups = groupSubmissionsByIntakeCaseKey(params.submissions);
    const cases: IntakeCasePresentationRow[] = [];

    for (const [caseKey, rows] of groups.entries()) {
        if (rows.length === 0) continue;
        cases.push(
            buildIntakeCaseFromGroup({
                caseKey,
                rows,
                sessionsById,
                formsById,
            })
        );
    }

    return cases.sort((a, b) => b.sort_key.localeCompare(a.sort_key));
}
