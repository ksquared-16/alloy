import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — family field settings live under Platform Configuration → Fields. */
export default function AdminSystemCustomerFieldsRedirectPage() {
    redirect("/settings/fields?entity=customer");
}
