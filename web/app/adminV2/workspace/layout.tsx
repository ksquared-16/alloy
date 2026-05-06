import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { buildAccessScopeCacheFingerprint, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import AdminV2WorkspaceClientProviders from "./AdminV2WorkspaceClientProviders";
import type { AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";
import { loadAdminViewerTimezoneBootstrap } from "@/lib/admin/viewerTimezoneBootstrap";
import { loadOperationalOrgTimezoneIana } from "@/lib/admin/loadOperationalOrgTimezoneServer";

export const dynamic = "force-dynamic";

export default async function AdminV2WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAdminAuth();

  if (!auth?.user?.id || !auth.role) {
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

  let orgName: string | null = null;
  try {
    const supabase = createAdminClient();
    const { data: orgRow } = await supabase.from("orgs").select("name").eq("id", orgId).maybeSingle();
    const n = orgRow && typeof (orgRow as { name?: unknown }).name === "string" ? (orgRow as { name: string }).name.trim() : "";
    orgName = n || null;
  } catch (e) {
    console.error("[adminV2/workspace/layout] org name load failed:", e);
  }

  let viewerTimezone: AdminViewerTimezoneValue = { iana: "UTC", source: "utc_fallback" };
  try {
    viewerTimezone = await loadAdminViewerTimezoneBootstrap(auth.user.id);
  } catch (e) {
    console.error("[adminV2/workspace/layout] viewer timezone bootstrap failed:", e);
  }

  let operationalTimezoneIana = "UTC";
  try {
    operationalTimezoneIana = await loadOperationalOrgTimezoneIana(orgId);
  } catch (e) {
    console.error("[adminV2/workspace/layout] operational org timezone failed:", e);
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[adminV2/workspace] resolved_timezones", {
      viewer: viewerTimezone,
      operational_org_iana: operationalTimezoneIana,
      org_id: orgId,
    });
  }

  const access = await getAdminAccessContextCached();
  if (!access.ok) {
    redirect("/unauthorized");
  }
  const accessScopeFingerprint = buildAccessScopeCacheFingerprint(scopeDimensionsFromAccess(access));

  return (
    <AdminV2WorkspaceClientProviders
      userEmail={typeof auth.user.email === "string" && auth.user.email ? auth.user.email : "Unknown"}
      principalUserId={auth.user.id}
      role={auth.role}
      roleKeys={auth.roleKeys ?? []}
      orgName={orgName}
      orgId={orgId}
      accessScopeFingerprint={accessScopeFingerprint}
      initialViewerTimezone={viewerTimezone}
      initialOperationalTimezoneIana={operationalTimezoneIana}
    >
      {children}
    </AdminV2WorkspaceClientProviders>
  );
}
