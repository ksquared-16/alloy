/**
 * GET /api/v1/documents — standard-sensitivity documents of ONE visible subject: a child (`child_id`), a household
 * (`household_id`) or a parent/guardian (`person_id`). D9.1, `documents.read`.
 *
 * Exactly one subject filter is required. There is deliberately no organization-wide document export: the same lesson
 * `GET /api/v1/children` records — publishing everything to satisfy a need for a few is a bulk PII export on day one.
 * `category_key` and `type_key` narrow further, and `expires_before` (D9.3) keeps documents whose current version expires
 * strictly before that date — the expiration query, still one subject at a time (Q8: no organization-wide feed); `limit`, `cursor` and `since_token` page exactly as every collection does.
 * A subject the installation cannot see answers an empty page, never a refusal that would confirm it exists.
 */
import { externalCollectionRoute, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { externalDocumentsSource } from "@/lib/documents/external/externalDocumentAuthority";
import { toPublicDocument } from "@/lib/platform/external/resources/documentResources";
import { isIsoDate } from "@/lib/documents/validity/documentValidity";

export const dynamic = "force-dynamic";

const KEY_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

export const GET = externalCollectionRoute({
    route: "/api/v1/documents",
    operationId: "listDocuments",
    subject: "documents",
    source: externalDocumentsSource,
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
            return {
                ok: false,
                error: { code: "subject_filter_required", message: "Provide exactly one of child_id, household_id or person_id." },
            };
        }
        for (const name of ["category_key", "type_key"] as const) {
            const v = params.get(name);
            if (v !== null && !KEY_RE.test(v)) return { ok: false, error: { code: "invalid_filter", message: `${name} is not a valid key.` } };
        }
        const expiresBefore = params.get("expires_before");
        if (expiresBefore !== null && !isIsoDate(expiresBefore)) {
            return { ok: false, error: { code: "invalid_filter", message: "expires_before must be a date (YYYY-MM-DD)." } };
        }
        return {
            ok: true,
            values: {
                p_expires_before: expiresBefore,
                p_subject_type: given[0].type,
                p_subject_id: given[0].id,
                p_category_key: params.get("category_key"),
                p_type_key: params.get("type_key"),
            },
        };
    },
    toPublic: toPublicDocument,
});
