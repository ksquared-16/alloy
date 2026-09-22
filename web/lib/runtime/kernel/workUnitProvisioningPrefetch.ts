/**
 * Provisioning-answer PREFETCH cache — removes blank time on Workspace → Work Unit navigation.
 *
 * K2's `workUnitEntryResourceClient` is the ONE round-trip on the operational critical path (~server 2.8s
 * + transport). Nothing prefetched it, so every navigation paid it in full. This module lets operator
 * INTENT (hover / focus on a work-unit tile) warm that exact answer into a short-TTL cache; K2's fetch then
 * resolves from the warm entry instead of the network — the click commits immediately.
 *
 * Correctness: the cached answer is the SAME payload K2 would fetch (same URL). Freshness is bounded by a
 * short TTL — a warm entry only serves a click within `PREFETCH_TTL_MS`; after that K2 fetches fresh. This
 * changes NO kernel semantics: K2 still performs its single Preparation round-trip; the round-trip is just
 * served from a warm cache when intent preceded it. Errors are never cached — a failed prefetch simply lets
 * K2 fetch normally.
 */
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { retainedDepartmentConfigIds } from "@/lib/adminV2/navigation/workspaceNavTreeCache";
import { heldFocusPanelSummaryIdentities } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import { logCurrentWorkInit } from "@/lib/adminV2/runtime/diagnostics/currentWorkInitDiagnostics";

/**
 * How long a prefetched answer may serve a subsequent click. Raised from 15s: a proactively PREPARED
 * destination (Workspace idle prep) may sit for a while before the operator clicks into it — a stale
 * prep forced a cold ~4s entry fetch even though the answer was in hand. 60s keeps the prepared entry
 * consumable across normal browsing; the committed surface still settles fresh values after commit.
 */
export const PREFETCH_TTL_MS = 60_000;

type Entry = { promise: Promise<ProvisioningAnswer>; startedAt: number };

const cache = new Map<string, Entry>();

/** Build the exact provisioning-answer URL K2 uses — shared so prefetch and fetch key identically. */
export function provisioningAnswerUrl(
    target: string,
    lens?: string | null,
    subject?: string | null,
    cohort?: "none" | null,
    aspect?: string | null,
    /**
     * S6-1. The client asserting that it already holds usable published department configuration for
     * this Work Unit's department, so the answer need not re-send ~30 KB of it.
     *
     * It rides the URL ON PURPOSE. This string is the coalescing key, the intent-warm key and the
     * consume-once key, and the answer's CONTENT depends on this flag — so it has to be part of the
     * identity, or a "client holds it" answer could later be served to a client that does not. The
     * assertion is only ever a claim about the CLIENT; whether omitting is actually safe is decided
     * server-side, because only the server knows if a pinned revision makes this subject's copy
     * differ from the live department configuration.
     */
    departmentConfigHeldIds?: readonly string[],
    summaryConfigHeldIds?: readonly string[],
): string {
    const q = new URLSearchParams();
    if (lens) q.set("work_view_id", lens);
    if (subject) q.set("subject_id", subject);
    // CONTEXTUAL FOCUS IS PART OF THE KEY, not just of the request. Two answers for the same host and
    // subject — one that selected a cohort and one that selected none — are DIFFERENT answers, and a
    // shared key would let a warm operational answer serve a contextual entry (or the reverse). The
    // aspect rides along for the same reason: it is what the contextual answer composes its card from.
    if (cohort === "none") q.set("cohort", "none");
    if (cohort === "none" && aspect) q.set("aspect", aspect);
    if (departmentConfigHeldIds && departmentConfigHeldIds.length) q.set("dept_config", [...departmentConfigHeldIds].sort().join(","));
    if (summaryConfigHeldIds && summaryConfigHeldIds.length) q.set("summary_cfg", [...summaryConfigHeldIds].sort().join(","));
    const qs = q.toString();
    return `/api/admin/work-units/${encodeURIComponent(target)}/provisioning-answer${qs ? `?${qs}` : ""}`;
}

function isFresh(entry: Entry, now: number): boolean {
    return now - entry.startedAt < PREFETCH_TTL_MS;
}

/**
 * Warm the provisioning answer for a work-unit slug (default lens) on operator intent. Deduped + TTL'd:
 * one in-flight fetch per URL, re-warmed only after the TTL lapses. Best-effort and non-throwing.
 */
export function prefetchWorkUnitProvisioning(
    target: string,
    opts: {
        lens?: string | null;
        subject?: string | null;
        cohort?: "none" | null;
        aspect?: string | null;
        now?: number;
    } = {},
): Promise<ProvisioningAnswer> | null {
    const slug = target.trim();
    if (!slug || typeof window === "undefined") return null;
    const url = provisioningAnswerUrl(
        slug, opts.lens, opts.subject, opts.cohort, opts.aspect,
        retainedDepartmentConfigIds(),
        heldFocusPanelSummaryIdentities(),
    );
    const now = opts.now ?? Date.now();
    const existing = cache.get(url);
    if (existing && isFresh(existing, now)) {
        logCurrentWorkInit("provisioning.prefetch.warm-reuse", { cacheKey: url, cache: "hit", preloadSource: "prefetch" });
        return existing.promise; // already warm / in-flight
    }

    logCurrentWorkInit("provisioning.prefetch.fetch", { cacheKey: url, cache: "miss", preloadSource: "prefetch", note: "intent-warm network fetch" });
    /*
     * ── ONE IN-FLIGHT OPERATION PER ANSWER, ACROSS BOTH PATHS ────────────────────────────────────
     *
     * This used to call `fetch` directly, which is what made the two paths independent: a warm here
     * registered only in `cache` (TTL), while K2's entry fetch registers only in `inflightEntry`.
     * Neither could see the other's request, so a prewarm and a selection for the SAME answer raced.
     *
     * Measured on Firefly under rapid subject alternation: ten provisioning requests, six distinct
     * URLs, four of them CONCURRENT overlaps of a byte-identical URL — one pair issued 351ms into a
     * request that ran 854ms. Routing the prewarm through the same coalescer closes it in both
     * directions: a selection now joins a prewarm already in flight, and vice versa.
     *
     * SCOPE SAFETY. The URL is the complete request identity, not an approximation of it: the route
     * derives its answer from the slug plus `work_view_id`, `subject_id`, `cohort` and `aspect`, and
     * `provisioningAnswerUrl` encodes exactly those. Tenant and access scope come from the session
     * gate, which is constant for a browser session. And the entry is dropped the instant it settles,
     * so this coalesces only genuinely concurrent work and can never serve a stale answer.
     */
    const promise = fetchProvisioningEntryDeduped(url)
        .then((result) => {
            if (!result.ok) throw new Error(`prefetch failed HTTP ${result.status}`);
            return result.answer;
        })
        .catch((err) => {
            // Never cache a failure: drop the entry so K2 fetches fresh.
            if (cache.get(url)?.promise === promise) cache.delete(url);
            throw err;
        });
    cache.set(url, { promise, startedAt: now });
    traceSeedEvent("register", "prefetch", url, null);
    // Keep the stored promise "handled" so a prefetch that is never consumed (or errors) does not surface
    // as an unhandled rejection. Consumers (K2) attach their own try/catch when they await it.
    void promise.catch(() => {});
    // Return the SAME promise the URL cache holds (and that K2's `consumeFreshProvisioning` will serve),
    // so callers can chain off the answer — e.g. to prepare its default subject's VM — without a second
    // fetch or a second cache identity.
    return promise;
}

/**
 * INTERNAL seed primitive (RA-3). Writes a server-composed answer into the SAME cache K2 consumes.
 * It takes a raw URL key deliberately — but it is **module-private** so no layer outside the kernel can
 * hand-build (and thus drift) that key: `seedProvisioningForRoute` is the SOLE public seed seam, and it
 * derives the key here via `provisioningAnswerUrl` (the one key builder). Key parity with K2's consume
 * is therefore a structural in-kernel invariant, not a convention callers must honor.
 *
 * It is NOT a new cache, endpoint, or contract: identical key + identical `Promise<ProvisioningAnswer>`
 * entry shape as an intent prefetch — only a different WARM SOURCE (server, not hover). The caller passes
 * an already-committable answer (`operational` | `empty`); a gate failure / `error` terminal is filtered
 * to `null` at the compose boundary and never reaches here. Idempotent: it will not clobber a still-fresh
 * entry for the same URL (so a Strict-Mode double-invoke, or an intent prefetch that already warmed this
 * URL, wins/stays), and it is a no-op on the server (the cache is browser-side).
 */
function seedProvisioning(
    url: string,
    answer: ProvisioningAnswer | null,
    now: number = Date.now(),
    producer: string = "unlabelled",
): void {
    if (typeof window === "undefined" || answer == null || answer.terminal === "error") return;
    const existing = cache.get(url);
    if (existing && isFresh(existing, now)) return; // never clobber a fresher warm entry
    cache.set(url, { promise: Promise.resolve(answer), startedAt: now });
    logCurrentWorkInit("provisioning.seed", { cacheKey: url, cache: "seed", preloadSource: "seed", note: "server-composed answer seeded" });
    traceSeedEvent("register", producer, url, answer);
}

/**
 * SEED/CONSUME TRACE — default-off diagnostic for seed-authority regressions.
 *
 * Retained (not experiment scaffolding) because the contract it observes is one the runtime can break
 * silently: a seed registered under the wrong key, or consumed twice, or never consumed, produces a
 * wasted compose rather than a visible fault. The durable source guards in
 * `seedAuthorityLifecycle.test.ts` pin the ownership; this shows the live sequence when something still
 * looks wrong.
 *
 * The experiment-only parts are gone: caller stacks, visible-subject-at-event, and the overwrite probe
 * were there to CLASSIFY the queue-row registrations, which is now settled and documented
 * (SUBJECT-AUTHORITY.md §6).
 *
 * Gated on `localStorage.ALLOY_SEED_TRACE === "1"`, default off, and it writes only to a window array —
 * never the console, never a server log — so no subject identifier reaches ordinary output. Deliberately
 * NOT a bare `process.env` check: this runs in the BROWSER, where Next only exposes `NEXT_PUBLIC_*`, so
 * an env flag would compile to `undefined` and the trace would silently never fire.
 */
function traceSeedEvent(
    kind: "register" | "consume-hit" | "consume-miss",
    producer: string,
    url: string,
    answer: ProvisioningAnswer | null,
): void {
    if (typeof window === "undefined") return;
    try {
        if (window.localStorage?.getItem("ALLOY_SEED_TRACE") !== "1") return;
    } catch {
        return;
    }
    const w = window as unknown as { __alloySeedTrace?: unknown[] };
    (w.__alloySeedTrace ??= []).push({
        kind,
        producer,
        t: Math.round(typeof performance !== "undefined" ? performance.now() : 0),
        url,
        subjectInKey: new URL(url, "http://x").searchParams.get("subject_id"),
        lensInKey: new URL(url, "http://x").searchParams.get("work_view_id"),
        composedSubject:
            answer != null && answer.terminal === "operational" ? answer.recordOfAttention?.id ?? null : null,
        terminal: answer?.terminal ?? null,
    });
}

/** A route's attention identity — the coordinates the kernel keys its cache on. */
export type ProvisioningRouteIdentity = {
    target: string;
    lens?: string | null;
    subject?: string | null;
    /** `"none"` = the operator selected no cohort. Part of the identity, not a decoration on it. */
    cohort?: "none" | null;
    aspect?: string | null;
};

/**
 * THE CANONICAL SERVER→KERNEL PRELOAD SEAM for the provisioning cache (RA-1).
 *
 * Callers (the RSC route layout / `ProvisioningAnswerSeed`) hand the kernel a ROUTE IDENTITY + the
 * server-composed answer; the kernel derives K2's cache key itself (`provisioningAnswerUrl`). No other
 * layer needs to know — or can drift from — the key scheme. Key parity with K2's consume is therefore an
 * in-kernel invariant (both go through `provisioningAnswerUrl`), guarded by the seed-contract unit test.
 */
export function seedProvisioningForRoute(
    route: ProvisioningRouteIdentity,
    answer: ProvisioningAnswer | null,
    now: number = Date.now(),
    /** TEMPORARY (producer search): who registered this seed. Diagnostic only. */
    producer: string = "unlabelled",
): void {
    if (!route.target) return;
    seedProvisioning(
        provisioningAnswerUrl(route.target, route.lens ?? null, route.subject ?? null, route.cohort ?? null, route.aspect ?? null),
        answer,
        now,
        producer,
    );
}

export type ProvisioningFetchResult =
    | { ok: true; answer: ProvisioningAnswer }
    | { ok: false; status: number };

/** In-flight coalescing map for the K2 cold-path entry fetch (separate from the intent-warm cache). */
const inflightEntry = new Map<string, Promise<ProvisioningFetchResult>>();

/**
 * K2 cold-path provisioning fetch with IN-FLIGHT de-duplication. When two identical entry fetches
 * overlap — the common case being React Strict Mode's dev double-invoke of the entry effect, or a
 * fast unmount→remount — the second call reuses the first's in-flight promise instead of issuing a
 * second identical network request. The entry is dropped the instant it settles, so this only
 * coalesces genuinely concurrent identical requests and can never serve a stale answer. The response
 * body is parsed once and shared (a Response stream can only be read by one consumer).
 *
 * This is the owning-lifecycle fix for the measured `provisioning-answer` double-fetch — not a
 * boolean/timeout guard. A superseded caller's result is discarded downstream by K2's generation
 * guard, so dropping the per-caller AbortSignal here (the fetch is a fast, idempotent GET) is safe.
 */
export function fetchProvisioningEntryDeduped(url: string): Promise<ProvisioningFetchResult> {
    const existing = inflightEntry.get(url);
    if (existing) {
        logCurrentWorkInit("provisioning.cold.dedup-hit", { cacheKey: url, cache: "hit", preloadSource: "live", note: "coalesced concurrent entry fetch" });
        return existing;
    }
    logCurrentWorkInit("provisioning.cold.fetch", { cacheKey: url, cache: "miss", preloadSource: "live", note: "cold entry network fetch" });
    const promise: Promise<ProvisioningFetchResult> = fetch(url, {
        headers: { accept: "application/json" },
        credentials: "include",
    })
        .then(async (res) =>
            res.ok
                ? ({ ok: true, answer: (await res.json()) as ProvisioningAnswer } as const)
                : ({ ok: false, status: res.status } as const),
        )
        .finally(() => {
            inflightEntry.delete(url);
        });
    inflightEntry.set(url, promise);
    return promise;
}

/** @internal test seam */
export function clearInflightProvisioningEntriesForTests(): void {
    inflightEntry.clear();
}

/**
 * Return a FRESH prefetched answer promise for this URL, or null. Consumes the entry (a click is a
 * one-shot navigation; a later revisit re-warms), so a stale entry can never serve twice.
 */
export function consumeFreshProvisioning(
    url: string,
    now: number = Date.now(),
): Promise<ProvisioningAnswer> | null {
    const entry = cache.get(url);
    if (!entry) {
        traceSeedEvent("consume-miss", "kernel-consume", url, null);
        return null;
    }
    cache.delete(url);
    if (!isFresh(entry, now)) {
        traceSeedEvent("consume-miss", "kernel-consume", url, null);
        return null;
    }
    traceSeedEvent("consume-hit", "kernel-consume", url, null);
    return entry.promise;
}

/**
 * OBSERVE AN ANSWER WITHOUT CLAIMING IT (P0-7.6 — the Sidebar's Work View counts).
 *
 * `consumeFreshProvisioning` DELETES on read, and that is load-bearing: one logical answer per
 * navigation, consumed once by the surface that owns the route. The header below documents what
 * happens when a consume misses — the surface waits 4.7s for an answer it already had.
 *
 * The persistent left nav needs the SAME answer's Work View counts, and it is not the route's
 * owner. If it consumed, it would steal the answer from the surface and cause exactly that
 * defect. So it observes instead.
 *
 * This is deliberately the smallest possible addition: the SAME cache, the SAME key, the SAME
 * freshness window, the SAME stored promise. It does not delete, does not re-stamp `startedAt`,
 * does not mutate the entry, and adds no second source of truth. An expired entry is reported as
 * absent and left for the existing paths to evict, so a peek can never resurrect stale truth nor
 * extend anyone's TTL.
 *
 * Observation must not change what the owner later consumes: peek-then-consume returns the same
 * value, consume-then-peek returns nothing, and any number of peeks leaves consume unaffected.
 */
export function peekFreshProvisioning(
    url: string,
    now: number = Date.now(),
): Promise<ProvisioningAnswer> | null {
    const entry = cache.get(url);
    if (!entry) return null;
    // Freshness is READ, never refreshed, and eviction stays with the consuming paths.
    if (!isFresh(entry, now)) return null;
    return entry.promise;
}

/**
 * CONSUME A ROUTE'S ANSWER, WITH THE SERVER SEED REACHABLE (P0-7.6 / Slice 11).
 *
 * ── THE DIVERGENCE THIS EXISTS TO CLOSE ──
 *
 * The seam above documents key parity with the server seed as "an in-kernel invariant (both go
 * through `provisioningAnswerUrl`)". Both do — with DIFFERENT ARITY, and that is where parity was
 * actually lost. The consume passes the S6-1 client assertions (`retainedDepartmentConfigIds`,
 * `heldFocusPanelSummaryIdentities`), which ride the URL on purpose because they change the
 * answer's CONTENT. `seedProvisioningForRoute` cannot pass them: it runs on the server, which does
 * not know what this browser is holding. So the moment a returning operator holds any published
 * department configuration, the two keys can never match.
 *
 * Measured on deployed `009beb369`, from the runtime's own seed trace:
 *
 *     register      t=5032  producer=page(...)       /…/provisioning-answer
 *     consume-miss  t=5036  producer=kernel-consume  /…/provisioning-answer?dept_config=<4 ids>
 *
 * The server-composed operational answer was in the cache four milliseconds before the consume that
 * missed it, and the surface then waited 4.7 s (6.6 s on the colder baseline) for a live fetch of an
 * answer it already had. The better the client's cache, the more certainly the seed was unreachable.
 *
 * ── WHY THE BASE-KEY FALLBACK IS SAFE, AND NOT A WIDENING OF IDENTITY ──
 *
 * The base key — target, lens, subject, cohort, aspect — is the identity of WHICH answer this is.
 * The assertion parameters are not part of that question; they only tell the server "you may omit
 * configuration I already hold". An answer composed WITHOUT the assertion therefore carries the
 * full configuration: consuming it is a SUPERSET of what the asserted key would have returned, never
 * a subset, so it cannot be missing anything the caller was entitled to.
 *
 * Direction matters and only one direction is sound. A base-key seed may serve an asserting consume.
 * An assertion-keyed entry must NEVER serve a consume that did not assert — that one could be
 * genuinely short of configuration — so no fallback is offered the other way.
 *
 * Everything else is unchanged: one logical answer per navigation, consume-once (both lookups go
 * through `consumeFreshProvisioning`, which deletes on read), the same freshness window, the same
 * latest-destination generation guard downstream, and the same server authorization — the seeded
 * answer was composed by `composeProvisioningAnswerForRoute`, the same tenant-authorized path the
 * HTTP seam uses. This adds no request, no cache and no second owner; it removes a request.
 */
export function consumeFreshProvisioningForRoute(
    route: ProvisioningRouteIdentity,
    departmentConfigHeldIds: readonly string[] | undefined,
    summaryConfigHeldIds: readonly string[] | undefined,
    now: number = Date.now(),
): { promise: Promise<ProvisioningAnswer>; via: "exact" | "seed-base"; url: string } | null {
    const exactUrl = provisioningAnswerUrl(
        route.target, route.lens ?? null, route.subject ?? null, route.cohort ?? null, route.aspect ?? null,
        departmentConfigHeldIds, summaryConfigHeldIds,
    );
    const exact = consumeFreshProvisioning(exactUrl, now);
    if (exact) return { promise: exact, via: "exact", url: exactUrl };

    const baseUrl = provisioningAnswerUrl(
        route.target, route.lens ?? null, route.subject ?? null, route.cohort ?? null, route.aspect ?? null,
    );
    // Nothing to fall back TO when the caller asserted nothing — the keys are already the same string,
    // and re-reading would be a second consume of an entry the first lookup already deleted.
    if (baseUrl === exactUrl) return null;

    const base = consumeFreshProvisioning(baseUrl, now);
    if (!base) return null;
    return { promise: base, via: "seed-base", url: baseUrl };
}

/**
 * Warm the provisioning answer for an operator entry HREF — derives `target` + `lens` exactly as the K1
 * gesture (`attentionTargetFromEntryHref`) will (path `/work-unit/{target}`, lens from `?work_view_id=`),
 * so the prefetch key is identical to the click's fetch for both default tiles and work-view rows.
 */
export function prefetchWorkUnitProvisioningFromHref(
    href: string | null | undefined,
): Promise<ProvisioningAnswer> | null {
    if (!href || typeof window === "undefined") return null;
    try {
        const u = new URL(href, window.location.origin);
        const m = u.pathname.match(/\/work-unit\/([^/?#]+)/);
        if (!m) return null;
        return prefetchWorkUnitProvisioning(decodeURIComponent(m[1]), { lens: u.searchParams.get("work_view_id") });
    } catch {
        /* non-parseable href — no prefetch */
        return null;
    }
}

/** @internal test seam + publish-path bust so the next Work Unit entry cannot serve a stale answer. */
export function clearProvisioningPrefetchCache(): void {
    cache.clear();
}

/** @deprecated Prefer {@link clearProvisioningPrefetchCache}. */
export function clearProvisioningPrefetchForTests(): void {
    clearProvisioningPrefetchCache();
}
