import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — access control lives under Platform Configuration → Users & Roles. */
export default function AdminSystemAccessControlRedirectPage() {
    redirect("/settings/users-roles");
}
