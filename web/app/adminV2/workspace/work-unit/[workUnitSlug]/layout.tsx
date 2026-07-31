import WorkUnitSlugRouteHost from "@/components/admin/workspace/WorkUnitSlugRouteHost";
import RouteTimingSeed from "@/components/admin/workspace/RouteTimingSeed";
import { loadWorkUnitSlugRouteMetaServer } from "@/lib/admin/loadWorkUnitSlugRouteServer";
import {
    routeTimingEnabled,
    timedSpan,
    type RouteTimingMarks,
} from "@/lib/perf/routeTimingDiagnostic";

type LayoutProps = {
    children: React.ReactNode;
    params: Promise<{ workUnitSlug: string }>;
};

/**
 * Stable shell for `/workspace/work-unit/:slug` and optional `:recordId` child segment.
 *
 * Resolves the work-unit route identity on the server (Operational Runtime Doctrine Laws 1/5) so the
 * client host mounts already-resolved — no `WorkUnitWorkspaceColdShell` / client slug-resolution
 * waterfall. `null` (invalid/not-found/ambiguous/no-access/error) falls back to the host's existing
 * client resolution, so behavior and the runtime-flag rollback path are unchanged.
 *
 * Runtime V1 Realization — it ALSO seeds the bounded Provisioning Answer (subject identity + the whole
 * above-fold VM) so K2's Preparation round-trip resolves WARM, without the post-hydration network hop
 * (Laws 2/5). The compose is AWAITED here (a resolved plain object is handed to the seed, NOT a streamed
 * promise — a pending RSC-promise prop crashes hydration in Next 16, and a client-hydration-gated stream
 * cannot deliver the answer before the seed already can; both were measured and reverted). It runs
 * CONCURRENTLY with the route-meta resolve (one `Promise.all`), so on a WARM config cache TTFB is barely
 * affected; on a COLD cache it adds the compose to TTFB (~2-4s), paid back by removing the ~3-4s
 * post-hydration provisioning round-trip. The seed is co-located with `WorkUnitSlugRouteHost` — the same
 * early-hydrating boundary whose render-phase write precedes the Surface Host's cold-load consume (a
 * same commit, ahead of the Host's consume effect).
 *
 * Only the DEFAULT subject is seeded here — this layout has no `searchParams`, by framework design. A
 * `?subject_id` / `?work_view_id` deep link keys differently, so the PAGE segment now owns that case:
 * it is the only server boundary that receives `searchParams`. This layout therefore renders
 * `{children}` (it previously discarded them, which is why an earlier page-seed experiment never
 * mounted at all — see `page.tsx` and DEEPLINK-COMPOSE-OWNERSHIP.md §2a).
 *
 * Any gate failure / non-operational terminal seeds nothing → K2's existing fetch. The seed can only
 * help, never trap the surface.
 */
export default async function OperatorWorkUnitSlugLayout({ children, params }: LayoutProps) {
    const { workUnitSlug } = await params;

    // Diagnostic only (PE-3): the span wraps the SAME promise the route already awaits, so enabling
    // the flag cannot reorder or serialize anything.
    const timing = routeTimingEnabled();
    const layoutEntryEpochMs = timing ? Date.now() : 0;
    const layoutStarted = timing ? performance.now() : 0;

    const [initialRouteMeta, routeMetaMs] = await timedSpan(loadWorkUnitSlugRouteMetaServer(workUnitSlug));

    const marks: RouteTimingMarks | null = timing
        ? {
              layout_entry_epoch_ms: layoutEntryEpochMs,
              route_meta_ms: Math.round(routeMetaMs),
              // The compose no longer happens here — it moved to the page segment, which is the only
              // boundary that can see which subject was asked for.
              compose_wall_ms: 0,
              layout_total_ms: Math.round(performance.now() - layoutStarted),
              seeded: false,
          }
        : null;

    return (
        <>
            <WorkUnitSlugRouteHost workUnitSlug={workUnitSlug} initialRouteMeta={initialRouteMeta} />
            <RouteTimingSeed marks={marks} />
            {/* The page segment owns provisioning composition and the seed — it is the only server
                boundary that receives `searchParams`, so only it can compose the subject the URL
                actually asked for. It renders no UI; without `children` it would never mount. */}
            {children}
        </>
    );
}
