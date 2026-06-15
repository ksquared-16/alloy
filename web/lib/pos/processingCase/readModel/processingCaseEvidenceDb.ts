/**
 * POS-FP4 — production source-evidence loaders (Supabase) for the FP2 read model.
 *
 * Live-resolves read-only proposed values from the owning systems (never copied,
 * never promoted). Form/packet sources -> labeled answers from the versioned form
 * schema + submission payload; document sources -> a handle only. Batched per kind.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { safeParseFormSchema } from "@/lib/forms/schema";
import type { ProposedValue, SourceEvidenceLoader, SourceEvidenceRaw, SourceEvidenceRegistry } from "./resolveSourceEvidence";

function stringifyValue(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return v.length > 0 ? v : null;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) {
        const joined = v.map((x) => String(x)).join(", ");
        return joined.length > 0 ? joined : null;
    }
    return null;
}

/** Label a submission's top-level answers from its versioned schema. Nested group values are out of FP4 scope. */
function labelSubmissionValues(schemaJson: unknown, payload: Record<string, unknown> | null): ProposedValue[] {
    const parsed = safeParseFormSchema(schemaJson);
    if (!parsed.success) return [];
    const valuesRaw = payload?.values;
    const values =
        valuesRaw && typeof valuesRaw === "object" && !Array.isArray(valuesRaw)
            ? (valuesRaw as Record<string, unknown>)
            : {};
    const out: ProposedValue[] = [];
    for (const field of parsed.data.fields) {
        if (field.type === "group") continue;
        if (!Object.prototype.hasOwnProperty.call(values, field.id)) continue;
        out.push({
            label: field.label,
            value: stringifyValue(values[field.id]),
            entityType: field.field_source?.entity_type ?? null,
        });
    }
    return out;
}

function makeFormSubmissionEvidenceLoader(supabase: SupabaseClient, orgId: string): SourceEvidenceLoader {
    return async (ids) => {
        const out = new Map<string, SourceEvidenceRaw>();
        if (ids.length === 0) return out;
        const { data: subs } = await supabase
            .from("form_submissions")
            .select("id, payload, form_definition_version_id")
            .eq("org_id", orgId)
            .in("id", ids);
        const subRows = (subs ?? []) as {
            id: string;
            payload: Record<string, unknown> | null;
            form_definition_version_id: string | null;
        }[];

        const versionIds = [
            ...new Set(subRows.map((s) => s.form_definition_version_id).filter((x): x is string => Boolean(x))),
        ];
        const schemaByVersion = new Map<string, unknown>();
        if (versionIds.length > 0) {
            const { data: versions } = await supabase
                .from("form_definition_versions")
                .select("id, schema_json")
                .eq("org_id", orgId)
                .in("id", versionIds);
            for (const v of (versions ?? []) as { id: string; schema_json: unknown }[]) {
                schemaByVersion.set(v.id, v.schema_json);
            }
        }

        for (const s of subRows) {
            const schema = s.form_definition_version_id ? schemaByVersion.get(s.form_definition_version_id) : undefined;
            out.set(s.id, {
                proposedValues: schema ? labelSubmissionValues(schema, s.payload) : [],
                documentId: null,
            });
        }
        return out;
    };
}

function makePacketEvidenceLoader(supabase: SupabaseClient, orgId: string): SourceEvidenceLoader {
    const submissionLoader = makeFormSubmissionEvidenceLoader(supabase, orgId);
    return async (sessionIds) => {
        const out = new Map<string, SourceEvidenceRaw>();
        if (sessionIds.length === 0) return out;
        for (const sid of sessionIds) out.set(sid, { proposedValues: [], documentId: null });

        const { data: items } = await supabase
            .from("form_packet_session_items")
            .select("packet_session_id, form_submission_id")
            .eq("org_id", orgId)
            .in("packet_session_id", sessionIds);
        const itemRows = (items ?? []) as { packet_session_id: string; form_submission_id: string | null }[];

        const submissionIds = [
            ...new Set(itemRows.map((i) => i.form_submission_id).filter((x): x is string => Boolean(x))),
        ];
        const submissionEvidence = await submissionLoader(submissionIds);

        for (const item of itemRows) {
            if (!item.form_submission_id) continue;
            const ev = submissionEvidence.get(item.form_submission_id);
            if (!ev) continue;
            const current = out.get(item.packet_session_id) ?? { proposedValues: [], documentId: null };
            out.set(item.packet_session_id, {
                proposedValues: [...current.proposedValues, ...ev.proposedValues],
                documentId: null,
            });
        }
        return out;
    };
}

function makeDocumentEvidenceLoader(): SourceEvidenceLoader {
    return async (ids) => {
        const out = new Map<string, SourceEvidenceRaw>();
        for (const id of ids) out.set(id, { proposedValues: [], documentId: id });
        return out;
    };
}

export function makeDefaultSourceEvidenceRegistry(supabase: SupabaseClient, orgId: string): SourceEvidenceRegistry {
    return new Map([
        ["form_submission", makeFormSubmissionEvidenceLoader(supabase, orgId)],
        ["form_packet_session", makePacketEvidenceLoader(supabase, orgId)],
        ["document", makeDocumentEvidenceLoader()],
    ]);
}
