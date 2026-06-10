import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default function AdminUsersPage() {
  redirect("/legacy-admin/system/access-control");
}
