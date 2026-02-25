import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import AdminLayout from "@/components/admin/AdminLayout";

export default async function AdminLayoutWrapper({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    const ctx = await getAdminContext();
    if (!ctx.ok) {
        redirect(ctx.status === 401 ? "/login" : "/unauthorized");
    }

    return (
        <AdminLayout userEmail={user.email || "Unknown"} role={ctx.role}>
            {children}
        </AdminLayout>
    );
}

