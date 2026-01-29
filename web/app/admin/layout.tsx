import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
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

    return (
        <AdminLayout userEmail={user.email || "Unknown"}>
            {children}
        </AdminLayout>
    );
}

