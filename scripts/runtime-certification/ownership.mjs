/**
 * Runtime certification — the canonical ownership map, and the duplicate classifier that uses it.
 *
 * Raw request count is NOT a pass/fail rule: some duplication is correct. What is never correct is
 * an AUTHORITATIVE read happening twice for one operator intent. This file is what lets the harness
 * tell those apart, and it is the same map recorded in the runtime-performance doctrine.
 */

/** One truth, one owner. A second producer of the same truth is a defect even when it agrees. */
export const CANONICAL_OWNERS = {
    "work unit committed world": "useCommittedWorkUnitSurfaceRuntime (from K3 Focus)",
    "provisioning answer": "workUnitProvisioningAnswer / composeProvisioningAnswerForRoute",
    "subject of attention": "committed Focus — never the drawer store",
    "queue ordering (candidate grain)": "sortPlacementCandidateQueueRows",
    "manual position application": "applyCohortLocalManualPositions",
    "override -> snapshot merge": "applyPlacementCandidateOverrides",
    "section rank + group range": "assignWaitlistCandidateRuntimePositions",
    "manual position write": "upsertPlacementPinOverride / releaseManualPositionOverrides",
    "candidate uniqueness": "placementCandidateSubjectUniqueness (+ lifecycle hook)",
    "focus panel body identity": "bodyRenderKey = the committed subject",
    "speculative prewarm": "drawerVmPrewarmScheduler",
    "roster (site/day)": "RosterWorkspace — one authoritative request per genuine (site,date)",
};

/**
 * AUTHORITATIVE per-subject reads. Exactly one per subject intent, always.
 *
 * These are the reads the Focus Panel remount defect duplicated. If any of them appears twice for
 * one subject with identical parameters, a subtree was recreated or a second owner appeared.
 */
export const AUTHORITATIVE_CARD_READS = [
    { key: "financials", match: /\/api\/admin\/financials\/card\b/ },
    { key: "attendance", match: /\/api\/admin\/attendance\/card\b/ },
    { key: "health", match: /\/api\/admin\/health\/card\b/ },
];

/** One authoritative roster read per genuine (site, date). A satisfied state is never refetched. */
export const ROSTER_READ = /\/api\/admin\/roster\b/;

/**
 * Duplication that is CORRECT, with the reason. Anything not matched here and seen twice with
 * identical parameters and no operator intent is REDUNDANT and fails certification.
 */
export const INTENTIONAL_DUPLICATION = [
    { match: /_rsc=/, why: "Next.js RSC prefetch superseded by a faster navigation — aborted, not served twice." },
    { match: /\/api\/admin\/queue-view-totals/, why: "Explicit refresh after a mutation moved the counted facts." },
    { match: /provisioning-answer/, why: "Speculative prefetch keyed identically to the demand read; K2 dedup means the click consumes it." },
];

/** Classify repeated identical requests against the map above. */
export function classifyDuplicates(urls) {
    const counts = new Map();
    for (const u of urls) counts.set(u, (counts.get(u) ?? 0) + 1);
    const intentional = [], redundant = [];
    for (const [url, n] of counts) {
        if (n < 2) continue;
        const rule = INTENTIONAL_DUPLICATION.find((r) => r.match.test(url));
        (rule ? intentional : redundant).push({ url, count: n, why: rule?.why ?? null });
    }
    return { intentional, redundant };
}

/** Per-subject authoritative card read counts — the hard invariant the harness enforces. */
export function cardReadCounts(urls) {
    const out = {};
    for (const { key, match } of AUTHORITATIVE_CARD_READS) {
        const hits = urls.filter((u) => match.test(u));
        const bySubject = new Map();
        for (const h of hits) bySubject.set(h, (bySubject.get(h) ?? 0) + 1);
        out[key] = { total: hits.length, maxPerSubject: bySubject.size ? Math.max(...bySubject.values()) : 0 };
    }
    return out;
}

/** A section id mounting more than once in one entry is a remount — never acceptable. */
export function remounts(mounts) {
    const byId = new Map();
    for (const m of mounts) byId.set(m.id, [...(byId.get(m.id) ?? []), m.t]);
    return [...byId.entries()].filter(([, ts]) => ts.length > 1).map(([id, ts]) => ({ id, mounts: ts.length, at: ts }));
}
