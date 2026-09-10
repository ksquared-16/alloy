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
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { adaptSourceToRelatedRecordProposals } from "@/lib/intake/sources/adaptSourceToRelatedRecordProposals";
import { projectRelatedRecordProposalsToEvidence } from "@/lib/pos/processingCase/collection/projectRelatedRecordProposalsToEvidence";
import { loadAccessibleExistingCollectionItemIds } from "@/lib/forms/processing/verifyFormCollectionItemAccess";
import { dbListSubmissionLinkedDocumentsForSubmissionIds } from "@/lib/admin/forms/formsAdminDb";
import type { ProcessingCollectionGroupEvidence } from "@/lib/pos/processingCase/collection/types";
import { classifyReturnedValue } from "@/lib/pos/processingCase/returnClassification/classifyReturnedValue";
import {
    currentValueForBinding,
    loadCanonicalCurrentValues,
    type CanonicalCurrentValues,
} from "@/lib/pos/processingCase/returnClassification/resolveCanonicalCurrentValues";

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

/** Label a submission's top-level answers from its versioned schema. Collection nested values are resolved separately (P5A). */
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
        /*
         * AN UPLOAD'S VALUE IS A DOCUMENT, NOT A STRING.
         *
         * A `file_ref` answer stores the document's id, and printing it put a bare uuid in front of
         * the operator as the value of "Immunization or vaccination record" — the raw id as the
         * primary interaction, which is exactly what an operator cannot act on. Carrying it as a
         * document reference instead lets the review surface offer the artifact by name.
         */
        const isUpload = field.type === "file_ref";
        const raw = stringifyValue(values[field.id]);
        out.push({
            label: field.label,
            value: isUpload ? null : raw,
            entityType: field.field_source?.entity_type ?? null,
            fieldKey: field.field_source?.field_key ?? null,
            ...(isUpload && raw ? { attachedDocumentId: raw } : {}),
        });
    }
    return out;
}

/**
 * Say what one returned answer means next to canonical truth.
 *
 * An answer with no `fieldKey` names no destination and is form-only. An answer whose owner is not
 * the child record comes back unresolved from `currentValueForBinding`, and the classifier refuses
 * it rather than guessing — a relationship-owned fact must not be read off the child row.
 */
function classifyProposedValue(value: ProposedValue, canonical: CanonicalCurrentValues): ProposedValue {
    const providerRef = value.entityType && value.fieldKey ? `${value.entityType}.${value.fieldKey}` : null;
    if (!providerRef) {
        return { ...value, classification: "form_only", canonicalCurrentValue: null };
    }
    const current = currentValueForBinding(canonical, providerRef);
    const classified = classifyReturnedValue({
        hasCanonicalBinding: true,
        canonicalCurrentValue: current.resolved ? current.value : undefined,
        participantValue: value.value,
    });
    return {
        ...value,
        classification: classified.classification,
        canonicalCurrentValue: current.resolved ? stringifyValue(current.value) : null,
        refusalReason: classified.refusalReason ?? null,
    };
}

function makeFormSubmissionEvidenceLoader(supabase: SupabaseClient, orgId: string): SourceEvidenceLoader {
    // One read per subject per batch — several submissions in a packet share one child.
    const canonicalCache = new Map<string, CanonicalCurrentValues>();
    const canonicalFor = async (id: string | null): Promise<CanonicalCurrentValues> => {
        const key = String(id ?? "");
        const hit = canonicalCache.get(key);
        if (hit) return hit;
        const loaded = await loadCanonicalCurrentValues(supabase, orgId, id);
        canonicalCache.set(key, loaded);
        return loaded;
    };

    return async (ids) => {
        const out = new Map<string, SourceEvidenceRaw>();
        if (ids.length === 0) return out;
        const { data: subs } = await supabase
            .from("form_submissions")
            .select("id, payload, form_definition_version_id, customer_member_id, customer_id")
            .eq("org_id", orgId)
            .in("id", ids);
        const subRows = (subs ?? []) as {
            id: string;
            payload: Record<string, unknown> | null;
            form_definition_version_id: string | null;
            customer_member_id: string | null;
            customer_id: string | null;
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
            const schemaParsed = s.form_definition_version_id ? safeParseFormSchema(schemaByVersion.get(s.form_definition_version_id)) : null;
            const schema = schemaParsed?.success ? schemaParsed.data : null;
            const payload = (s.payload ?? null) as FormPayload | null;
            const accessibleIds = await loadAccessibleExistingCollectionItemIds(supabase, orgId, payload);
            const proposalBundle = schema
                ? adaptSourceToRelatedRecordProposals(
                      {
                          sourceKind: "form_submission",
                          sourceRecordId: s.id,
                          formSchema: schema,
                          formPayload: payload,
                      },
                      {
                          formDefinitionVersionId: s.form_definition_version_id,
                          // Same subject the commit loader uses, so review shows what can commit.
                          subject: s.customer_member_id
                              ? { customerMemberId: s.customer_member_id, customerId: s.customer_id }
                              : null,
                          accessibleExistingItemIds: accessibleIds,
                      },
                  )
                : null;
            const collectionEvidence = proposalBundle
                ? projectRelatedRecordProposalsToEvidence(proposalBundle, { processingCaseId: null })
                : undefined;
            /*
             * Read canonical truth ONCE per subject, then say what each answer means next to it.
             * Without this the panel lists every re-answered field as a proposed change; with it an
             * operator sees the two that actually are.
             */
            const canonical = await canonicalFor(s.customer_member_id);
            const values = schema ? labelSubmissionValues(schema, s.payload) : [];
            out.set(s.id, {
                proposedValues: values.map((v) => classifyProposedValue(v, canonical)),
                documentId: null,
                collectionEvidence,
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
            .select("packet_session_id, form_submission_id, sequence_index, status")
            .eq("org_id", orgId)
            .in("packet_session_id", sessionIds)
            .order("sequence_index", { ascending: true });
        const itemRows = (items ?? []) as {
            packet_session_id: string;
            form_submission_id: string | null;
            sequence_index: number | null;
            status: string | null;
        }[];

        const submissionIds = [
            ...new Set(itemRows.map((i) => i.form_submission_id).filter((x): x is string => Boolean(x))),
        ];
        const submissionEvidence = await submissionLoader(submissionIds);

        /*
         * WHICH FORM EACH ANSWER CAME FROM.
         *
         * The merge below flattens several submissions into one list. Without a name against each
         * value the operator panel showed the same three child fields three times over with no way
         * to tell which form each belonged to — and no way to see that one of them was bound wrong.
         */
        const formNameBySubmission = new Map<string, string>();
        if (submissionIds.length > 0) {
            const { data: subs } = await supabase
                .from("form_submissions")
                .select("id, form_definition_id")
                .eq("org_id", orgId)
                .in("id", submissionIds);
            const subRows = (subs ?? []) as { id: string; form_definition_id: string | null }[];
            const defIds = [
                ...new Set(subRows.map((r) => r.form_definition_id).filter((x): x is string => Boolean(x))),
            ];
            const nameByDef = new Map<string, string>();
            if (defIds.length > 0) {
                const { data: defs } = await supabase
                    .from("form_definitions")
                    .select("id, name")
                    .eq("org_id", orgId)
                    .in("id", defIds);
                for (const d of (defs ?? []) as { id: string; name: string | null }[]) {
                    if (d.name) nameByDef.set(d.id, d.name);
                }
            }
            for (const r of subRows) {
                const name = r.form_definition_id ? nameByDef.get(r.form_definition_id) : undefined;
                if (name) formNameBySubmission.set(r.id, name);
            }
        }

        /*
         * The artifact each step produced.
         *
         * An operator reviewing a returned packet needs to open the paperwork the family signed, and
         * the signed PDF is linked to the submission rather than to the session. Loading it here means
         * the grouped view can offer "View signed document" instead of a document id the operator
         * would have to look up.
         */
        const docBySubmission = new Map<string, { id: string; name: string | null }>();
        if (submissionIds.length > 0) {
            const linked = await dbListSubmissionLinkedDocumentsForSubmissionIds(supabase, orgId, submissionIds);
            for (const [sid, docs] of Object.entries(linked.data ?? {})) {
                // The generated, signed rendering is the one an operator means by "the paperwork".
                const signed = docs.find((d) => d.role === "generated_pdf") ?? docs[0];
                if (signed) docBySubmission.set(sid, { id: signed.document.id, name: signed.document.name });
            }
        }

        for (const item of itemRows) {
            if (!item.form_submission_id) continue;
            const ev = submissionEvidence.get(item.form_submission_id);
            if (!ev) continue;
            const current = out.get(item.packet_session_id) ?? { proposedValues: [], documentId: null };
            const mergedGroups: ProcessingCollectionGroupEvidence[] = [
                ...(current.collectionEvidence?.groups ?? []),
                ...(ev.collectionEvidence?.groups ?? []),
            ];
            const mergedDiagnostics = [
                ...(current.collectionEvidence?.diagnostics ?? []),
                ...(ev.collectionEvidence?.diagnostics ?? []),
            ];
            // Each value keeps the form, step and submission it came from, so a coordinator's
            // merged list can still be read as the several forms it actually is.
            const doc = docBySubmission.get(item.form_submission_id);
            const stamped = ev.proposedValues.map((v) => ({
                ...v,
                sourceFormName: formNameBySubmission.get(item.form_submission_id as string) ?? null,
                sourceStepIndex: item.sequence_index ?? null,
                sourceSubmissionId: item.form_submission_id,
                // The step's OWN status, not a guess from whether values are present.
                sourceStepStatus: item.status ?? null,
                sourceDocumentId: doc?.id ?? null,
                sourceDocumentName: doc?.name ?? null,
            }));
            out.set(item.packet_session_id, {
                proposedValues: [...current.proposedValues, ...stamped],
                documentId: null,
                collectionEvidence:
                    mergedGroups.length > 0 || mergedDiagnostics.length > 0
                        ? { groups: mergedGroups, diagnostics: mergedDiagnostics }
                        : undefined,
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
