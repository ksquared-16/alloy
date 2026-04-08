import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import {
  loadEntityLabelsMapForUser,
  getAdminOrgIdForUser,
  type EntityLabelsBootstrapMap,
} from "@/lib/admin/entityLabelsServer";
import AdminV2WorkspaceClientProviders from "./AdminV2WorkspaceClientProviders";

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

  let initialEntityLabels: EntityLabelsBootstrapMap = {};
  try {
    initialEntityLabels = await loadEntityLabelsMapForUser(auth.user.id);
  } catch (e) {
    console.error("[adminV2/workspace/layout] loadEntityLabelsMapForUser failed:", e);
  }

  const orgId = await getAdminOrgIdForUser(auth.user.id);
  if (!orgId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-admin-page p-6 text-alloy-midnight">
        Loading context...
      </div>
    );
  }

  return (
    <AdminV2WorkspaceClientProviders
      userEmail={typeof auth.user.email === "string" && auth.user.email ? auth.user.email : "Unknown"}
      role={auth.role}
      initialEntityLabels={initialEntityLabels}
    >
      {children}
    </AdminV2WorkspaceClientProviders>
  );
}
