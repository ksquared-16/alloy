/**
 * The Supabase implementation of the expectation query port.
 *
 * The org filter lives HERE and never in a caller: it is the tenancy boundary,
 * and a boundary each consumer re-implements is a boundary one consumer will
 * eventually forget. The resolver filters by org again, so a leak would need two
 * independent failures.
 *
 * Subject matching is done on `subject_ref->>id` because that is where the
 * durable business id lives in the authored tuple. Rows are over-fetched on the
 * temporal axis — anything whose valid window could touch the coordinate — and
 * the resolver decides effectivity. Over-fetching costs a few rows; deciding
 * effectivity here would be a second implementation of the ratified fold.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    EffectiveExpectationsQuery,
    ExpectationQueryGateway,
    ExpectationQueryRow,
} from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";

/** Columns the resolver reads, plus the two facets it deliberately ignores. */
const EXPECTATION_SELECT =
    "id, org_id, lineage_root_id, supersedes_expectation_id, verb, transition_type, modality," +
    " author_class, authority_key, standing, subject_kind, subject_ref, condition," +
    " valid_from, valid_to, authored_at";

export function createSupabaseExpectationQueryGateway(
    supabase: SupabaseClient,
): ExpectationQueryGateway {
    return {
        async loadRowsForSubjects(query: EffectiveExpectationsQuery): Promise<ExpectationQueryRow[]> {
            const ids = [...new Set(query.subjects.map((s) => s.id).filter(Boolean))];
            const kinds = [...new Set(query.subjects.map((s) => s.kind).filter(Boolean))];
            if (ids.length === 0 || kinds.length === 0) return [];

            const { data, error } = await supabase
                .from("operational_expectations")
                .select(EXPECTATION_SELECT)
                .eq("org_id", query.orgId)
                .in("subject_kind", kinds)
                // Valid window can touch the coordinate: started on or before it,
                // and either open-ended or ending after it.
                .lte("valid_from", query.asOf.validTime)
                .or(`valid_to.is.null,valid_to.gt.${query.asOf.validTime}`);

            if (error) {
                // A failed expectation read is NOT "no expectations". Throwing
                // makes the caller decide; silently returning [] would render a
                // known-away child as an unexplained missing arrival.
                throw new Error(`operational expectations query failed: ${error.message}`);
            }

            const wanted = new Set(ids);
            return ((data ?? []) as unknown as ExpectationQueryRow[]).filter((row) => {
                const ref = row.subject_ref;
                const id = ref == null ? "" : String((ref as Record<string, unknown>).id ?? "");
                return wanted.has(id);
            });
        },
    };
}
