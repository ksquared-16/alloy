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
import { composeWorkspaceRouteVm } from "@/lib/adminV2/runtime/surface/workspaceRouteVm";
import { AlloyOperationalBootShell } from "@/components/admin/workspace/AlloyOperationalBootShell";
import { headers } from "next/headers";
import { ALLOY_PATHNAME_HEADER, readForwardedAddress } from "@/lib/http/alloyPathnameHeader";
import { frameAddressFromPath, frameForAddress } from "@/lib/runtime/provisioning/serverFrameForAddress";
import { attentionFromUrl } from "@/lib/runtime/kernel/attention";
import type { InitialServerFrame } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { toRscPlainJson } from "@/lib/runtime/toRscPlainJson";

export const dynamic = "force-dynamic";

/**
 * THE FRAME, COMPOSED AT THE BOUNDARY THAT RENDERS IT.
 *
 * This layout mounts `SurfaceHostProvider`, which owns Focus Panel rendering. It is an ANCESTOR of
 * the work-unit page segment, so it could never see the answer that segment composed — and the
 * server emitted no Focus Panel markup at all. Middleware forwards the address; this reads it and
 * composes the same frame, through the same request-scoped composer the page uses, so the two share
 * ONE composition rather than each paying for their own.
 *
 * Returns null for every route that is not a work unit, and for any compose that did not resolve —
 * in which case the client behaves exactly as it did before.
 */
async function initialServerFrame(orgId: string | null, userId: string | null): Promise<InitialServerFrame> {
    if (!orgId || !userId) return null;
    try {
        const h = await headers();
        const addr = readForwardedAddress(h.get(ALLOY_PATHNAME_HEADER));
        if (!addr) return null;
        const target = frameAddressFromPath(addr.pathname, addr.searchParams);
        if (!target) return null;
        const { answer } = await frameForAddress(
            target.workUnitSlug, target.workViewId, target.subjectId, target.cohort, target.aspect,
        );
        if (!answer || answer.terminal === "error") return null;
        /*
         * The attention ref comes from the SAME reader the browser's cold load uses, over the same
         * address, so both passes produce the identical ref and therefore the identical surfaceId.
         * Deriving it any other way here is how a server frame and its hydration come to disagree
         * about which surface they are.
         */
        const hydration = attentionFromUrl(
            new URL(`${addr.pathname}?${addr.searchParams.toString()}`, "https://alloy.local"),
            { tenant: orgId, principal: userId },
            "direct_url",
        );
        if (!hydration) return null;
        return {
            hydration,
            snapshot: toRscPlainJson(answer),
            outcome: answer.terminal,
        } as InitialServerFrame;
    } catch {
        return null;
    }
}


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

async function loadViewerTimezoneSafe(userId: string, orgId: string): Promise<AdminViewerTimezoneValue> {
    try {
        // Pass the already-authoritative org id so viewer-tz resolution reuses it instead of re-running
        // the ~1s access-core resolution (`getAdminOrgIdForUser`) the layout already performed.
        return await loadAdminViewerTimezoneBootstrap(userId, orgId);
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
        // Rendered inside AdminV2Shell (the parent adminV2 layout) → content mode only, no duplicate
        // sidebar/top-nav chrome (Kelly A1).
        return <AlloyOperationalBootShell variant="workspace" chrome="content" />;
    }

    const [orgName, viewerTimezone, operationalTimezoneIana, access, initialEntityLabels] =
        await Promise.all([
            loadOrgDisplayName(orgId),
            loadViewerTimezoneSafe(auth.user.id, orgId),
            loadOperationalTimezoneSafe(orgId),
            getAdminAccessContextCached(),
            // Known org id (no redundant access-core resolve) + a hard timeout so a slow cold industry
            // lookup can never block the workspace/work-unit first composition — labels degrade to
            // last-known/default and warm in the background. (Trust Closure deployed-perf fix.)
            loadEntityLabelsMapForOrgId(orgId, { timeoutMs: 150 }).catch(
                (): EntityLabelsBootstrapMap => ({})
            ),
        ]);

    if (!access.ok) {
        redirect("/unauthorized");
    }
    const accessScopeFingerprint = buildAccessScopeCacheFingerprint(scopeDimensionsFromAccess(access));

    // Canonical server-composed workspace Route VM **context** (org identity), shared by every
    // workspace route. The landing-only `firstPaint.lifecycleCards` is NOT loaded here — the landing
    // route loads its own seed and merges it in (`WorkspaceLandingRouteVmBridge`), so work-unit routes
    // never pay for a landing-only seed. Work-unit routes read no part of this VM.
    const workspaceRouteVm = composeWorkspaceRouteVm({
        context: { orgId, orgName, accessScopeFingerprint },
        lifecycleCards: [],
    });

    /*
     * Composed here rather than in the page segment, because this is the boundary that renders the
     * surface. It shares one request-scoped composition with the page, so the answer is produced
     * exactly once for this request.
     */
    const initialFrame = await initialServerFrame(orgId, auth.user.id);

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
            initialFrame={initialFrame}
        >
            {children}
        </AdminV2WorkspaceClientProviders>
    );
}
