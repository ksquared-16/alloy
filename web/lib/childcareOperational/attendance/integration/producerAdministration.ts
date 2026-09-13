/**
 * What an administrator may SEE about external attendance producers.
 *
 * ── THE SAME PROHIBITION AS KIOSK, FOR THE SAME REASON ──
 *
 * `attendance_integration_producers.last_seen_at` exists and NOTHING WRITES IT.
 * So there is no "online", no "last seen", no health score and no "synced N
 * minutes ago" here. An integration screen is exactly where a green dot is most
 * believed and least verifiable.
 *
 * ── WHAT IS REAL, AND THEREFORE SHOWN ──
 *
 * Mapping problems are NOT invented. `attendance_integration_events.disposition`
 * is written by the ingest path on every inbound event, and its vocabulary
 * already names the failures an operator cares about: `unmapped` (identity could
 * not be resolved), `unattributed` (the producer itself could not be resolved),
 * `conflicted` and `rejected`. Counting those is reading a fact, not deriving a
 * mood — which is the whole difference between this and a last-seen badge.
 *
 * ── PROVIDER-SPECIFIC READINESS IS NOT IMPLIED ──
 *
 * This is generic administration over a generic foundation. A provider appears
 * here only because a producer row exists for it. Nothing in this module asserts
 * that any particular provider integration is built, configured or supported —
 * see `PROVIDER_INTEGRATION_STATUS`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ProducerStatus = "active" | "revoked";

/** Dispositions that represent something an operator may need to fix. */
export const PROBLEM_DISPOSITIONS = ["unmapped", "unattributed", "conflicted", "rejected"] as const;
export type ProblemDisposition = (typeof PROBLEM_DISPOSITIONS)[number];

export type ProducerMappingProblem = {
    disposition: ProblemDisposition;
    count: number;
};

export type ProducerSiteGrant = {
    siteLocationId: string;
    siteName: string | null;
};

export type ProducerAdminRow = {
    id: string;
    label: string;
    /** The integration family this producer belongs to. Implementation vocabulary. */
    providerKey: string;
    status: ProducerStatus;
    capabilities: string[];
    /** Last four of the current secret. NOT a credential. Null when none is set. */
    credentialLastFour: string | null;
    siteGrants: ProducerSiteGrant[];
    activeMappingCount: number;
    disabledMappingCount: number;
    /** Counts read from the integration inbox — never derived from absence of traffic. */
    problems: ProducerMappingProblem[];
    registeredAt: string | null;
    rotatedAt: string | null;
    revokedAt: string | null;
};

/**
 * Provider integrations the product can actually claim, keyed by `provider_key`.
 *
 * Generic producer administration must not imply that a named provider
 * integration exists. Classroom Coach has no provider evidence in this tree — no
 * credentials, no mapping semantics, no API — so it is stated as requiring
 * provider work wherever it is surfaced at all, rather than appearing configured
 * because a generic row could be created for it.
 */
export const PROVIDER_INTEGRATION_STATUS: Record<string, "generic" | "requires_provider_work"> = {
    classroom_coach: "requires_provider_work",
};

export function providerIntegrationNotice(providerKey: string): string | null {
    return PROVIDER_INTEGRATION_STATUS[providerKey] === "requires_provider_work" ?
            "This provider integration is not built. Alloy can accept events from a generic producer, but nothing here configures or connects this provider."
        :   null;
}

/** Operator-facing phrasing. Disposition keys must not reach the screen. */
export function problemDispositionLabel(disposition: ProblemDisposition): string {
    switch (disposition) {
        case "unmapped":
            return "Could not tell which child or room";
        case "unattributed":
            return "Could not tell which system sent it";
        case "conflicted":
            return "Conflicts with something already recorded";
        case "rejected":
            return "Refused";
    }
}

export async function listProducersForOrg(
    supabase: SupabaseClient,
    orgId: string,
): Promise<ProducerAdminRow[]> {
    // Explicit select — `credential_hash` and `last_seen_at` are both absent, and
    // both absences are deliberate and tested.
    const { data, error } = await supabase
        .from("attendance_integration_producers")
        .select(
            "id, label, provider_key, status, capabilities, credential_last_four, created_at, rotated_at, revoked_at",
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const producers = (data ?? []) as {
        id: string;
        label: string | null;
        provider_key: string | null;
        status: string | null;
        capabilities: string[] | null;
        credential_last_four: string | null;
        created_at: string | null;
        rotated_at: string | null;
        revoked_at: string | null;
    }[];
    if (producers.length === 0) return [];

    const ids = producers.map((p) => p.id);

    const { data: grantRows } = await supabase
        .from("attendance_integration_producer_sites")
        .select("producer_id, site_location_id")
        .eq("org_id", orgId)
        .in("producer_id", ids);
    const grants = (grantRows ?? []) as { producer_id: string; site_location_id: string }[];

    const siteIds = [...new Set(grants.map((g) => g.site_location_id))];
    const siteNames = new Map<string, string>();
    if (siteIds.length > 0) {
        const { data: sites } = await supabase
            .from("locations")
            .select("id, label")
            .eq("org_id", orgId)
            .in("id", siteIds);
        for (const s of (sites ?? []) as { id: string; label: string | null }[]) {
            const label = String(s.label ?? "").trim();
            if (label) siteNames.set(s.id, label);
        }
    }

    const { data: mappingRows } = await supabase
        .from("attendance_integration_mappings")
        .select("producer_id, status")
        .eq("org_id", orgId)
        .in("producer_id", ids);
    const mappings = (mappingRows ?? []) as { producer_id: string; status: string | null }[];

    const { data: eventRows } = await supabase
        .from("attendance_integration_events")
        .select("producer_id, disposition")
        .eq("org_id", orgId)
        .in("producer_id", ids)
        .in("disposition", [...PROBLEM_DISPOSITIONS]);
    const events = (eventRows ?? []) as { producer_id: string | null; disposition: string | null }[];

    return producers.map((p) => {
        const problemCounts = new Map<ProblemDisposition, number>();
        for (const e of events) {
            if (e.producer_id !== p.id) continue;
            const d = e.disposition as ProblemDisposition | null;
            if (!d || !(PROBLEM_DISPOSITIONS as readonly string[]).includes(d)) continue;
            problemCounts.set(d, (problemCounts.get(d) ?? 0) + 1);
        }

        const mine = mappings.filter((m) => m.producer_id === p.id);

        return {
            id: p.id,
            label: String(p.label ?? "").trim() || "Untitled producer",
            providerKey: String(p.provider_key ?? "").trim(),
            // Anything not literally `active` is revoked. An unrecognised status
            // must never read as a producer that may still author facts.
            status: p.status === "active" ? "active" : "revoked",
            capabilities: Array.isArray(p.capabilities) ? p.capabilities : [],
            credentialLastFour: p.credential_last_four,
            siteGrants: grants
                .filter((g) => g.producer_id === p.id)
                .map((g) => ({
                    siteLocationId: g.site_location_id,
                    siteName: siteNames.get(g.site_location_id) ?? null,
                })),
            activeMappingCount: mine.filter((m) => m.status === "active").length,
            disabledMappingCount: mine.filter((m) => m.status !== "active").length,
            problems: PROBLEM_DISPOSITIONS.map((d) => ({
                disposition: d,
                count: problemCounts.get(d) ?? 0,
            })).filter((p2) => p2.count > 0),
            registeredAt: p.created_at,
            rotatedAt: p.rotated_at,
            revokedAt: p.revoked_at,
        };
    });
}
