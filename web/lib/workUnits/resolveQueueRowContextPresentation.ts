/**
 * Safe presentation selector for `_queue_row_context` with legacy row fallbacks.
 * Used by layout-runtime queue card / proof paths — does not change queue membership.
 *
 * @see docs/system/work-unit-surface-context-contract.md
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type {
    QueueRowAttentionSummary,
    QueueRowContext,
    QueueRowPrimaryContact,
    QueueRowWorkSummary,
    RelatedSubjectSummary,
    SubjectPlacementContext,
} from "@/lib/workUnits/lifecycleSubjectContracts";

export type QueueRowContextPresentationDebug = {
    contextPresent: boolean;
    placementPresent: boolean;
    placementOmittedMixed: boolean;
    contractVersion: string | null;
};

export type QueueRowRelatedChildPresentation = {
    subject_id: string;
    display_name: string;
    status_label: string;
    program_label: string | null;
    room_label: string | null;
    schedule_label: string | null;
};

export type QueueRowContextPresentation = {
    primaryLabel: string;
    stageLabel: string;
    statusLabel: string;
    caseFamilyLabel: string;
    primaryContact: QueueRowPrimaryContact | null;
    placementSummary: string | null;
    relatedChildrenSummary: QueueRowRelatedChildPresentation[];
    attentionSummary: QueueRowAttentionSummary | null;
    workSummary: QueueRowWorkSummary | null;
    debug: QueueRowContextPresentationDebug;
};

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

export function readQueueRowContextFromRow(
    row: Record<string, unknown> | ProofRuntimeRecord | null | undefined,
): QueueRowContext | null {
    if (!row) return null;
    const raw = row._queue_row_context;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as QueueRowContext;
}

export function formatSubjectPlacementSummary(placement: SubjectPlacementContext | null | undefined): string | null {
    if (!placement) return null;
    const parts = [
        trimOrNull(placement.location_label),
        trimOrNull(placement.program_label),
        trimOrNull(placement.room_label),
        trimOrNull(placement.schedule_label),
    ].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join(" · ") : null;
}

function relatedSubjectPlacementSignature(subject: RelatedSubjectSummary): string {
    return [
        trimOrNull(subject.location_id) ?? "",
        trimOrNull(subject.location_label) ?? "",
        trimOrNull(subject.program_label) ?? "",
        trimOrNull(subject.room_label) ?? "",
        trimOrNull(subject.schedule_label) ?? "",
    ].join("|");
}

/** True when inquiry children had mixed placement so adapter omitted `placement_context`. */
export function inferPlacementOmittedBecauseMixed(context: QueueRowContext): boolean {
    if (context.placement_context) return false;
    const summaries = context.related_subjects_summary ?? [];
    if (summaries.length < 2) return false;
    const signatures = summaries
        .map(relatedSubjectPlacementSignature)
        .filter((sig) => sig.replace(/\|/g, "").length > 0);
    if (signatures.length < 2) return false;
    const unique = new Set(signatures);
    return unique.size > 1;
}

function mapRelatedSubjectsSummary(
    summaries: RelatedSubjectSummary[] | undefined,
): QueueRowRelatedChildPresentation[] {
    if (!summaries?.length) return [];
    return summaries
        .filter((s) => trimOrNull(s.display_name))
        .map((s) => ({
            subject_id: s.subject_id,
            display_name: trimOrNull(s.display_name) ?? "—",
            status_label: trimOrNull(s.status_label) ?? "—",
            program_label: trimOrNull(s.program_label),
            room_label: trimOrNull(s.room_label),
            schedule_label: trimOrNull(s.schedule_label),
        }));
}

function legacyPrimaryLabel(record: Record<string, unknown>): string | null {
    return (
        trimOrNull(record.name)
        ?? trimOrNull(record["customer.display_name"])
        ?? trimOrNull(record["opportunity.title"])
        ?? trimOrNull(record.title)
    );
}

function legacyStatusLabel(record: Record<string, unknown>): string | null {
    return (
        trimOrNull(record["opportunity.status_label"])
        ?? trimOrNull(record._status_display)
        ?? trimOrNull(record.status_key)
    );
}

function legacyPlacementSummary(record: Record<string, unknown>): string | null {
    const parts = [
        trimOrNull(record["opportunity.location"]),
        trimOrNull(record["opportunity.program"]),
        trimOrNull(record["child.program"]),
        trimOrNull(record["child.location"]),
    ].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join(" · ") : null;
}

function legacyPrimaryContact(record: Record<string, unknown>): QueueRowPrimaryContact | null {
    const display_name =
        trimOrNull(record["person.primary_contact_name"])
        ?? trimOrNull(record["person.name"])
        ?? trimOrNull(record.contact_name);
    if (!display_name) return null;
    return {
        display_name,
        phone: trimOrNull(record["person.primary_phone"]) ?? trimOrNull(record["person.phone"]),
        email: trimOrNull(record["person.primary_email"]) ?? trimOrNull(record["person.email"]),
    };
}

function legacyAttentionSummary(record: Record<string, unknown>): QueueRowAttentionSummary | null {
    const reason =
        trimOrNull(record["opportunity.attention_reason"])
        ?? trimOrNull(record._attention_reason_label)
        ?? trimOrNull(record._attention);
    if (!reason) return null;
    return { needs_attention: true, primary_reason_label: reason };
}

/**
 * Read queue row presentation from `_queue_row_context` when present, else legacy record fields.
 */
export function resolveQueueRowContextPresentation(input: {
    context?: QueueRowContext | null;
    legacy?: { record?: Record<string, unknown> | ProofRuntimeRecord | null };
}): QueueRowContextPresentation {
    const record = (input.legacy?.record ?? {}) as Record<string, unknown>;
    const context = input.context ?? readQueueRowContextFromRow(record);

    if (!context) {
        const primaryLabel = legacyPrimaryLabel(record) ?? "Record";
        return {
            primaryLabel,
            stageLabel: trimOrNull(record.row_stage) ?? "",
            statusLabel: legacyStatusLabel(record) ?? "",
            caseFamilyLabel: primaryLabel,
            primaryContact: legacyPrimaryContact(record),
            placementSummary: legacyPlacementSummary(record),
            relatedChildrenSummary: [],
            attentionSummary: legacyAttentionSummary(record),
            workSummary: null,
            debug: {
                contextPresent: false,
                placementPresent: Boolean(legacyPlacementSummary(record)),
                placementOmittedMixed: false,
                contractVersion: null,
            },
        };
    }

    const primaryLabel =
        trimOrNull(context.case_context?.display_name)
        ?? trimOrNull(context.row_subject?.display_name)
        ?? legacyPrimaryLabel(record)
        ?? "Record";

    const statusLabel =
        trimOrNull(context.row_status_label)
        ?? legacyStatusLabel(record)
        ?? "";

    const stageLabel = trimOrNull(context.row_stage) ?? "";

    const placementSummary =
        formatSubjectPlacementSummary(context.placement_context)
        ?? legacyPlacementSummary(record);

    const primaryContact = context.primary_contact ?? legacyPrimaryContact(record);

    const relatedChildrenSummary = mapRelatedSubjectsSummary(context.related_subjects_summary);

    const attentionSummary = context.attention_summary ?? legacyAttentionSummary(record);

    return {
        primaryLabel,
        stageLabel,
        statusLabel,
        caseFamilyLabel: trimOrNull(context.case_context?.display_name) ?? primaryLabel,
        primaryContact,
        placementSummary,
        relatedChildrenSummary,
        attentionSummary,
        workSummary: context.work_summary ?? null,
        debug: {
            contextPresent: true,
            placementPresent: Boolean(context.placement_context),
            placementOmittedMixed: inferPlacementOmittedBecauseMixed(context),
            contractVersion: trimOrNull(context.contract_version),
        },
    };
}
