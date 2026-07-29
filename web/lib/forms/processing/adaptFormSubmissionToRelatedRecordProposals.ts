/**
 * Forms source adapter — map form submission collection envelope to canonical related-record proposals (read-only).
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import { groupFieldHasCollectionBinding } from "@/lib/fields/formsCollectionRepeatBinding";
import {
    findCanonicalCollectionProvider,
    classifyCollectionProvider,
} from "@/lib/fields/collection/canonicalCollectionProviderRegistry";
import { relationshipDefinitionForRef } from "@/lib/fields/relationship/relationshipDefinitions";
import {
    collectionBindingAuthoringEnabledForProvider,
} from "@/lib/fields/formsRelationshipOperationalSupport";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { extractFormCollectionEnvelope } from "@/lib/forms/processing/extractFormCollectionEnvelope";
import type { FormCollectionEnvelopeRow } from "@/lib/forms/processing/types";
import type {
    ProposalDiagnostic,
    RelatedRecordFieldProposal,
    RelatedRecordInstanceProposal,
    RelatedRecordProposalBundle,
    RelatedRecordCollectionProposal,
    RelatedRecordProposalOrigin,
    RelatedRecordProposalStatus,
    RelatedRecordRelationshipIntent,
} from "@/lib/intake/proposals/types";
import {
    stableRelatedRecordProposalId,
    worstRelatedRecordProposalStatus,
} from "@/lib/intake/proposals/normalize";

export type AdaptFormSubmissionProposalsContext = {
    formSubmissionId: string;
    formDefinitionVersionId: string | null;
    packetSessionId?: string | null;
    /** Pre-verified existing item ids in org (optional read-time security). */
    accessibleExistingItemIds?: ReadonlySet<string>;
};

const SOURCE_KIND = "form_submission";

function mapFormOrigin(origin: FormCollectionEnvelopeRow["origin"]): RelatedRecordProposalOrigin {
    return origin === "existing" ? "existing_record" : "proposed_new_record";
}

function nestedFieldsForGroup(field: FormField & { type: "group" }): FormField[] {
    return field.fields.filter((f) => f.type !== "group");
}

function buildFieldProposals(
    nestedFields: FormField[],
    values: Record<string, unknown>,
): RelatedRecordFieldProposal[] {
    const out: RelatedRecordFieldProposal[] = [];
    for (const nested of nestedFields) {
        if (!Object.prototype.hasOwnProperty.call(values, nested.id)) continue;
        const submitted = values[nested.id];
        const entityType = nested.field_source?.entity_type ?? null;
        const fieldKey = nested.field_source?.field_key ?? null;
        const providerRef = entityType && fieldKey ? `${entityType}.${fieldKey}` : nested.id;
        out.push({
            provider_ref: providerRef,
            submitted_value: submitted,
            source_fact_ref: nested.id,
            label: nested.label,
        });
    }
    return out;
}

function buildInstanceProposal(args: {
    ctx: AdaptFormSubmissionProposalsContext;
    groupId: string;
    schemaBindingProvider: string;
    schemaIterationEntity: string;
    nestedFields: FormField[];
    row: FormCollectionEnvelopeRow;
    rowIndex: number;
}): RelatedRecordInstanceProposal {
    const { ctx, groupId, schemaBindingProvider, schemaIterationEntity, nestedFields, row, rowIndex } = args;
    const diagnostics: ProposalDiagnostic[] = [];
    let status: RelatedRecordProposalStatus = "valid";

    if (!row.instance_key?.trim()) {
        diagnostics.push({ code: "missing_instance_key", message: "Collection instance is missing instance_key.", path: `groups.${groupId}.${rowIndex}` });
        status = "invalid";
    }

    if (row.provider_ref !== schemaBindingProvider) {
        diagnostics.push({
            code: "collection_mismatch",
            message: "Envelope provider does not match schema collection binding.",
            path: `groups.${groupId}.${rowIndex}.provider_ref`,
        });
        status = "invalid";
    }

    if (row.iteration_entity_type !== schemaIterationEntity) {
        diagnostics.push({
            code: "unsupported_item_entity",
            message: "Iteration entity does not match schema binding.",
            path: `groups.${groupId}.${rowIndex}.iteration_entity_type`,
        });
        status = "invalid";
    }

    const providerDef = findCanonicalCollectionProvider(row.provider_ref);
    if (!providerDef) {
        diagnostics.push({ code: "unknown_provider", message: `Unknown collection provider "${row.provider_ref}".`, path: `groups.${groupId}` });
        status = "unsupported";
    } else if (!collectionBindingAuthoringEnabledForProvider(row.provider_ref)) {
        diagnostics.push({ code: "unsupported_item_entity", message: `Collection provider "${row.provider_ref}" is not enabled for Processing evidence.`, path: `groups.${groupId}` });
        status = "unsupported";
    }

    if (row.origin === "existing" && !row.item_id) {
        diagnostics.push({ code: "invalid_existing_record_id", message: "Existing instance requires item_id.", path: `groups.${groupId}.${rowIndex}.item_id` });
        status = "invalid";
    }
    if (row.origin === "respondent_added" && row.item_id) {
        diagnostics.push({ code: "invalid_existing_record_id", message: "Respondent-added instance must not declare item_id.", path: `groups.${groupId}.${rowIndex}.item_id` });
        status = "invalid";
    }

    if (row.origin === "existing" && row.item_id && ctx.accessibleExistingItemIds && !ctx.accessibleExistingItemIds.has(row.item_id)) {
        diagnostics.push({ code: "org_boundary", message: "Existing collection item is not accessible in this organization.", path: `groups.${groupId}.${rowIndex}.item_id` });
        status = "invalid";
    }

    const fieldProposals = buildFieldProposals(nestedFields, row.values);
    if (fieldProposals.length === 0 && Object.keys(row.values).length > 0) {
        diagnostics.push({ code: "missing_field_binding", message: "Submitted nested values do not match schema field bindings.", path: `groups.${groupId}.${rowIndex}.values` });
        status = status === "valid" ? "incomplete" : status;
    }

    const proposalId = stableRelatedRecordProposalId({
        source_kind: SOURCE_KIND,
        source_record_id: ctx.formSubmissionId,
        collection_provider_ref: row.provider_ref,
        instance_key: row.instance_key,
    });

    // ── server-derived execution intent ────────────────────────────────────────────────────────
    // The payload carries only provider_ref. Role, command, scope and write destination are resolved
    // HERE from the canonical Relationship Definition, so nothing the client submits can assert them.
    const executionKind = classifyCollectionProvider(row.provider_ref);
    const relationshipDef = relationshipDefinitionForRef(row.provider_ref);
    const relationshipIntent: RelatedRecordRelationshipIntent | undefined = relationshipDef
        ? {
              definition_key: relationshipDef.definition_key,
              operational_role_key: relationshipDef.operational_role_key,
              apply_command_key: relationshipDef.apply_command_key,
              relationship_scope: relationshipDef.relationship_scope,
              default_scope: relationshipDef.scopes[0] ?? "this_child",
              supported_scopes: relationshipDef.scopes,
              identity_action: row.origin === "existing" ? "link_existing_person" : "create_proposed_person",
              ...(row.item_id ? { existing_person_id: row.item_id } : {}),
              proposed_person_facts: nestedFields
                  .filter((n) => n.field_source && Object.prototype.hasOwnProperty.call(row.values, n.id))
                  .map((n) => ({
                      entity_type: n.field_source!.entity_type,
                      field_key: n.field_source!.field_key,
                      value: row.values[n.id],
                  })),
          }
        : undefined;

    return {
        proposal_id: proposalId,
        collection_provider_ref: row.provider_ref,
        item_entity_type: row.iteration_entity_type,
        instance_key: row.instance_key,
        origin: mapFormOrigin(row.origin),
        existing_record_id: row.item_id ?? undefined,
        field_proposals: fieldProposals,
        execution_kind: executionKind,
        ...(relationshipIntent ? { relationship_intent: relationshipIntent } : {}),
        source_lineage: {
            source_kind: SOURCE_KIND,
            source_record_id: ctx.formSubmissionId,
            source_path: `groups.${groupId}[${row.instance_key}]`,
            source_metadata: {
                schema_group_id: groupId,
                form_definition_version_id: ctx.formDefinitionVersionId ?? "",
                ...(ctx.packetSessionId ? { packet_session_id: ctx.packetSessionId } : {}),
            },
        },
        diagnostics,
        status,
    };
}

export function adaptFormSubmissionToRelatedRecordProposals(
    schema: FormSchemaV1 | null,
    payload: FormPayload | null | undefined,
    ctx: AdaptFormSubmissionProposalsContext,
): RelatedRecordProposalBundle {
    const envelope = extractFormCollectionEnvelope(payload);
    const diagnostics: ProposalDiagnostic[] = [...envelope.diagnostics];

    if (!schema) {
        diagnostics.push({ code: "missing_source_context", message: "Form schema unavailable — collection proposals cannot be resolved." });
        return { collections: [], diagnostics };
    }

    if (envelope.source === "none") {
        return { collections: [], diagnostics };
    }

    const collections: RelatedRecordCollectionProposal[] = [];

    for (const field of schema.fields) {
        if (field.type !== "group" || !groupFieldHasCollectionBinding(field)) continue;
        const binding = field.collection_binding!;
        const rows = envelope.byGroup[field.id];
        if (!rows?.length) continue;

        const groupDiagnostics: ProposalDiagnostic[] = [];
        const seenKeys = new Set<string>();
        const instances: RelatedRecordInstanceProposal[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]!;
            if (seenKeys.has(row.instance_key)) {
                groupDiagnostics.push({
                    code: "duplicate_instance_key",
                    message: `Duplicate instance_key "${row.instance_key}".`,
                    path: `groups.${field.id}`,
                });
            }
            seenKeys.add(row.instance_key);

            instances.push(
                buildInstanceProposal({
                    ctx,
                    groupId: field.id,
                    schemaBindingProvider: binding.collection_provider_ref,
                    schemaIterationEntity: binding.iteration_entity_type,
                    nestedFields: nestedFieldsForGroup(field),
                    row,
                    rowIndex: i,
                }),
            );
        }

        collections.push({
            collection_key: field.id,
            collection_provider_ref: binding.collection_provider_ref,
            instances,
            status: worstRelatedRecordProposalStatus(instances.map((x) => x.status)),
            diagnostics: groupDiagnostics,
        });
    }

    for (const [groupId, rows] of Object.entries(envelope.byGroup)) {
        const schemaGroup = schema.fields.find((f) => f.id === groupId && f.type === "group");
        if (!schemaGroup || !groupFieldHasCollectionBinding(schemaGroup)) {
            diagnostics.push({
                code: "collection_mismatch",
                message: `Envelope group "${groupId}" does not match a collection-bound schema group.`,
                path: `groups.${groupId}`,
            });
            if (rows.length > 0) {
                collections.push({
                    collection_key: groupId,
                    collection_provider_ref: rows[0]!.provider_ref,
                    instances: rows.map((row, i) =>
                        buildInstanceProposal({
                            ctx,
                            groupId,
                            schemaBindingProvider: row.provider_ref,
                            schemaIterationEntity: row.iteration_entity_type,
                            nestedFields: [],
                            row,
                            rowIndex: i,
                        }),
                    ),
                    status: "invalid",
                    diagnostics: [{ code: "collection_mismatch", message: "Schema group missing for envelope rows.", path: `groups.${groupId}` }],
                });
            }
        }
    }

    return { collections, diagnostics };
}
