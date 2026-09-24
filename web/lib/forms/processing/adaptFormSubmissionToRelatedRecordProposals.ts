/**
 * Forms source adapter — map form submission collection envelope to canonical related-record proposals (read-only).
 */

import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
/*
 * A party collection is collection-bound too — it simply states its binding as a relationship
 * rather than repeating it. `effectiveCollectionBinding` is the one place that answers which
 * canonical collection a group iterates, authored or derived; reading `collection_binding` directly
 * here is what made every Studio-authored collection of people invisible to Processing.
 */
import { effectiveCollectionBinding, effectiveEntryFieldSource } from "@/lib/forms/partyCollection";
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
    RelatedRecordMembershipIntent,
} from "@/lib/intake/proposals/types";
import {
    stableRelatedRecordProposalId,
    worstRelatedRecordProposalStatus,
} from "@/lib/intake/proposals/normalize";
import {
    adaptTopLevelFieldsToRelatedRecordProposals,
    type AuthoritativeSubject,
} from "@/lib/forms/processing/adaptTopLevelFieldsToRelatedRecordProposals";

export type AdaptFormSubmissionProposalsContext = {
    formSubmissionId: string;
    formDefinitionVersionId: string | null;
    packetSessionId?: string | null;
    /**
     * Which packet step this submission was, and what the form is called.
     *
     * A packet case carries several submissions that ask for many of the same facts. Once a
     * proposal leaves the loader, the submission id is the only thing distinguishing them — and no
     * operator, audit row or review screen can read a uuid as "step 3, Immunization Record". This
     * travels WITH the proposal rather than being re-derived beside it, so the decision and the
     * audit record name the same form the family filled.
     */
    packetStepIndex?: number | null;
    formName?: string | null;
    /**
     * The record this session was deliberately launched against, when it was.
     *
     * Present for a targeted existing-record return (a packet or a single Form launched at a known
     * child); absent for public intake, where there is no existing record to propose against.
     */
    subject?: AuthoritativeSubject | null;
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
    /** The authored group, which is what declares whether these questions describe a person. */
    group: FormField | null;
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
              /*
               * The identity a proposed Person would be created from.
               *
               * Read through `effectiveEntryFieldSource`, not `field_source` alone: a
               * Studio-authored party collection carries no explicit binding on its entry
               * questions, so this list came back EMPTY and every family-added person was refused
               * `insufficient_person_identity` — visible on the card, printed on the completed
               * paperwork, and impossible to create. An authored binding still wins; a question the
               * rule cannot place contributes no fact rather than a guessed one.
               */
              proposed_person_facts: nestedFields
                  .filter((n) => Object.prototype.hasOwnProperty.call(row.values, n.id))
                  .map((n) => ({ source: args.group ? effectiveEntryFieldSource(args.group, n) : null, value: row.values[n.id] }))
                  .filter((f): f is { source: { entity_type: string; field_key: string }; value: unknown } => f.source !== null)
                  .map((f) => ({ entity_type: f.source.entity_type, field_key: f.source.field_key, value: f.value })),
          }
        : undefined;

    /*
     * HOUSEHOLD MEMBERSHIP HAS ONE CANONICAL CAPABILITY, AND THIS NAMES IT.
     *
     * `children` is native structural — no operational role, no scope choice, no relationship edge —
     * so it resolves no Relationship Definition and carried no execution intent at all. A sibling
     * the family added was therefore a proposal an operator could read and nothing could act on.
     *
     * The intent is resolved HERE, from the provider, exactly as the relationship one is: the
     * command is the registered `add_child` capability, the grain is the household, and the identity
     * facts come only from questions the Form's own declaration places. Processing orchestrates it;
     * it does not become a second child writer.
     */
    const membershipIntent: RelatedRecordMembershipIntent | undefined =
        executionKind === "native_structural" && row.provider_ref === "children"
            ? {
                  apply_command_key: "add_child",
                  apply_scope: "household",
                  identity_action: row.origin === "existing" ? "link_existing_child" : "create_household_child",
                  ...(row.item_id ? { existing_child_member_id: row.item_id } : {}),
                  proposed_child_facts: nestedFields
                      .filter((n) => Object.prototype.hasOwnProperty.call(row.values, n.id))
                      .map((n) => ({ source: args.group ? effectiveEntryFieldSource(args.group, n) : null, value: row.values[n.id] }))
                      .filter((f): f is { source: { entity_type: string; field_key: string }; value: unknown } => f.source !== null)
                      .map((f) => ({ entity_type: f.source.entity_type, field_key: f.source.field_key, value: f.value })),
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
        ...(membershipIntent ? { membership_intent: membershipIntent } : {}),
        source_lineage: {
            source_kind: SOURCE_KIND,
            source_record_id: ctx.formSubmissionId,
            source_path: `groups.${groupId}[${row.instance_key}]`,
            source_metadata: {
                schema_group_id: groupId,
                form_definition_version_id: ctx.formDefinitionVersionId ?? "",
                ...(ctx.packetSessionId ? { packet_session_id: ctx.packetSessionId } : {}),
                ...(ctx.packetStepIndex === null || ctx.packetStepIndex === undefined
                    ? {}
                    : { packet_step_index: String(ctx.packetStepIndex) }),
                ...(ctx.formName ? { form_name: ctx.formName } : {}),
            },
        },
        diagnostics,
        status,
    };
}

/** Top-level answers as authored, independent of the collection envelope. */
function valuesFromPayload(payload: FormPayload | null | undefined): Record<string, unknown> {
    const raw = (payload as { values?: unknown } | null | undefined)?.values;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
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

    /*
     * TOP-LEVEL CANONICAL ANSWERS, FOR THE SUBJECT THE SESSION NAMES.
     *
     * Computed before the group walk and independently of it: a Form with no collection group at
     * all still returns canonical facts about a known child, and that is the shape the real
     * enrolment Forms actually use. Without this the whole bundle came back empty for them.
     */
    const topLevel = adaptTopLevelFieldsToRelatedRecordProposals(schema, valuesFromPayload(payload), {
        formSubmissionId: ctx.formSubmissionId,
        subject: ctx.subject ?? null,
    });
    diagnostics.push(...topLevel.diagnostics);

    if (envelope.source === "none") {
        return { collections: topLevel.collection ? [topLevel.collection] : [], diagnostics };
    }

    const collections: RelatedRecordCollectionProposal[] = topLevel.collection ? [topLevel.collection] : [];

    for (const field of schema.fields) {
        if (field.type !== "group") continue;
        const binding = effectiveCollectionBinding(field);
        if (!binding) continue;
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
                    group: field,
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
        if (!schemaGroup || !effectiveCollectionBinding(schemaGroup)) {
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
                            group: schemaGroup ?? null,
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
