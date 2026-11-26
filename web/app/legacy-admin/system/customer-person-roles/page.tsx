import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — family role vocabulary lives under Platform Configuration → Relationships. */
export default function AdminSystemCustomerPersonRolesRedirectPage() {
    redirect("/settings/relationships?tab=family-roles");
}
