import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default function AdminSystemRolesPage() {
    redirect("/legacy-admin/system/access-control");
}
