/**
 * Existing-record form launch metadata (Forms MVP Card 3).
 * Merges attach + prefill defaults onto public link metadata — no new schema.
 */

import { buildOperationalIntentLinkMetadataPatch } from "@/lib/forms/operationalIntentTemplates";
import { defaultOpportunityLaunchPrefillFieldMap } from "@/lib/forms/prefill/defaultOpportunityLaunchPrefillFieldMap";
import { parsePrefillFieldMapBody } from "@/lib/forms/prefill/prefillFieldMap";

export type ExistingRecordLaunchEntityType = "person" | "customer" | "customer_member" | "opportunity";

export type ExistingRecordLaunchInput = {
    entityType: ExistingRecordLaunchEntityType;
    entityId: string;
    /** When true, only prefill/stamp context — no intake (legacy). Default false. */
    prefillOnly?: boolean;
    label?: string | null;
    prefillFieldMap?: Record<string, string> | null;
};

export function buildOpportunityExistingRecordPrefillMap(): Record<string, string> {
    return {
        ...defaultOpportunityLaunchPrefillFieldMap(),
        guardian_full_name: "person.full_name",
        guardian_email: "person.email",
        guardian_phone: "person.phone",
        child_first_name: "customer_member.first_name",
        child_last_name: "customer_member.last_name",
        child_date_of_birth: "customer_member.dob",
    };
}

/** Merge existing-record attach metadata into link metadata for create/PATCH. */
export function mergeExistingRecordLaunchMetadata(
    baseMetadata: Record<string, unknown>,
    input: ExistingRecordLaunchInput
): Record<string, unknown> {
    const metadata = { ...baseMetadata };

    if (input.prefillOnly) {
        metadata.form_context_mode = "existing_record";
        metadata.source_entity_type = input.entityType;
        metadata.source_entity_id = input.entityId;
        metadata.prefill_enabled = true;
        metadata.lead_capture = false;
        metadata.intake = false;
    } else {
        Object.assign(metadata, buildOperationalIntentLinkMetadataPatch("existing_family"));
        metadata.form_context_mode = "existing_record";
        metadata.source_entity_type = input.entityType;
        metadata.source_entity_id = input.entityId;
        metadata.prefill_enabled = true;
        metadata.launch_surface = input.entityType === "opportunity" ? "crm_opportunity" : "existing_record";
    }

    if (input.entityType === "opportunity") {
        const oppDefaults = buildOpportunityExistingRecordPrefillMap();
        const bodyMap = input.prefillFieldMap ?? {};
        metadata.prefill_field_map = { ...oppDefaults, ...bodyMap };
    } else if (input.prefillFieldMap && Object.keys(input.prefillFieldMap).length > 0) {
        metadata.prefill_field_map = input.prefillFieldMap;
    }

    const label = typeof input.label === "string" ? input.label.trim() : "";
    if (label) metadata.label = label;

    return metadata;
}

export function parseExistingRecordLaunchBody(raw: unknown): ExistingRecordLaunchInput | { error: string } {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { error: "launch_from_entity must be an object" };
    }
    const lf = raw as Record<string, unknown>;
    const entityType = typeof lf.entity_type === "string" ? lf.entity_type.trim() : "";
    const entityIdRaw = typeof lf.entity_id === "string" ? lf.entity_id.trim() : "";
    const allowed = new Set(["person", "customer", "customer_member", "opportunity"]);
    if (!allowed.has(entityType)) {
        return { error: "launch_from_entity.entity_type must be person, customer, customer_member, or opportunity" };
    }
    if (!entityIdRaw) {
        return { error: "launch_from_entity.entity_id is required" };
    }

    let prefillFieldMap: Record<string, string> | null = null;
    if ("prefill_field_map" in lf) {
        const parsed = parsePrefillFieldMapBody(lf.prefill_field_map);
        if (!parsed.ok) return { error: parsed.message };
        prefillFieldMap = parsed.map;
    }

    return {
        entityType: entityType as ExistingRecordLaunchEntityType,
        entityId: entityIdRaw,
        prefillOnly: lf.prefill_only === true,
        label: typeof lf.label === "string" ? lf.label : null,
        prefillFieldMap,
    };
}

export type ExistingRecordAttachTargetView = {
    headline: string;
    familyLabel: string | null;
    recordLabel: string;
    workflowLabel: string | null;
    attachSummaryLines: string[];
};

export function buildExistingRecordAttachTargetView(params: {
    entityType: ExistingRecordLaunchEntityType;
    entityLabel: string;
    familyLabel?: string | null;
    workflowLabel?: string | null;
}): ExistingRecordAttachTargetView {
    const family = params.familyLabel?.trim() || null;
    const record = params.entityLabel.trim() || "Existing record";
    const workflow = params.workflowLabel?.trim() || null;

    const attachSummaryLines = [
        family ? `Family · ${family}` : null,
        params.entityType === "opportunity" ? `Enrollment inquiry · ${record}` : `Record · ${record}`,
        workflow ? `Workflow · ${workflow}` : null,
        "This response will attach to the existing record — no new lead will be created.",
    ].filter(Boolean) as string[];

    return {
        headline: "Send form to existing family",
        familyLabel: family,
        recordLabel: record,
        workflowLabel: workflow,
        attachSummaryLines,
    };
}
