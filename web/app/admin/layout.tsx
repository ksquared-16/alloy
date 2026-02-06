import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
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

    return (
        <AdminLayout userEmail={auth.user.email || "Unknown"} role={auth.role}>
            {children}
        </AdminLayout>
    );
}

