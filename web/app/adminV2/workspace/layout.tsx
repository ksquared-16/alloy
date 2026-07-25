import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { buildAccessScopeCacheFingerprint, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import AdminV2WorkspaceClientProviders from "./AdminV2WorkspaceClientProviders";
import type { AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";
import { loadAdminViewerTimezoneBootstrap } from "@/lib/admin/viewerTimezoneBootstrap";
import { loadOperationalOrgTimezoneIana } from "@/lib/admin/loadOperationalOrgTimezoneServer";
import { loadEntityLabelsMapForOrgId, type EntityLabelsBootstrapMap } from "@/lib/admin/entityLabelsServer";
import { loadOperatorLifecycleLandingCardsServer } from "@/lib/admin/loadOperatorLifecycleLandingServer";
import { composeWorkspaceRouteVm } from "@/lib/adminV2/runtime/surface/workspaceRouteVm";
import { AlloyOperationalBootShell } from "@/components/admin/workspace/AlloyOperationalBootShell";

export const dynamic = "force-dynamic";

async function loadOrgDisplayName(orgId: string): Promise<string | null> {
    try {
        const supabase = createAdminClient();
        const { data: orgRow } = await supabase.from("orgs").select("name").eq("id", orgId).maybeSingle();
        const n =
            orgRow && typeof (orgRow as { name?: unknown }).name === "string" ?
                (orgRow as { name: string }).name.trim()
            :   "";
        return n || null;
    } catch (e) {
        console.error("[adminV2/workspace/layout] org name load failed:", e);
        return null;
    }
}

async function loadViewerTimezoneSafe(userId: string): Promise<AdminViewerTimezoneValue> {
    try {
        return await loadAdminViewerTimezoneBootstrap(userId);
    } catch (e) {
        console.error("[adminV2/workspace/layout] viewer timezone bootstrap failed:", e);
        return { iana: "UTC", source: "utc_fallback" };
    }
}

async function loadOperationalTimezoneSafe(orgId: string): Promise<string> {
    try {
        return await loadOperationalOrgTimezoneIana(orgId);
    } catch (e) {
        console.error("[adminV2/workspace/layout] operational org timezone failed:", e);
        return "UTC";
    }
}

/** Cap a first-paint seed load so a slow/N+1 query can never gate the shared layout composition;
 *  on timeout (or error) degrade to `fallback` and let the client refinement path fill it in. */
async function withTimeoutOrDefault<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
    });
    try {
        return await Promise.race([promise.catch(() => fallback), timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export default async function AdminV2WorkspaceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const layoutT0 = typeof performance !== "undefined" ? performance.now() : 0;

    const auth = await getAdminAuth();

    if (!auth?.user?.id) {
        redirect("/login");
    }

    if (!auth.role) {
        redirect("/unauthorized");
    }

    const orgId = auth.orgId;
    if (!orgId) {
        // Rendered inside AdminV2Shell (the parent adminV2 layout) → content mode only, no duplicate
        // sidebar/top-nav chrome (Kelly A1).
        return <AlloyOperationalBootShell variant="workspace" chrome="content" />;
    }

    const [orgName, viewerTimezone, operationalTimezoneIana, access, initialEntityLabels, lifecycleCards] =
        await Promise.all([
            loadOrgDisplayName(orgId),
            loadViewerTimezoneSafe(auth.user.id),
            loadOperationalTimezoneSafe(orgId),
            getAdminAccessContextCached(),
            // Known org id (no redundant access-core resolve) + a hard timeout so a slow cold industry
            // lookup can never block the workspace/work-unit first composition — labels degrade to
            // last-known/default and warm in the background. (Trust Closure deployed-perf fix.)
            loadEntityLabelsMapForOrgId(orgId, { timeoutMs: 150 }).catch(
                (): EntityLabelsBootstrapMap => ({})
            ),
            // First-paint lifecycle tiles for the workspace Route VM. Loads in parallel with the
            // existing bundle; graceful [] on no-access/error keeps the client refinement path intact.
            // TIMEOUT (same doctrine as entity-labels above): this is a landing-only seed with a
            // per-unit N+1, so on a WORK-UNIT route it is dead weight, and even on the landing the
            // client refinement path fills it in. Cap it so it can never gate the shared layout's first
            // composition — degrade to [] and let the client refine, rather than block the reveal.
            withTimeoutOrDefault(loadOperatorLifecycleLandingCardsServer(), 600, []),
        ]);

    if (!access.ok) {
        redirect("/unauthorized");
    }
    const accessScopeFingerprint = buildAccessScopeCacheFingerprint(scopeDimensionsFromAccess(access));

    // Canonical server-composed workspace Route VM (the single first-paint payload). Assembled from
    // the parallel-loaded parts above; consumed by the index page via the Route VM context.
    const workspaceRouteVm = composeWorkspaceRouteVm({
        context: { orgId, orgName, accessScopeFingerprint },
        lifecycleCards,
    });

    if (process.env.NODE_ENV === "development") {
        const layoutMs =
            typeof performance !== "undefined" ? Math.round(performance.now() - layoutT0) : null;
        console.info("[adminV2/workspace] resolved_timezones", {
            viewer: viewerTimezone,
            operational_org_iana: operationalTimezoneIana,
            org_id: orgId,
            layout_parallel_bundle_ms: layoutMs,
        });
    }

    return (
        <AdminV2WorkspaceClientProviders
            userEmail={typeof auth.user.email === "string" && auth.user.email ? auth.user.email : "Unknown"}
            principalUserId={auth.user.id}
            role={auth.role}
            roleKeys={auth.roleKeys ?? []}
            orgName={orgName}
            orgId={orgId}
            accessScopeFingerprint={accessScopeFingerprint}
            initialEntityLabels={initialEntityLabels}
            initialViewerTimezone={viewerTimezone}
            initialOperationalTimezoneIana={operationalTimezoneIana}
            workspaceRouteVm={workspaceRouteVm}
        >
            {children}
        </AdminV2WorkspaceClientProviders>
    );
}
