import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — pipelines and stages live under Platform Configuration → Processes. */
export default function AdminSystemPipelinesRedirectPage() {
    redirect("/settings/processes");
}
