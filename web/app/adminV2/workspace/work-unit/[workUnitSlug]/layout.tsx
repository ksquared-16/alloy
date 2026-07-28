import WorkUnitSlugRouteHost from "@/components/admin/workspace/WorkUnitSlugRouteHost";
import ProvisioningAnswerSeed from "@/components/admin/workspace/ProvisioningAnswerSeed";
import { loadWorkUnitSlugRouteMetaServer } from "@/lib/admin/loadWorkUnitSlugRouteServer";
import { composeProvisioningAnswerForRoute } from "@/lib/runtime/provisioning/composeProvisioningAnswerForRoute";

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
 * page-segment seed is dropped: this layout renders the Host, not `children`).
 *
 * Only the DEFAULT subject is seeded (this layout has no `searchParams`); a `?subject_id` / `?work_view_id`
 * deep link keys differently and falls back to K2's live fetch. Any gate failure / non-operational terminal
 * seeds nothing → K2's existing fetch. The seed can only help, never trap the surface.
 */
export default async function OperatorWorkUnitSlugLayout({ params }: LayoutProps) {
    const { workUnitSlug } = await params;

    // Compose concurrently with route-meta; hand the seed only an operational/empty terminal (an `error`
    // or gate-failure resolves to null → K2 falls back to its live fetch). The seed takes the ROUTE
    // IDENTITY (bare direct-load: no lens/subject) — the KERNEL derives K2's cache key (RA-1), so this
    // layer never touches the key scheme.
    const answerP = composeProvisioningAnswerForRoute({
        rawSlug: workUnitSlug,
        requestedWorkViewId: null,
        requestedSubjectId: null,
    })
        .then((r) => (r.ok && r.answer.terminal !== "error" ? r.answer : null))
        .catch(() => null);

    const [initialRouteMeta, answer] = await Promise.all([
        loadWorkUnitSlugRouteMetaServer(workUnitSlug),
        answerP,
    ]);

    return (
        <>
            <WorkUnitSlugRouteHost workUnitSlug={workUnitSlug} initialRouteMeta={initialRouteMeta} />
            <ProvisioningAnswerSeed target={workUnitSlug} answer={answer} />
        </>
    );
}
