import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export default async function CommercialLayout({ children }: { children: React.ReactNode }) {
    const auth = await getAdminAuth();
    if (!auth?.user?.id || !auth.role) {
        redirect("/unauthorized");
    }
    return <>{children}</>;
}
