/**
 * P5A — project canonical related-record proposals into Processing collection evidence (read-only review VM).
 */

import type {
    ProposalDiagnostic,
    RelatedRecordInstanceProposal,
    RelatedRecordProposalBundle,
    RelatedRecordProposalOrigin,
    RelatedRecordProposalStatus,
} from "@/lib/intake/proposals/types";
import { worstRelatedRecordProposalStatus } from "@/lib/intake/proposals/normalize";
import {
    collectionGroupTitle,
    identityLabelFromValues,
} from "@/lib/pos/processingCase/collection/collectionDisplayAdapters";
import type {
    ProcessingCollectionDiagnostic,
    ProcessingCollectionDiagnosticCode,
    ProcessingCollectionFieldBinding,
    ProcessingCollectionGroupEvidence,
    ProcessingCollectionInstanceProposal,
    ProcessingCollectionProposalStatus,
    ProcessingCollectionSourceEvidence,
} from "@/lib/pos/processingCase/collection/types";

export type ProjectRelatedRecordProposalsContext = {
    processingCaseId?: string | null;
    fallbackGroupLabel?: (collectionKey: string, providerRef: string) => string;
};

function mapDiagnosticCode(code: ProposalDiagnostic["code"]): ProcessingCollectionDiagnosticCode {
    switch (code) {
        case "collection_mismatch":
            return "envelope_group_mismatch";
        case "invalid_existing_record_id":
            return "invalid_existing_item_id";
        case "unsupported_item_entity":
            return "unsupported_iteration_entity";
        case "missing_source_context":
            return "missing_schema_context";
        case "source_empty":
            return "envelope_empty";
        case "inaccessible_record":
            return "inaccessible_item";
        default:
            return code as ProcessingCollectionDiagnosticCode;
    }
}

function mapDiagnostics(diagnostics: ProposalDiagnostic[]): ProcessingCollectionDiagnostic[] {
    return diagnostics.map((d) => ({
        code: mapDiagnosticCode(d.code),
        message: d.message,
        path: d.path,
    }));
}

function mapOrigin(origin: RelatedRecordProposalOrigin): ProcessingCollectionInstanceProposal["origin"] {
    return origin === "existing_record" ? "existing" : "respondent_added";
}

function mapStatus(status: RelatedRecordProposalStatus): ProcessingCollectionProposalStatus {
    return status;
}

function valuesFromFieldProposals(inst: RelatedRecordInstanceProposal): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const fp of inst.field_proposals) {
        if (fp.source_fact_ref) out[fp.source_fact_ref] = fp.submitted_value;
        const parts = fp.provider_ref.split(".", 2);
        if (parts.length === 2 && parts[1]) out[parts[1]!] = fp.submitted_value;
        out[fp.provider_ref] = fp.submitted_value;
    }
    return out;
}

function buildFieldBindings(inst: RelatedRecordInstanceProposal): ProcessingCollectionFieldBinding[] {
    return inst.field_proposals.map((fp) => {
        const [entityType, fieldKey] = fp.provider_ref.includes(".")
            ? (fp.provider_ref.split(".", 2) as [string, string])
            : [null, null];
        const display =
            fp.submitted_value === null || fp.submitted_value === undefined
                ? null
                : typeof fp.submitted_value === "string"
                  ? fp.submitted_value.length > 0
                      ? fp.submitted_value
                      : null
                  : typeof fp.submitted_value === "number" || typeof fp.submitted_value === "boolean"
                    ? String(fp.submitted_value)
                    : Array.isArray(fp.submitted_value)
                      ? fp.submitted_value.map(String).join(", ") || null
                      : null;
        return {
            field_id: fp.source_fact_ref ?? fp.provider_ref,
            provider_ref: fp.provider_ref,
            entity_type: entityType,
            field_key: fieldKey,
            label: fp.label ?? fp.provider_ref,
            submitted_value: fp.submitted_value,
            display_value: display,
        };
    });
}

function buildInstanceEvidence(
    inst: RelatedRecordInstanceProposal,
    ctx: ProjectRelatedRecordProposalsContext,
    collectionLabel: string,
    groupId: string,
): ProcessingCollectionInstanceProposal {
    const meta = inst.source_lineage.source_metadata ?? {};
    const values = valuesFromFieldProposals(inst);
    return {
        proposal_id: inst.proposal_id,
        collection_provider_ref: inst.collection_provider_ref,
        collection_label: collectionLabel,
        iteration_entity_type: inst.item_entity_type,
        instance_key: inst.instance_key,
        origin: mapOrigin(inst.origin),
        existing_item_id: inst.existing_record_id ?? null,
        identity_label: identityLabelFromValues(inst.collection_provider_ref, values),
        field_bindings: buildFieldBindings(inst),
        status: mapStatus(inst.status),
        diagnostics: mapDiagnostics(inst.diagnostics),
        lineage: {
            processing_case_id: ctx.processingCaseId ?? null,
            form_submission_id: inst.source_lineage.source_record_id,
            form_definition_version_id: meta.form_definition_version_id?.trim() ? meta.form_definition_version_id : null,
            schema_group_id: meta.schema_group_id ?? groupId,
            collection_provider_ref: inst.collection_provider_ref,
            instance_key: inst.instance_key,
            payload_path: inst.source_lineage.source_path ?? `groups.${groupId}[${inst.instance_key}]`,
            packet_session_id: meta.packet_session_id ?? null,
        },
    };
}

export function projectRelatedRecordProposalsToEvidence(
    bundle: RelatedRecordProposalBundle,
    ctx: ProjectRelatedRecordProposalsContext = {},
): ProcessingCollectionSourceEvidence {
    const groups: ProcessingCollectionGroupEvidence[] = bundle.collections.map((col) => {
        const collectionLabel = collectionGroupTitle(
            col.collection_provider_ref,
            ctx.fallbackGroupLabel?.(col.collection_key, col.collection_provider_ref) ?? col.collection_key,
        );
        const instances = col.instances.map((inst) =>
            buildInstanceEvidence(inst, ctx, collectionLabel, col.collection_key),
        );
        return {
            group_id: col.collection_key,
            collection_provider_ref: col.collection_provider_ref,
            collection_label: collectionLabel,
            instances,
            status: worstRelatedRecordProposalStatus(col.instances.map((x) => x.status)) as ProcessingCollectionProposalStatus,
            diagnostics: mapDiagnostics(col.diagnostics),
        };
    });

    return {
        groups,
        diagnostics: mapDiagnostics(bundle.diagnostics),
    };
}
