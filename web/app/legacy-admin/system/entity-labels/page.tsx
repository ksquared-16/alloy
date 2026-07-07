import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — entity labels live under Platform Configuration → Entities. */
export default function AdminSystemEntityLabelsRedirectPage() {
    redirect("/settings/entities");
}
