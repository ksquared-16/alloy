import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import { loadEntityLabelsMapForUser } from "@/lib/admin/entityLabelsServer";
import AdminLayout from "@/components/admin/AdminLayout";

export default async function AdminLayoutWrapper({
    children,
}: {
    children: React.ReactNode;
}) {
    const auth = await getAdminAuth();

    if (!auth) {
        redirect("/unauthorized");
    }

    const initialEntityLabels = await loadEntityLabelsMapForUser(auth.user.id);

    return (
        <AdminLayout
            userEmail={auth.user.email || "Unknown"}
            role={auth.role}
            initialEntityLabels={initialEntityLabels}
        >
            {children}
        </AdminLayout>
    );
}

