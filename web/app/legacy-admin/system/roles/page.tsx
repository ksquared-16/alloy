import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — roles live under Platform Configuration → Users & Roles. */
export default function AdminSystemRolesRedirectPage() {
    redirect("/settings/users-roles");
}
