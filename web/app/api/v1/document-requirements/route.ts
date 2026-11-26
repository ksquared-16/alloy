/**
 * GET /api/v1/document-requirements — listDocumentRequirements (D9.3, `documents.read`). The live document requirements of
 * ONE visible subject — a child (`child_id`), a household (`household_id`) or a parent/guardian (`person_id`) — evaluated
 * by the staff evaluator: state (missing, pending_review, satisfied, waived, expired, blocked), due date, validity and the
 * evidence documents the installation can itself read. A requirement on a non-standard document type is reported only as
 * its key and state. There is no organization-wide requirement feed (Q8); an invisible subject answers an empty page.
 */
import { externalCollectionRoute, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { externalDocumentRequirementsSource } from "@/lib/documents/external/externalDocumentLifecycle";
import { toPublicDocumentRequirement } from "@/lib/platform/external/resources/documentResources";

export const dynamic = "force-dynamic";

export const GET = externalCollectionRoute({
    route: "/api/v1/document-requirements",
    operationId: "listDocumentRequirements",
    subject: "document requirements",
    source: externalDocumentRequirementsSource,
    params: (params) => {
        const child = uuidFilter(params, "child_id");
        if (!child.ok) return child;
        const household = uuidFilter(params, "household_id");
        if (!household.ok) return household;
        const person = uuidFilter(params, "person_id");
        if (!person.ok) return person;
        const given = [
            child.value ? { type: "child", id: child.value } : null,
            household.value ? { type: "household", id: household.value } : null,
            person.value ? { type: "person", id: person.value } : null,
        ].filter((s): s is { type: string; id: string } => s !== null);
        if (given.length !== 1) {
            return { ok: false, error: { code: "subject_filter_required", message: "Provide exactly one of child_id, household_id or person_id." } };
        }
        return { ok: true, values: { p_subject_type: given[0].type, p_subject_id: given[0].id } };
    },
    toPublic: toPublicDocumentRequirement,
});
