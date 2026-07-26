import WorkUnitSlugRouteHost from "@/components/admin/workspace/WorkUnitSlugRouteHost";
import ProvisioningAnswerSeed from "@/components/admin/workspace/ProvisioningAnswerSeed";
import { loadWorkUnitSlugRouteMetaServer } from "@/lib/admin/loadWorkUnitSlugRouteServer";
import { composeProvisioningAnswerForRoute } from "@/lib/runtime/provisioning/composeProvisioningAnswerForRoute";
import { provisioningAnswerUrl } from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";

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
 * above-fold VM) so K2's Preparation round-trip resolves WARM, off the full-hydration critical path
 * (Laws 2/5). The compose is STREAMED (not awaited): its pending promise crosses the RSC boundary while
 * the client bundle downloads, so the server compose OVERLAPS delivery instead of running serially after
 * hydration. The seed is co-located with `WorkUnitSlugRouteHost` — the same early-hydrating boundary
 * whose render-phase write is proven to precede the Surface Host's cold-load consume (a page-segment
 * seed is dropped: this layout renders the Host, not `children`).
 */
export default async function OperatorWorkUnitSlugLayout({ params }: LayoutProps) {
    const { workUnitSlug } = await params;

    // Kick the answer compose off FIRST (not awaited yet) so it runs CONCURRENTLY with the route-meta
    // resolve, then await both. Default subject (no lens/subject) — the bare direct-load path K2 keys as
    // `provisioningAnswerUrl(slug, null, null)`. Fail-safe: null on any gate failure / throw, which the
    // seed treats as "no seed" (K2 falls back to its existing live fetch).
    const seedUrl = provisioningAnswerUrl(workUnitSlug, null, null);
    const answerP = composeProvisioningAnswerForRoute({
        rawSlug: workUnitSlug,
        requestedWorkViewId: null,
        requestedSubjectId: null,
    })
        .then((r) => (r.ok ? r.answer : null))
        .catch(() => null);

    const [initialRouteMeta, answer] = await Promise.all([
        loadWorkUnitSlugRouteMetaServer(workUnitSlug),
        answerP,
    ]);

    return (
        <>
            <WorkUnitSlugRouteHost workUnitSlug={workUnitSlug} initialRouteMeta={initialRouteMeta} />
            <ProvisioningAnswerSeed seedUrl={seedUrl} answer={answer} />
        </>
    );
}
