/**
 * The Supabase implementation of the expectation query port.
 *
 * The org filter lives HERE and never in a caller: it is the tenancy boundary,
 * and a boundary each consumer re-implements is a boundary one consumer will
 * eventually forget. The resolver filters by org again, so a leak would need two
 * independent failures.
 *
 * Subject matching happens in code, through `expectationSubjectRef`, because the
 * intake stores the tuple's subject ARRAY in `subject_ref` — there is no single
 * scalar path to filter on, and inventing one (`subject_ref->>id`) matches every
 * real row against nothing. Rows are over-fetched on the subject and temporal
 * axes — anything whose valid window could touch the coordinate — and
 * the resolver decides effectivity. Over-fetching costs a few rows; deciding
 * effectivity here would be a second implementation of the ratified fold.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { expectationSubjectRefMatches } from "@/lib/operationalExpectations/query/expectationSubjectRef";
import type {
    EffectiveExpectationsQuery,
    ExpectationQueryGateway,
    ExpectationQueryRow,
    ExpectationRatificationEvidence,
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
            return ((data ?? []) as unknown as ExpectationQueryRow[]).filter((row) =>
                expectationSubjectRefMatches(row.subject_ref, wanted),
            );
        },

        async loadRatifications(
            orgId: string,
            expectationIds: readonly string[],
        ): Promise<readonly ExpectationRatificationEvidence[]> {
            const ids = [...new Set(expectationIds.filter(Boolean))];
            if (ids.length === 0) return [];

            const { data, error } = await supabase
                .from("operational_expectation_ratifications")
                .select("expectation_id, ratified_at, ratifier_authority_key")
                .eq("org_id", orgId)
                .in("expectation_id", ids);

            if (error) {
                /*
                 * The same fail-closed reasoning as the rows query, pointing the
                 * other way. Returning [] here would silently report every
                 * ratified expectation as merely proposed, which is the exact
                 * defect this loader exists to fix — so an unreadable
                 * ratification is an error the caller must decide about, not an
                 * answer.
                 */
                throw new Error(`operational expectation ratifications query failed: ${error.message}`);
            }

            return ((data ?? []) as unknown as Array<{
                expectation_id: string;
                ratified_at: string;
                ratifier_authority_key: string;
            }>).map((r) => ({
                expectationId: r.expectation_id,
                ratifiedAt: r.ratified_at,
                ratifierAuthorityKey: r.ratifier_authority_key,
            }));
        },
    };
}
