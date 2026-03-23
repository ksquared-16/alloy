import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default function AdminSystemRolesPage() {
    redirect("/admin/system/access-control");
}
