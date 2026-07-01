import WorkUnitSlugRouteHost from "@/components/admin/workspace/WorkUnitSlugRouteHost";
import { loadWorkUnitSlugRouteMetaServer } from "@/lib/admin/loadWorkUnitSlugRouteServer";

type LayoutProps = {
    children: React.ReactNode;
    params: Promise<{ workUnitSlug: string }>;
};

/**
 * Stable shell for `/workspace/work-unit/:slug` and optional `:recordId` child segment.
 *
 * Resolves the work-unit route identity on the server (Operational Runtime Doctrine Laws 1/5) so
 * the client host mounts already-resolved — no `WorkUnitWorkspaceColdShell` / client slug-resolution
 * waterfall. `null` (invalid/not-found/ambiguous/no-access/error) falls back to the host's existing
 * client resolution, so behavior and the runtime-flag rollback path are unchanged.
 */
export default async function OperatorWorkUnitSlugLayout({ params }: LayoutProps) {
    const { workUnitSlug } = await params;
    const initialRouteMeta = await loadWorkUnitSlugRouteMetaServer(workUnitSlug);
    return <WorkUnitSlugRouteHost workUnitSlug={workUnitSlug} initialRouteMeta={initialRouteMeta} />;
}
