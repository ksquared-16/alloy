import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import {
    loadEntityLabelsMapForUser,
    getAdminOrgIdForUser,
    type EntityLabelsBootstrapMap,
} from "@/lib/admin/entityLabelsServer";
import AdminLayout from "@/components/admin/AdminLayout";
import type { AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";
import { loadAdminViewerTimezoneBootstrap } from "@/lib/admin/viewerTimezoneBootstrap";
import { loadOperationalOrgTimezoneIana } from "@/lib/admin/loadOperationalOrgTimezoneServer";

export const dynamic = 'force-dynamic';

export default async function AdminLayoutWrapper({
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
        console.error("[admin/layout] loadEntityLabelsMapForUser failed:", e);
    }

    const orgId = await getAdminOrgIdForUser(auth.user.id);
    if (!orgId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-admin-page p-6 text-alloy-midnight">
                Loading context...
            </div>
        );
    }

    let viewerTimezone: AdminViewerTimezoneValue = { iana: "UTC", source: "utc_fallback" };
    try {
        viewerTimezone = await loadAdminViewerTimezoneBootstrap(auth.user.id);
    } catch (e) {
        console.error("[admin/layout] viewer timezone bootstrap failed:", e);
    }

    let operationalTimezoneIana = "UTC";
    try {
        operationalTimezoneIana = await loadOperationalOrgTimezoneIana(orgId);
    } catch (e) {
        console.error("[admin/layout] operational org timezone failed:", e);
    }

    return (
        <AdminLayout
            userEmail={typeof auth.user.email === "string" && auth.user.email ? auth.user.email : "Unknown"}
            role={auth.role}
            roleKeys={auth.roleKeys}
            initialEntityLabels={initialEntityLabels}
            initialViewerTimezone={viewerTimezone}
            initialOperationalTimezoneIana={operationalTimezoneIana}
        >
            {children}
        </AdminLayout>
    );
}
