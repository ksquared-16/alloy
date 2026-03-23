import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import {
    loadEntityLabelsMapForUser,
    getAdminOrgIdForUser,
    type EntityLabelsBootstrapMap,
} from "@/lib/admin/entityLabelsServer";
import AdminLayout from "@/components/admin/AdminLayout";

export const dynamic = 'force-dynamic';

export default async function AdminLayoutWrapper({
    children,
}: {
    children: React.ReactNode;
}) {
    const auth = await getAdminAuth();

    console.log("[admin/layout DEBUG] getAdminAuth result", {
        hasAuth: Boolean(auth),
        authUserId: auth?.user?.id ?? null,
        authRole: auth?.role ?? null,
    });

    if (!auth?.user?.id || !auth.role) {
        console.warn("[admin/layout DEBUG] branch: redirect → /unauthorized (missing user or role)", {
            hasUserId: Boolean(auth?.user?.id),
            role: auth?.role ?? null,
        });
        redirect("/unauthorized");
    }

    let initialEntityLabels: EntityLabelsBootstrapMap = {};
    let labelsServerLoadOk = true;
    try {
        initialEntityLabels = await loadEntityLabelsMapForUser(auth.user.id);
        labelsServerLoadOk = true;
    } catch (e) {
        labelsServerLoadOk = false;
        console.error("[admin/layout DEBUG] loadEntityLabelsMapForUser threw", e);
        console.error("[admin/layout] loadEntityLabelsMapForUser failed:", e);
    }

    const initialLabelKeyCount = Object.keys(initialEntityLabels).length;
    console.log("[admin/layout DEBUG] loadEntityLabelsMapForUser finished", {
        ok: labelsServerLoadOk,
        initialLabelKeyCount,
    });

    const orgId = await getAdminOrgIdForUser(auth.user.id);
    console.log("[admin/layout DEBUG] getAdminOrgIdForUser", { orgId: orgId ?? null });

    if (!orgId) {
        console.warn("[admin/layout DEBUG] branch: server render 'Loading context…' (no orgId)");
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-admin-page p-6 text-alloy-midnight">
                <div
                    className="max-w-xl rounded border border-rose-500/70 bg-rose-950/90 px-3 py-2 font-mono text-[10px] text-rose-100"
                    data-debug="admin-layout-no-org"
                >
                    <div className="font-semibold text-rose-300">[admin/layout DEBUG] no orgId</div>
                    <div>authUserId: {auth.user.id}</div>
                    <div>authRole: {auth.role}</div>
                    <div>labelsServerLoadOk: {String(labelsServerLoadOk)} · initialLabelKeys: {initialLabelKeyCount}</div>
                </div>
                <div>Loading context...</div>
            </div>
        );
    }

    console.log("[admin/layout DEBUG] branch: render AdminLayout + children", {
        authUserId: auth.user.id,
        authRole: auth.role,
        orgId,
        initialLabelKeyCount,
        labelsServerLoadOk,
    });

    return (
        <AdminLayout
            userEmail={typeof auth.user.email === "string" && auth.user.email ? auth.user.email : "Unknown"}
            role={auth.role}
            initialEntityLabels={initialEntityLabels}
            adminDebugBootstrap={{
                authUserId: auth.user.id,
                authRole: auth.role,
                orgId,
                initialLabelKeyCount,
                labelsServerLoadOk,
            }}
        >
            {children}
        </AdminLayout>
    );
}

