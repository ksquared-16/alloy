/**
 * Alloy Search Platform V2 — the orchestrator.
 *
 * Canonical flow, in this order and no other:
 *
 *     query
 *       ↓ org scope + effective access          (searchAccessEnvelope)
 *       ↓ query intent                          (searchQueryIntent)
 *       ↓ retrieve accessible canonical subjects(searchRetrieval)
 *       ↓ add recognition + operational context (searchEnrichment)
 *       ↓ resolve destinations                  (searchDestinations)
 *       ↓ rank                                  (searchRanking)
 *     SearchResult[]
 *
 * This file composes; it does not decide. Every rule lives in the layer that owns
 * it, which is what keeps it impossible for a UI component to construct
 * authorization or for process configuration to own identity matching.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { resolveSearchAccessEnvelope } from "@/lib/search/searchAccessEnvelope";
import {
    SEARCH_DEFAULT_LIMIT,
    SEARCH_MAX_LIMIT,
    type SearchResponse,
    type SearchResult,
    type SearchSubject,
} from "@/lib/search/searchContracts";
import { resolveSearchDestinations } from "@/lib/search/searchDestinations";
import { candidateKey, enrichSearchCandidates } from "@/lib/search/searchEnrichment";
import { loadSearchProcessConfiguration } from "@/lib/search/searchProcessConfiguration";
import { parseSearchIntent } from "@/lib/search/searchQueryIntent";
import { compareRankedResults, orderContextsByIntent, scoreSearchCandidate } from "@/lib/search/searchRanking";
import { retrieveSearchCandidates } from "@/lib/search/searchRetrieval";

export type RunSearchArgs = {
    supabase: SupabaseClient;
    orgId: string;
    dimensions: AdminAccessScopeDimensions;
    rawQ: string;
    limit?: number;
};

function clampLimit(n: number | undefined): number {
    const v = Number.isFinite(n) && (n as number) > 0 ? Math.floor(n as number) : SEARCH_DEFAULT_LIMIT;
    return Math.min(Math.max(v, 1), SEARCH_MAX_LIMIT);
}

export async function runSearch(args: RunSearchArgs): Promise<Omit<SearchResponse, "ok">> {
    const { supabase, orgId, dimensions, rawQ } = args;
    const limit = clampLimit(args.limit);

    // 1 + 2. Access and tenant configuration are independent reads, so they share
    //        one round trip rather than two. Search is an interactive control and
    //        its latency is dominated by sequential DB hops, not by CPU.
    //
    //        Access still gates everything below: no candidate is read until the
    //        envelope exists, which is the security order the doctrine requires.
    const [envelope, processConfig] = await Promise.all([
        resolveSearchAccessEnvelope(supabase, orgId, dimensions),
        loadSearchProcessConfiguration(supabase, orgId, dimensions),
    ]);

    // Tenant configuration supplies the process vocabulary for intent parsing, so
    // `enrollment` and `admissions` are recognised through the same path.
    const intent = parseSearchIntent(rawQ, { processVocabulary: processConfig.vocabulary });

    const empty = {
        q: rawQ,
        intent: { subject_terms: intent.subject_terms, context_terms: intent.context_terms },
        results: [] as SearchResult[],
    };
    if (envelope.impossible || !intent.subject_terms.length) return empty;

    // 3. Retrieve — every adapter constrains by the envelope at query time.
    const candidates = await retrieveSearchCandidates({ supabase, orgId, envelope, intent });
    if (!candidates.length) return empty;

    // 4. Enrich — batched; also drops anything failing the site-scope backstop.
    const enrichment = await enrichSearchCandidates({
        supabase,
        orgId,
        envelope,
        processConfig,
        candidates,
    });

    // 5. Assemble + rank.
    const results: SearchResult[] = [];
    for (const candidate of candidates) {
        const enriched = enrichment.get(candidateKey(candidate));
        // Absent enrichment means the candidate failed the access backstop.
        if (!enriched) continue;

        const subject: SearchSubject = {
            kind: candidate.kind,
            id: candidate.id,
            display_name: candidate.display_name,
            person_id: candidate.person_id ?? null,
            // Enrichment resolves a person's household from the relationship edge.
            household_id: candidate.household_id ?? enriched.household_id,
        };

        const contexts = orderContextsByIntent(enriched.contexts, intent.promoted_keys);
        const ranking = scoreSearchCandidate({ candidate, contexts, intent });
        const destinations = resolveSearchDestinations({
            subject,
            contexts,
            promotedKeys: intent.promoted_keys,
        });

        results.push({ subject, recognition: enriched.recognition, contexts, destinations, ranking });
    }

    results.sort(compareRankedResults);

    return {
        q: rawQ,
        intent: { subject_terms: intent.subject_terms, context_terms: intent.context_terms },
        results: results.slice(0, limit),
    };
}
