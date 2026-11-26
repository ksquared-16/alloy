/**
 * D6 — what a Business Process stage may name as a `document` requirement.
 *
 * A stage's `{ kind: "document", document_type_key }` names a Studio type. Documents evaluates it for the journey's
 * child (participant progress is child-grain), so the type must be PUBLISHED, active and accept `child` documents —
 * otherwise the requirement could never be met and the family would meet a stage they cannot finish. Checked when the
 * stage is authored (lifecycle builder), as financial requirements check their charge template.
 */
import type { PublishedDocumentTypePolicy } from "@/lib/documents/configuration/documentTypeEnforcement";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";

export type DocumentStageRequirementRefusal = { requirement_id: string; code: "unknown_document_type" | "document_type_not_for_child"; detail: string };

export function documentStageRequirementRefusals(
    requirements: readonly StageRequirementV1[],
    publishedTypes: readonly PublishedDocumentTypePolicy[],
): DocumentStageRequirementRefusal[] {
    const byKey = new Map(publishedTypes.map((t) => [t.key, t]));
    const out: DocumentStageRequirementRefusal[] = [];
    for (const r of requirements) {
        if (r.ref.kind !== "document") continue;
        const t = byKey.get(r.ref.document_type_key);
        if (!t) {
            out.push({ requirement_id: r.requirement_id, code: "unknown_document_type", detail: `"${r.ref.document_type_key}" is not a published document type.` });
        } else if (!t.subject_types.includes("child")) {
            out.push({ requirement_id: r.requirement_id, code: "document_type_not_for_child", detail: `"${t.label}" documents are not filed for a child, so a child's journey cannot satisfy it.` });
        }
    }
    return out;
}
