import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import {
    PACKET_REVIEW_INSIGHT_CONTRACT_VERSION,
    PACKET_REVIEW_INSIGHT_HUMAN_AUTHORITY_NOTE,
    type PacketReviewInsightChecklistItem,
    type PacketReviewInsightV1,
    type PacketReviewReadinessState,
} from "@/lib/forms/packets/packetReviewInsightTypes";
import { buildPacketNeedsAttentionItems } from "@/lib/forms/review/packetNeedsAttentionItems";
import { operatorReviewStatusLabel, warningKindPresentationLabel } from "@/lib/forms/review/formsReviewPresentation";

const MAX_LIST_ITEMS = 7;
const MAX_ATTENTION = 5;

function cap(items: string[], max: number): string[] {
    return items.filter((s) => s.trim()).slice(0, max);
}

function deriveReadinessState(rollup: PacketReviewRollupV1): PacketReviewReadinessState {
    const decision = rollup.operator_review.status;
    if (rollup.status === "cancelled") return "blocked";
    if (decision === "approved") return "approved";
    if (decision === "rejected") return "rejected";
    if (decision === "needs_correction") return "awaiting_correction";
    if (rollup.status === "in_progress") return "incomplete";
    if (rollup.progress.submitted_steps < rollup.progress.total_steps) return "incomplete";

    const attention = buildPacketNeedsAttentionItems(rollup);
    if (attention.length > 0 || rollup.operator_review.warnings.length > 0) {
        return "needs_attention";
    }
    if (rollup.status === "completed" && (decision == null || decision === "needs_review")) {
        return "ready_for_review";
    }
    return "needs_attention";
}

function buildSummaryBullets(rollup: PacketReviewRollupV1): string[] {
    const bullets: string[] = [];
    const defName = rollup.packet_definition.name?.trim() || "Packet session";
    const { progress } = rollup;

    bullets.push(`${defName}: ${progress.submitted_steps} of ${progress.total_steps} step(s) submitted.`);

    const sessionLabel =
        rollup.status === "completed" ? "Session complete"
        : rollup.status === "cancelled" ? "Session cancelled"
        : "Session in progress";
    bullets.push(`${sessionLabel}. Review status: ${operatorReviewStatusLabel(rollup.operator_review.status)}.`);

    const warningCount = rollup.operator_review.warnings.length;
    if (warningCount > 0) {
        bullets.push(
            `${warningCount} operator hint${warningCount === 1 ? "" : "s"} flagged — compare submitted answers with known records.`
        );
    }

    const { linkage_summary: link } = rollup;
    if (link.any_intake_needs_review || link.steps_missing_crm_fk > 0) {
        const parts: string[] = [];
        if (link.steps_missing_crm_fk > 0) {
            parts.push(`${link.steps_missing_crm_fk} step(s) may need CRM linkage`);
        }
        if (link.any_intake_needs_review) {
            parts.push("intake review flagged on one or more steps");
        }
        bullets.push(`${parts.join("; ")}.`);
    }

    const pdfCount = rollup.documents_index.filter((d) => d.kind === "generated_pdf").length;
    const recordCount = rollup.documents_index.filter((d) => d.kind === "submitted_record").length;
    if (pdfCount > 0 || recordCount > 0) {
        const docParts: string[] = [];
        if (pdfCount > 0) docParts.push(`${pdfCount} generated PDF${pdfCount === 1 ? "" : "s"}`);
        if (recordCount > 0) docParts.push(`${recordCount} submitted record${recordCount === 1 ? "" : "s"}`);
        bullets.push(`Documents on file: ${docParts.join(" and ")}.`);
    }

    return cap(bullets, MAX_LIST_ITEMS);
}

function buildKeyChanges(rollup: PacketReviewRollupV1): string[] {
    return cap(
        rollup.operator_review.warnings.map((w) => {
            const kind = warningKindPresentationLabel(w.kind);
            return w.message.trim() ? `${kind}: ${w.message.trim()}` : kind;
        }),
        MAX_LIST_ITEMS
    );
}

function buildAttentionItems(rollup: PacketReviewRollupV1): string[] {
    return cap(buildPacketNeedsAttentionItems(rollup).map((i) => i.message), MAX_ATTENTION);
}

function buildConfidenceNotes(rollup: PacketReviewRollupV1): string[] {
    const notes: string[] = [];

    for (const step of rollup.steps) {
        const label = step.form_name?.trim() || `Step ${step.sequence_index + 1}`;
        if (step.artifact.kind === "submitted_record") {
            notes.push(`${label}: submitted form record on file — no separate PDF for this step.`);
            continue;
        }
        if (step.has_pdf_mapping && step.artifact.kind === "pending") {
            notes.push(`${label}: PDF mapping exists — generated file may still be processing.`);
            continue;
        }
        if (step.has_pdf_mapping && step.artifact.documents.length === 0 && step.submission_status === "submitted") {
            notes.push(`${label}: submitted answers on file — generated PDF not listed yet.`);
            continue;
        }
        const alsoGenerated = step.artifact.documents.filter((d) => d.generation_label === "also_generated");
        if (alsoGenerated.length > 0) {
            notes.push(`${label}: earlier PDF version(s) exist — latest is marked current.`);
        }
    }

    if (rollup.documents_index.length === 0 && rollup.progress.submitted_steps > 0) {
        notes.push("No artifacts indexed yet — submitted steps may still be processing documents.");
    }

    return cap(notes, MAX_LIST_ITEMS);
}

function buildChecklist(
    rollup: PacketReviewRollupV1,
    readiness: PacketReviewReadinessState
): PacketReviewInsightChecklistItem[] {
    const { progress, linkage_summary: link } = rollup;
    const allSubmitted = progress.submitted_steps >= progress.total_steps && rollup.status !== "in_progress";
    const linkageOk = !link.any_intake_needs_review && link.steps_missing_crm_fk === 0;
    const warningsOk = rollup.operator_review.warnings.length === 0;
    const intakeOk = !rollup.steps.some((s) => s.intake_meta?.intake_needs_review);

    return [
        {
            key: "steps_submitted",
            label: "All steps submitted",
            status: allSubmitted ? "ok" : rollup.status === "cancelled" ? "blocked" : "attention",
        },
        {
            key: "crm_linkage",
            label: "Record linkage",
            status: linkageOk ? "ok" : link.steps_missing_crm_fk > 0 ? "blocked" : "attention",
        },
        {
            key: "intake_review",
            label: "Intake review",
            status: intakeOk && !link.any_intake_needs_review ? "ok" : "attention",
        },
        {
            key: "operator_warnings",
            label: "Operator hints",
            status: warningsOk ? "ok" : "attention",
        },
        {
            key: "ready_to_decide",
            label: "Ready to decide",
            status:
                readiness === "ready_for_review" ? "ok"
                : readiness === "approved" || readiness === "rejected" ? "ok"
                : readiness === "blocked" ? "blocked"
                : "attention",
        },
    ];
}

function buildSuggestedFocus(rollup: PacketReviewRollupV1, readiness: PacketReviewReadinessState): string {
    if (readiness === "incomplete") {
        return "Finish remaining steps, then return here for a full review pass.";
    }
    if (readiness === "blocked") {
        return "This session was cancelled — use submitted records below for audit only.";
    }
    if (readiness === "approved" || readiness === "rejected") {
        return "Decision is recorded. Open documents or submissions if you need to verify what was on file.";
    }
    if (readiness === "awaiting_correction") {
        return "Confirm correction requests are clear, then re-open this review when resubmitted.";
    }
    const linkage = buildPacketNeedsAttentionItems(rollup);
    if (linkage.length > 0) {
        return "Resolve linkage and intake flags first, then compare answers and documents before deciding.";
    }
    if (rollup.operator_review.warnings.length > 0) {
        return "Compare highlighted differences with known records, then scan submitted forms and documents.";
    }
    if (readiness === "ready_for_review") {
        return "When answers and documents look correct, approve or request correction explicitly.";
    }
    return "Review submitted forms and documents, then record your decision.";
}

function buildReviewPaths(rollup: PacketReviewRollupV1, readiness: PacketReviewReadinessState): string[] {
    const paths: string[] = [];
    if (buildPacketNeedsAttentionItems(rollup).length > 0) {
        paths.push("Investigate linkage and intake flags");
    }
    if (rollup.operator_review.warnings.length > 0) {
        paths.push("Review what changed against records");
    }
    paths.push("Scan submitted forms and documents");
    if (readiness === "ready_for_review" || readiness === "needs_attention" || readiness === "awaiting_correction") {
        paths.push("Approve or request correction when satisfied");
    }
    return cap(paths, MAX_LIST_ITEMS);
}

/** Deterministic insight from rollup only — no AI, no writes. */
export function buildPacketReviewInsightV1(rollup: PacketReviewRollupV1): PacketReviewInsightV1 {
    const readiness_state = deriveReadinessState(rollup);
    return {
        contract_version: PACKET_REVIEW_INSIGHT_CONTRACT_VERSION,
        packet_session_id: rollup.packet_session_id,
        readiness_state,
        summary_bullets: buildSummaryBullets(rollup),
        key_changes: buildKeyChanges(rollup),
        attention_items: buildAttentionItems(rollup),
        suggested_focus: buildSuggestedFocus(rollup, readiness_state),
        review_paths: buildReviewPaths(rollup, readiness_state),
        confidence_notes: buildConfidenceNotes(rollup),
        human_authority_note: PACKET_REVIEW_INSIGHT_HUMAN_AUTHORITY_NOTE,
        checklist: buildChecklist(rollup, readiness_state),
    };
}
