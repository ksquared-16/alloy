import { Suspense } from "react";
import ProvisioningAnswerSeed from "@/components/admin/workspace/ProvisioningAnswerSeed";
import ProvisioningFrameRegistration from "@/components/admin/workspace/ProvisioningFrameRegistration";
import ProvisioningSettlementSeed from "@/components/admin/workspace/ProvisioningSettlementSeed";
import type { ProvisioningSettlementPatch } from "@/lib/runtime/provisioning/provisioningSettlement";
import RouteTimingSeed from "@/components/admin/workspace/RouteTimingSeed";
import {
    collectedRouteTiming,
    recordRouteTiming,
    routeTimingEnabled,
} from "@/lib/perf/routeTimingDiagnostic";
import { composeProvisioningAnswerForRoute } from "@/lib/runtime/provisioning/composeProvisioningAnswerForRoute";
import type { ProvisioningTimings } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { toRscPlainJson } from "@/lib/runtime/toRscPlainJson";

type PageProps = {
    params: Promise<{ workUnitSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined): string | null =>
    typeof v === "string" && v.trim() !== "" ? v : null;

/**
 * Does this answer's `timings` carry the full section breakdown?
 *
 * A written predicate rather than an `in` check, because `in` narrows to an intersection and would
 * have needed a cast to read through — and a cast here would assert a shape the contextual composer
 * genuinely does not have.
 */
function hasComposeSections(t: { total_ms: number } | null): t is ProvisioningTimings {
    return t != null && typeof (t as ProvisioningTimings).authorization_ms === "number";
}

/**
 * ORDERING EXPERIMENT (Option B — docs/runtime/DEEPLINK-COMPOSE-OWNERSHIP.md).
 *
 * The queue surface mounts from `[workUnitSlug]/layout.tsx`; this segment renders no user-facing UI.
 * What it uniquely has is `searchParams` — a layout never receives them — so it is the only server
 * boundary that can know WHICH subject a deep link asked for.
 *
 * The historical objection ("a page-segment seed hydrates in a later streaming boundary and loses the
 * race to K2's consume") has been withdrawn: no commit ever landed a page seed, and the single
 * experiment behind that claim never mounted its seed at all, because the layout discarded `children`.
 * The real ordering requirement is a render-phase write inside `SurfaceHostProvider`'s subtree with no
 * intervening Suspense boundary — which this segment satisfies now that the layout renders `children`.
 *
 * MEASURED, and the ordering holds: on a valid deep link the page's subject-keyed seed registered at
 * 3839ms and was consumed at 3842ms — it wins, in the same commit, and the layout's own seed fired at
 * the same instant, so this boundary is not later. Composed subject = requested = visible; zero client
 * provisioning fetch for the initial navigation.
 *
 * Because the ordering holds, this segment now owns provisioning composition for BOTH cases — a
 * requested subject and the bare default. That is what makes "exactly one compose" true: the layout no
 * longer composes at all, so no default-subject answer is produced and discarded on a deep link.
 */
export default async function OperatorWorkUnitSlugPage({ params, searchParams }: PageProps) {
    const [{ workUnitSlug }, sp] = await Promise.all([params, searchParams]);
    const requestedSubjectId = one(sp.subject_id);
    const requestedWorkViewId = one(sp.work_view_id);
    // CONTEXTUAL FOCUS, read strictly. The server seed must compose the SAME answer the client seam
    // would ask for, or the seed is registered under one identity and consumed under another — the
    // operator sees the default-lens answer first and the truthful one only after a second fetch.
    const cohort = one(sp.cohort) === "none" ? ("none" as const) : null;
    const aspect = cohort === "none" ? one(sp.aspect) : null;

    // The SAME tenant-authorized server path the HTTP seam uses. The subject id is a pass-through to
    // the composer, which validates it against the org-scoped evaluated page and — since the Subject
    // Authority fix — returns an honest error rather than substituting. No new trust is created here:
    // a malformed, stale, or cross-tenant id cannot select anything, and an error terminal seeds
    // nothing (K2 then falls back to its own fetch, which fails the same honest way).
    /*
     * SLICE 12A — THE COMPOSE IS MEASURED WHERE IT HAPPENS.
     *
     * This await is the route's dominant cost and, until now, the one operation the canonical
     * instrument could not see: the layout emitted `compose_wall_ms: 0` for it. The timing wraps the
     * SAME promise the route already awaits, so enabling the flag cannot reorder or serialize
     * anything, and every call below is skipped entirely when the flag is off.
     */
    const timing = routeTimingEnabled();
    const pageEntryEpochMs = timing ? Date.now() : 0;
    const pageStarted = timing ? performance.now() : 0;
    const composeStarted = timing ? performance.now() : 0;

    /*
     * TWO-PHASE EMISSION. `deferSettlement` returns as soon as the FRAME is composed — geometry,
     * configuration and whatever capability states have already resolved — and hands the rest back
     * as a promise. The frame is seeded below immediately; the settlement is awaited inside its own
     * Suspense boundary, so React flushes the frame first and the facts whenever they finish.
     *
     * Measured on deployed a5eb2f29: the card-producer join cost 740ms INSIDE the server stream
     * hold, and nothing in it selects geometry. That join is what this removes from the frame path.
     */
    const route = await composeProvisioningAnswerForRoute({
        rawSlug: workUnitSlug,
        requestedWorkViewId,
        requestedSubjectId,
        cohort,
        aspect,
        deferSettlement: true,
    }).catch(() => null);
    const composed = route && route.ok ? route.answer : null;
    const settlement = route && route.ok ? (route.settlement ?? null) : null;
    const composeWallMs = timing ? performance.now() - composeStarted : 0;

    // Unchanged admission: an error terminal seeds nothing, exactly as before.
    const answer = composed && composed.terminal !== "error" ? composed : null;

    if (timing) {
        // `composition_ready` is recorded by the compose itself as a span measured from ITS start, so
        // it is directly comparable with the sections beside it. Absent when the compose did not reach
        // the published-composition step — reported as null rather than as a zero that reads measured.
        /*
         * TWO COMPOSERS, TWO TIMING SHAPES — and the narrower one is not a missing measurement.
         *
         * `composeWorkUnitProvisioningAnswer` carries the full `ProvisioningTimings` breakdown. A
         * CONTEXTUAL answer comes from `composeContextualFocusAnswer`, which measures only
         * `total_ms` — it genuinely has no sections, rather than having sections worth zero.
         * Reporting zeros for it would invent seven measurements nobody took, so the sections are
         * surfaced only when they exist and the payload carries `null` otherwise.
         */
        const t = composed && "timings" in composed ? composed.timings : null;
        const sections = hasComposeSections(t) ? t : null;
        const readySpan = sections?.spans?.composition_ready;
        recordRouteTiming({
            page_entry_epoch_ms: pageEntryEpochMs,
            compose_wall_ms: Math.round(composeWallMs),
            seeded: answer != null,
            compose_total_ms: t != null ? Math.round(t.total_ms) : null,
            compose_sections: sections
                ? {
                      authorization_ms: Math.round(sections.authorization_ms),
                      work_unit_ms: Math.round(sections.work_unit_ms),
                      configuration_ms: Math.round(sections.configuration_ms),
                      presentation_ms: Math.round(sections.presentation_ms),
                      records_ms: Math.round(sections.records_ms),
                      projection_ms: Math.round(sections.projection_ms),
                      composition_ms: Math.round(sections.composition_ms),
                      total_ms: Math.round(sections.total_ms),
                      ...(sections.spans ? { spans: sections.spans } : {}),
                  }
                : null,
            composition_ready_ms: typeof readySpan === "number" ? readySpan : null,
            page_total_ms: Math.round(performance.now() - pageStarted),
        });
    }

    const navigation = {
        target: workUnitSlug,
        lens: requestedWorkViewId,
        subject: requestedSubjectId,
        cohort,
        aspect,
    };
    /*
     * SERIALIZED ONCE, REFERENCED TWICE.
     *
     * Calling `toRscPlainJson(answer)` at each prop produced two distinct objects, and the flight
     * serializer — which dedupes by REFERENCE — wrote the whole answer into the payload twice.
     * Measured on deployed f7aaa0b0: `decodedBodySize` 312,235 against 210,115 before, ~102KB of
     * duplicate the browser had to parse on the frame's own critical path. One binding, one copy.
     */
    const frameAnswer = answer ? toRscPlainJson(answer) : null;

    return (
        <>
        <ProvisioningAnswerSeed
            target={workUnitSlug}
            lens={requestedWorkViewId}
            subject={requestedSubjectId}
            cohort={cohort}
            aspect={aspect}
            answer={frameAnswer}
            producer={`page(subject=${requestedSubjectId ?? "null"},cohort=${cohort ?? "null"})`}
        />
        {/* PHASE 1 — the navigation becomes addressable, so a settlement has a frame to attach to
            and a settlement for another navigation has a frame to be refused against. */}
        <ProvisioningFrameRegistration navigation={navigation} answer={frameAnswer} />
        {/* PHASE 2 — awaited in its OWN boundary. Without the Suspense the page segment would block
            on the settlement again and the split would buy nothing. `fallback={null}` because this
            renders no UI: the frame above is already on screen. */}
        <Suspense fallback={null}>
            <SettlementBoundary settlement={settlement} />
        </Suspense>
        {/* ONE payload for the route: the layout's spans plus this segment's, emitted by the boundary
            that finishes last. Renders nothing when the flag is off. */}
        <RouteTimingSeed marks={collectedRouteTiming()} />
        </>
    );
}

/**
 * The only await that may still be slow, isolated behind its own boundary.
 *
 * A failed settlement resolves to null and seeds nothing: the cells stay UNKNOWN and their existing
 * owners fill them. It must never resolve to an empty patch, which would state authoritatively that
 * the producers found nothing.
 */
async function SettlementBoundary({
    settlement,
}: {
    settlement: Promise<ProvisioningSettlementPatch | null> | null;
}) {
    if (!settlement) return null;
    const patch = await settlement.catch(() => null);
    return <ProvisioningSettlementSeed patch={patch ? toRscPlainJson(patch) : null} />;
}
