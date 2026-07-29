/**
 * POS-FP17 — project an accepted relationship concept into a canonical collection-bound group.
 *
 * Configuration Discovery recognises that a document collects a RELATIONSHIP (guardians, emergency
 * contacts, authorized pickups) rather than a bag of flat questions. Before this module, apply only
 * *recorded* that recognition: the generated form still shipped the flat questions and carried no
 * collection binding, so a respondent could never supply the relationship as a collection and the
 * canonical write path was never reachable from a form.
 *
 * This module performs the projection. Every binding value comes from the canonical Relationship
 * Definition — there is deliberately NO branch on guardian / emergency_contact / authorized_pickup.
 * Adding a definition row is what makes a new relationship projectable.
 *
 * Key modelling decision: repeated document occurrences ("Guardian #1", "Guardian #2") are evidence
 * of CARDINALITY and of initial instances — they are not separate field bundles. They collapse into
 * ONE repeatable group whose `observed_instance_count` records what the document showed.
 *
 * Authority note: only `collection_provider_ref` travels onto the published form. Role, command and
 * scope are re-derived server-side from that ref, so a client can never assert them. The copies kept
 * on the draft group are lineage for review/audit, not authority.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import {
    detectRelationshipDefinitionForTitle,
    relationshipDefinitionForRole,
    type RelationshipDefinition,
} from "@/lib/fields/relationship/relationshipDefinitions";
import { PERSON_CHILD_RELATIONSHIP_NATIVE_COLUMN_KEYS } from "@/lib/fields/personChildRelationship/personChildRelationshipFieldRegistry";
import type { FormFieldSource } from "@/lib/forms/schema";
import type {
    DraftCollectionGroup,
    DraftCollectionNestedField,
    DraftFormFieldType,
    StoredFormDraftPreview,
} from "@/lib/pos/processingCase/formDraft/types";
import type { BusinessConceptCandidate, ConfigurationProposal } from "./contracts";

/** Keys owned by the relationship EDGE rather than the Person identity. Registry-driven. */
const EDGE_OWNED_KEYS = new Set<string>(PERSON_CHILD_RELATIONSHIP_NATIVE_COLUMN_KEYS);

/** Generic key → draft field type. Keyed on the FIELD, never on the role. */
function nestedFieldType(fieldKey: string): DraftFormFieldType {
    const k = fieldKey.toLowerCase();
    if (k.includes("date") || k.endsWith("_at") || k === "dob") return "date";
    if (k.startsWith("is_") || k.startsWith("has_") || k.startsWith("can_")) return "boolean";
    return "text";
}

/** Humanise a canonical field key for the operator-facing nested label. */
function nestedFieldLabel(fieldKey: string): string {
    const words = fieldKey.replace(/_/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function nestedFieldSource(fieldKey: string, def: RelationshipDefinition): FormFieldSource {
    return EDGE_OWNED_KEYS.has(fieldKey)
        ? { entity_type: "person_child_relationship", field_key: fieldKey }
        : { entity_type: def.target_entity_type, field_key: fieldKey };
}

export interface RelationshipCollectionProjection {
    group: DraftCollectionGroup;
    /** Draft field ids replaced by the group — suppressed from participant execution, kept as evidence. */
    suppressedFieldIds: string[];
}

/**
 * Project one accepted `relationship_binding` proposal into a collection group.
 *
 * Source questions are located by re-using the SAME definition-derived title detection that
 * Configuration Discovery used, so the sections a group claims are exactly the sections the concept
 * came from. Returns null when the proposal does not resolve to a definition.
 */
export function projectRelationshipCollection(input: {
    draft: StoredFormDraftPreview;
    proposal: ConfigurationProposal;
    concept: BusinessConceptCandidate | undefined;
    proposalIdentity: string;
}): RelationshipCollectionProjection | null {
    const { draft, proposal, concept, proposalIdentity } = input;
    const role = proposal.target_relationship_role ?? "";
    const def = role ? relationshipDefinitionForRole(role) : undefined;
    if (!def) return null;

    // Sections whose title denotes THIS relationship — the repeated #1/#2 occurrences.
    //
    // Two exclusions, both essential:
    //   • OUTPUT COPIES ("… (Classroom Copy)") reproduce earlier questions. Claiming them would
    //     double-count cardinality and suppress the duplicate questions as if they were instances.
    //     This mirrors the same rule applyDiscovery uses when binding fields.
    //   • NON-FIELD sections. "Parent/Guardian Signatures" mentions the role but collects a
    //     signature, not a related person; suppressing it would strip the signature from the form.
    const owningSections = draft.sections.filter((s) => {
        const title = s.title ?? "";
        const detected = detectRelationshipDefinitionForTitle(title);
        if (detected?.definition_key !== def.definition_key) return false;
        if (s.disposition === "static_reference" || /\bcopy\b/i.test(title)) return false;
        const disposition = s.disposition ?? "fields";
        return disposition === "fields";
    });

    const suppressedFieldIds: string[] = [];
    const sourceLabels: string[] = [];
    const byId = new Map(draft.fields.map((f) => [f.id, f]));
    for (const s of owningSections) {
        for (const fid of s.field_ids) {
            const f = byId.get(fid);
            if (!f) continue;
            suppressedFieldIds.push(fid);
            sourceLabels.push(f.label);
        }
    }

    const groupId = `col_${def.definition_key}`;
    const nested_fields: DraftCollectionNestedField[] = def.nested_field_keys.map((key) => {
        // Lineage: which source questions this nested field stands in for (best-effort label match).
        const source_field_ids = suppressedFieldIds.filter((fid) => {
            const label = (byId.get(fid)?.label ?? "").toLowerCase();
            const probe = key.replace(/_/g, " ");
            return label.includes(probe) || (key === "full_name" && /\bname\b/.test(label));
        });
        return {
            id: `${groupId}__${key}`,
            label: nestedFieldLabel(key),
            type: nestedFieldType(key),
            required: false,
            field_source: nestedFieldSource(key, def),
            source_field_ids,
        };
    });

    const group: DraftCollectionGroup = {
        id: groupId,
        label: def.label,
        section_id: owningSections[0]?.id ?? `section_${def.definition_key}`,

        relationship_definition_key: def.definition_key,
        collection_provider_ref: def.provider_ref,
        item_entity_type: def.item_entity_type,
        iteration_alias: def.iteration_alias,
        operational_role_key: def.operational_role_key,
        relationship_scope: def.relationship_scope,
        cardinality: def.cardinality,
        supported_scopes: def.scopes,
        default_scope: def.scopes[0] ?? "this_child",
        create_link_policy: def.create_link_policy,
        apply_command_key: def.apply_command_key,
        responsibility_default: def.responsibility_default,

        nested_fields,

        source_concept_id: concept?.id ?? proposal.candidate_id,
        source_proposal_identity: proposalIdentity,
        source_section_titles: owningSections.map((s) => s.title),
        source_labels: sourceLabels,
        // The document's repeated occurrences are the evidence of cardinality.
        observed_instance_count: owningSections.length,
        confidence: proposal.confidence
            ? { band: proposal.confidence.band, percent: proposal.confidence.percent }
            : undefined,
        decision_state: proposal.decision_state,
    };

    return { group, suppressedFieldIds };
}

/**
 * Apply a projection to the draft: register the group and suppress the flat questions it replaces.
 *
 * IDEMPOTENT — re-running replaces the group with the same stable id rather than appending a
 * duplicate, and re-suppressing an already-suppressed question is a no-op. This is what keeps
 * apply-retry from producing two Emergency Contacts groups.
 */
export function applyProjectionToDraft(
    draft: StoredFormDraftPreview,
    projection: RelationshipCollectionProjection,
): void {
    // Mutates in place, matching how applyDiscovery writes field bindings. Returning a new draft
    // would strand the caller's field-id map on the previous object graph.
    const existing = draft.collections ?? [];
    draft.collections = [...existing.filter((c) => c.id !== projection.group.id), projection.group];

    const suppress = new Set(projection.suppressedFieldIds);
    for (const f of draft.fields) {
        if (suppress.has(f.id)) f.suppressed_by_collection = projection.group.id;
    }
}
