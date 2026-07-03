import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { buildAccessScopeCacheFingerprint, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import AdminV2WorkspaceClientProviders from "./AdminV2WorkspaceClientProviders";
import type { AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";
import { loadAdminViewerTimezoneBootstrap } from "@/lib/admin/viewerTimezoneBootstrap";
import { loadOperationalOrgTimezoneIana } from "@/lib/admin/loadOperationalOrgTimezoneServer";
import { loadEntityLabelsMapForUser, type EntityLabelsBootstrapMap } from "@/lib/admin/entityLabelsServer";
import { loadOperatorLifecycleLandingCardsServer } from "@/lib/admin/loadOperatorLifecycleLandingServer";
import { composeWorkspaceRouteVm } from "@/lib/adminV2/runtime/surface/workspaceRouteVm";

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
        return (
            <div className="flex min-h-screen items-center justify-center bg-admin-page p-6 text-alloy-midnight">
                Loading context...
            </div>
        );
    }

    const [orgName, viewerTimezone, operationalTimezoneIana, access, initialEntityLabels, lifecycleCards] =
        await Promise.all([
            loadOrgDisplayName(orgId),
            loadViewerTimezoneSafe(auth.user.id),
            loadOperationalTimezoneSafe(orgId),
            getAdminAccessContextCached(),
            loadEntityLabelsMapForUser(auth.user.id).catch((): EntityLabelsBootstrapMap => ({})),
            // First-paint lifecycle tiles for the workspace Route VM. Loads in parallel with the
            // existing bundle; graceful [] on no-access/error keeps the client refinement path intact.
            loadOperatorLifecycleLandingCardsServer(),
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
