/**
 * Forms source adapter — read collection instances from submission envelope or groups fallback.
 */

import type { FormPayload, FormPayloadGroupRow } from "@/lib/forms/validateSubmission";
import { extractCollectionSubmissionEnvelope } from "@/lib/forms/collection/formsCollectionSubmissionValidation";
import type { FormCollectionEnvelopeRow, ExtractedFormCollectionEnvelope } from "@/lib/forms/processing/types";
import type { ProposalDiagnostic } from "@/lib/intake/proposals/types";

function rowFromGroup(row: FormPayloadGroupRow): FormCollectionEnvelopeRow | null {
    const col = row.collection;
    if (!col) return null;
    return {
        instance_key: row.instance_key,
        origin: col.origin,
        provider_ref: col.provider_ref,
        item_id: col.item_id?.trim() ? col.item_id.trim() : null,
        iteration_entity_type: col.iteration_entity_type,
        values:
            row.values && typeof row.values === "object" && !Array.isArray(row.values)
                ? (row.values as Record<string, unknown>)
                : {},
    };
}

function parseMetaEnvelope(meta: unknown): Record<string, FormCollectionEnvelopeRow[]> | null {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
    const raw = (meta as Record<string, unknown>).collection_submission_envelope;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const out: Record<string, FormCollectionEnvelopeRow[]> = {};
    for (const [groupId, rows] of Object.entries(raw as Record<string, unknown>)) {
        if (!Array.isArray(rows)) continue;
        const parsed: FormCollectionEnvelopeRow[] = [];
        for (const r of rows) {
            if (!r || typeof r !== "object" || Array.isArray(r)) continue;
            const row = r as Record<string, unknown>;
            const instanceKey = typeof row.instance_key === "string" ? row.instance_key.trim() : "";
            const providerRef = typeof row.provider_ref === "string" ? row.provider_ref.trim() : "";
            const iterationEntity = typeof row.iteration_entity_type === "string" ? row.iteration_entity_type.trim() : "";
            const origin = row.origin === "existing" || row.origin === "respondent_added" ? row.origin : null;
            if (!instanceKey || !providerRef || !iterationEntity || !origin) continue;
            const values =
                row.values && typeof row.values === "object" && !Array.isArray(row.values)
                    ? (row.values as Record<string, unknown>)
                    : {};
            parsed.push({
                instance_key: instanceKey,
                origin,
                provider_ref: providerRef,
                item_id: typeof row.item_id === "string" && row.item_id.trim() ? row.item_id.trim() : null,
                iteration_entity_type: iterationEntity,
                values,
            });
        }
        if (parsed.length > 0) out[groupId] = parsed;
    }
    return Object.keys(out).length > 0 ? out : null;
}

function envelopeFromGroups(payload: FormPayload): Record<string, FormCollectionEnvelopeRow[]> {
    const extracted = extractCollectionSubmissionEnvelope(payload);
    const out: Record<string, FormCollectionEnvelopeRow[]> = {};
    for (const [groupId, rows] of Object.entries(extracted)) {
        if (!Array.isArray(rows)) continue;
        out[groupId] = rows.map((r) => {
            const row = r as Record<string, unknown>;
            return {
                instance_key: String(row.instance_key ?? ""),
                origin: row.origin === "respondent_added" ? "respondent_added" : "existing",
                provider_ref: String(row.provider_ref ?? ""),
                item_id: row.item_id != null && String(row.item_id).trim() ? String(row.item_id).trim() : null,
                iteration_entity_type: String(row.iteration_entity_type ?? ""),
                values:
                    row.values && typeof row.values === "object" && !Array.isArray(row.values)
                        ? (row.values as Record<string, unknown>)
                        : {},
            } satisfies FormCollectionEnvelopeRow;
        });
    }
    const groups = payload.groups ?? {};
    for (const [groupId, rows] of Object.entries(groups)) {
        if (out[groupId]?.length) continue;
        const fromRows = rows.map(rowFromGroup).filter((x): x is FormCollectionEnvelopeRow => Boolean(x));
        if (fromRows.length > 0) out[groupId] = fromRows;
    }
    return out;
}

export function extractFormCollectionEnvelope(payload: FormPayload | null | undefined): ExtractedFormCollectionEnvelope {
    const diagnostics: ProposalDiagnostic[] = [];
    if (!payload) {
        return { source: "none", byGroup: {}, diagnostics };
    }

    const fromMeta = parseMetaEnvelope(payload.meta);
    if (fromMeta) {
        return { source: "meta_envelope", byGroup: fromMeta, diagnostics };
    }

    const fromGroups = envelopeFromGroups(payload);
    if (Object.keys(fromGroups).length > 0) {
        diagnostics.push({
            code: "source_empty",
            message: "Collection evidence resolved from payload groups (no meta envelope).",
        });
        return { source: "groups_fallback", byGroup: fromGroups, diagnostics };
    }

    return { source: "none", byGroup: {}, diagnostics };
}
