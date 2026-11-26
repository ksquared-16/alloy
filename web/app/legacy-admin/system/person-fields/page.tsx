import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — person field settings live under Platform Configuration → Fields. */
export default function AdminSystemPersonFieldsRedirectPage() {
    redirect("/settings/fields?entity=person");
}
