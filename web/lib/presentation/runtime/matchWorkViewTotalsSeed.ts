/**
 * MAY THIS CLIENT USE THIS SEED? — the whole safety argument of the WU-03 document seed.
 *
 * The document now resolves the configured Work View counts server-side, so a matching seed lets
 * the browser skip `/api/admin/queue-view-totals` entirely. That is only sound if the seed answers
 * EXACTLY the question this client is asking. A seed is data, not authority: it carries counts and
 * an identity, never a capability, and consuming one must never widen what the operator can see.
 *
 * Four fields have to agree, and each corresponds to a way the same view set can mean something
 * different:
 *
 *   orgId                    — an answer for another tenant is never usable.
 *   hostWorkUnitId           — the surface the document answered for.
 *   selectedSiteId           — THE DANGEROUS ONE. The document composes with no workspace site
 *                              filter, so its counts are site-unfiltered. An operator who has
 *                              narrowed to a site is asking a strictly different question, and
 *                              showing them the wider number would overstate every lane.
 *   configuredViewSignature  — the published Work View set, by IDENTITY.
 *
 * The signature is built from sorted view ids, so a REORDER matches (reordering changes no count)
 * while an add, a remove or a rename does not. Comparing cardinality, or binding by array
 * position, would let configuration N satisfy N+1 whenever the counts happened to line up — which
 * is exactly the failure mode that makes a stale count look authoritative.
 *
 * A rejection is not a failure: the client issues its canonical fallback request, precisely as it
 * did before the seed existed. Returning a REASON rather than a boolean keeps that distinction
 * legible in tests and in the deployed sample set.
 */
/*
 * THE CONTRACT MODULE, never the resolver. Importing `buildConfiguredViewSignature` from the
 * server-only resolver is a VALUE edge, and it pulled the whole Supabase graph into the client
 * bundle: "'server-only' cannot be imported from a Client Component module."
 */
import {
    buildConfiguredViewSignature,
    type WorkViewTotalsSeed,
} from "@/lib/runtime/provisioning/workViewTotalsSeedContract";
import { workViewTotalKey } from "./useWorkViewTotals";

export type WorkViewTotalsSeedMatch =
    | {
          ok: true;
          /** `workUnitId::viewId` → count, with UNKNOWN carried as null. Never zero. */
          totals: Map<string, number | null>;
          /** Views the seed reported as UNKNOWN. Surfaced so a sample can prove it saw none. */
          unknownViewIds: string[];
      }
    | { ok: false; reason: WorkViewTotalsSeedRejection };

export type WorkViewTotalsSeedRejection =
    | "no_seed"
    | "seed_unavailable"
    | "org_mismatch"
    | "host_work_unit_mismatch"
    | "site_scope_mismatch"
    | "configuration_mismatch";

export function matchWorkViewTotalsSeed(args: {
    seed: WorkViewTotalsSeed | null | undefined;
    /** The org this client is rendering for. */
    orgId: string | null | undefined;
    /** The surface work unit this client is rendering. */
    hostWorkUnitId: string | null | undefined;
    /** The operator's workspace site filter, or null when unfiltered. */
    selectedSiteId: string | null;
    /** The configured view identities this client is asking about. */
    viewIds: readonly string[];
}): WorkViewTotalsSeedMatch {
    const { seed } = args;
    if (!seed) return { ok: false, reason: "no_seed" };
    if (seed.status !== "resolved") return { ok: false, reason: "seed_unavailable" };

    const identity = seed.identity;
    if (!args.orgId || identity.orgId !== args.orgId) {
        return { ok: false, reason: "org_mismatch" };
    }
    if (!args.hostWorkUnitId || identity.hostWorkUnitId !== args.hostWorkUnitId) {
        return { ok: false, reason: "host_work_unit_mismatch" };
    }
    /*
     * Normalised to null so "" and null are the same absence, but NOT loosened any further: a
     * site-filtered client and an unfiltered seed are different questions, and `==` would happily
     * call them equal.
     */
    const seedSite = identity.selectedSiteId ?? null;
    const clientSite = args.selectedSiteId ?? null;
    if (seedSite !== clientSite) return { ok: false, reason: "site_scope_mismatch" };

    if (identity.configuredViewSignature !== buildConfiguredViewSignature(args.viewIds)) {
        return { ok: false, reason: "configuration_mismatch" };
    }

    /*
     * The SAME mapping the canonical fetch performs: `known ? count : null`. UNKNOWN must arrive as
     * null and never as 0 — a confident zero is worse than an absent count, because the operator
     * cannot tell it is wrong. A loaded, authoritative zero is `known: true, count: 0` and stays 0.
     */
    const totals = new Map<string, number | null>();
    const unknownViewIds: string[] = [];
    for (const row of seed.totals) {
        totals.set(workViewTotalKey(row.workUnitId, row.workViewId), row.known ? row.count : null);
        if (!row.known) unknownViewIds.push(row.workViewId);
    }
    return { ok: true, totals, unknownViewIds };
}
