import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { resolveOpportunityAttentionConfigFromMetadata } from "@/lib/opportunities/opportunityAttentionConfig";
import {
    resolveOpportunityAttention,
    type OpportunityAttentionEntityInput,
    type OpportunityAttentionResult,
} from "@/lib/opportunities/opportunityAttentionResolver";

export type OperationalAttentionAttachmentError = {
    code: string;
    message: string;
};

function rowMetadataRecord(metadata: unknown): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    return metadata as Record<string, unknown>;
}

/** Map DB opportunity row → resolver entity input (parity with queue enrichment). */
export function opportunityRowToAttentionEntity(row: Record<string, unknown>): OpportunityAttentionEntityInput {
    return {
        id: String(row.id ?? "").trim(),
        status_key: row.status_key != null ? String(row.status_key) : null,
        created_at: row.created_at != null ? String(row.created_at) : null,
        updated_at: row.updated_at != null ? String(row.updated_at) : null,
        metadata: rowMetadataRecord(row.metadata),
        customer_id: row.customer_id != null ? String(row.customer_id) : null,
        primary_person_id: row.primary_person_id != null ? String(row.primary_person_id) : null,
        primary_contact_id: row.primary_contact_id != null ? String(row.primary_contact_id) : null,
        quote_total:
            row.quote_total != null && (typeof row.quote_total === "number" || typeof row.quote_total === "string")
                ? row.quote_total
                : null,
        estimated_price_cents:
            row.estimated_price_cents != null &&
            (typeof row.estimated_price_cents === "number" || typeof row.estimated_price_cents === "string")
                ? row.estimated_price_cents
                : null,
        monetary_value_cents:
            row.monetary_value_cents != null &&
            (typeof row.monetary_value_cents === "number" || typeof row.monetary_value_cents === "string")
                ? row.monetary_value_cents
                : null,
    };
}

/**
 * Snapshot resolver output for entity GET (drawer). Same canonical evaluator as queue lanes.
 */
export function computeOperationalAttentionAttachment(input: {
    opportunityRow: Record<string, unknown>;
    defs: StatusDefinitionRow[];
    /** Typically `work_units.metadata` for `opportunity.work_unit_id` (QueueService parity). */
    attentionConfigMetadata: unknown | null;
    nowMs?: number;
}): {
    _operational_attention: OpportunityAttentionResult | null;
    _operational_attention_error: OperationalAttentionAttachmentError | null;
} {
    try {
        const config = resolveOpportunityAttentionConfigFromMetadata(input.attentionConfigMetadata ?? null);
        const entity = opportunityRowToAttentionEntity(input.opportunityRow);
        const result = resolveOpportunityAttention({
            opportunity: entity,
            defs: input.defs,
            nowMs: input.nowMs ?? Date.now(),
            config,
            optionalSignals: null,
        });
        return { _operational_attention: result, _operational_attention_error: null };
    } catch (e) {
        return {
            _operational_attention: null,
            _operational_attention_error: {
                code: "operational_attention_resolver_error",
                message: e instanceof Error ? e.message : "Unknown error",
            },
        };
    }
}
