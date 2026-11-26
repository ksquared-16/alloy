import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — location field settings live under Platform Configuration → Fields. */
export default function AdminSystemLocationFieldsRedirectPage() {
    redirect("/settings/fields?entity=location");
}
