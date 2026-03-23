import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default function AdminUsersPage() {
  redirect("/admin/system/access-control");
}
