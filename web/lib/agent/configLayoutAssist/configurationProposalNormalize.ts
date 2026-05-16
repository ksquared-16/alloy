/**
 * Configuration proposal normalization (Card 5).
 */

import { applyRiskDefaults } from "./configurationProposalRisk";
import {
    ensureOperationPermissions,
    mergeProposalPermissionRequirements,
    resolveProposalPermissions,
} from "./configurationProposalPermissions";
import type {
    ConfigurationOperationKindV1,
    ConfigurationOperationV1,
    ConfigurationProposalV1,
    NormalizeConfigurationProposalOptionsV1,
    ProposalWarningV1,
} from "./configurationProposalV1";

function stableSortStrings(values: string[]): string[] {
    return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function warningKey(w: ProposalWarningV1): string {
    return `${w.severity}|${w.code}|${w.message}|${w.operation_id ?? ""}`;
}

/** Dedupe warnings; preserve first occurrence order, then sort by key for stability. */
export function dedupeProposalWarnings(warnings: ProposalWarningV1[]): ProposalWarningV1[] {
    const seen = new Set<string>();
    const out: ProposalWarningV1[] = [];
    for (const w of warnings) {
        const k = warningKey(w);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
            severity: w.severity,
            code: w.code.trim(),
            message: w.message.trim(),
            operation_id: w.operation_id?.trim() || null,
        });
    }
    return out.sort((a, b) => warningKey(a).localeCompare(warningKey(b)));
}

export function sortOperationsDeterministic(operations: ConfigurationOperationV1[]): ConfigurationOperationV1[] {
    return [...operations].sort((a, b) => {
        const kind = a.kind.localeCompare(b.kind);
        if (kind !== 0) return kind;
        const entity = a.entity_type.localeCompare(b.entity_type);
        if (entity !== 0) return entity;
        const fk = (a.field_key ?? "").localeCompare(b.field_key ?? "");
        if (fk !== 0) return fk;
        const sk = (a.section_key ?? "").localeCompare(b.section_key ?? "");
        if (sk !== 0) return sk;
        return a.operation_id.localeCompare(b.operation_id);
    });
}

/** Infer impacted entity/layout/field lists from operations when omitted. */
export function inferImpactedFromOperations(operations: ConfigurationOperationV1[]): {
    impacted_entities: string[];
    impacted_layouts: string[];
    impacted_fields: string[];
} {
    const entities = new Set<string>();
    const layouts = new Set<string>();
    const fields = new Set<string>();

    for (const op of operations) {
        entities.add(op.entity_type);
        if (op.layout_key?.trim()) {
            layouts.add(`${op.entity_type}:${op.layout_key.trim()}`);
        }
        if (op.field_key?.trim()) {
            fields.add(`${op.entity_type}:${op.field_key.trim()}`);
        }
    }

    return {
        impacted_entities: stableSortStrings([...entities]),
        impacted_layouts: stableSortStrings([...layouts]),
        impacted_fields: stableSortStrings([...fields]),
    };
}

/** Group operations by kind (deterministic key order). */
export function groupOperationsByKind(
    operations: ConfigurationOperationV1[]
): Record<ConfigurationOperationKindV1, ConfigurationOperationV1[]> {
    const sorted = sortOperationsDeterministic(operations);
    const out = {} as Record<ConfigurationOperationKindV1, ConfigurationOperationV1[]>;
    for (const op of sorted) {
        if (!out[op.kind]) out[op.kind] = [];
        out[op.kind]!.push(op);
    }
    return out;
}

const DEFAULT_OPTIONS: Required<NormalizeConfigurationProposalOptionsV1> = {
    recompute_risk: true,
    merge_permissions: true,
    default_generated_by: "deterministic",
};

/**
 * Normalize proposal for persistence, hashing, and serialization.
 * Does not execute mutations.
 */
export function normalizeConfigurationProposal(
    proposal: ConfigurationProposalV1,
    options: NormalizeConfigurationProposalOptionsV1 = {}
): ConfigurationProposalV1 {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    let ops = sortOperationsDeterministic(ensureOperationPermissions(proposal.proposed_operations));

    const inferred = inferImpactedFromOperations(ops);
    const impacted_entities =
        proposal.impacted_entities?.length ? stableSortStrings(proposal.impacted_entities) : inferred.impacted_entities;
    const impacted_layouts =
        proposal.impacted_layouts?.length ? stableSortStrings(proposal.impacted_layouts) : inferred.impacted_layouts;
    const impacted_fields =
        proposal.impacted_fields?.length ? stableSortStrings(proposal.impacted_fields) : inferred.impacted_fields;

    const proposalWarnings = dedupeProposalWarnings([
        ...(proposal.warnings ?? []),
        ...ops.flatMap((o) => o.warnings ?? []),
    ]);

    const opWarningsDeduped = ops.map((op) => ({
        ...op,
        rationale: [...op.rationale].map((r) => r.trim()).filter(Boolean),
        warnings: op.warnings?.length ? dedupeProposalWarnings(op.warnings) : undefined,
    }));

    let normalized: ConfigurationProposalV1 = {
        ...proposal,
        version: 1,
        intent: proposal.intent.trim(),
        summary: proposal.summary.trim(),
        rationale: stableSortStrings(proposal.rationale),
        impacted_entities,
        impacted_layouts,
        impacted_fields,
        proposed_operations: opWarningsDeduped,
        warnings: proposalWarnings.length ? proposalWarnings : undefined,
        metadata: proposal.metadata ?? {},
        generated_by: proposal.generated_by?.trim() || opts.default_generated_by,
        created_at: proposal.created_at,
        permission_requirements: opts.merge_permissions
            ? resolveProposalPermissions(opWarningsDeduped, proposal.permission_requirements ?? [])
            : stableSortStrings(proposal.permission_requirements ?? []),
    };

    if (opts.recompute_risk) {
        normalized = applyRiskDefaults(normalized);
    }

    if (opts.merge_permissions) {
        normalized = mergeProposalPermissionRequirements(normalized);
    }

    return normalized;
}
