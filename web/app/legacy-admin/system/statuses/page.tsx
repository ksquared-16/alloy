import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — status vocabulary lives under Platform Configuration → Statuses. */
export default function AdminSystemStatusesRedirectPage() {
    redirect("/settings/statuses");
}
