import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — lead field settings live under Platform Configuration → Fields. */
export default function AdminSystemJobFieldsRedirectPage() {
    redirect("/settings/fields?entity=opportunity");
}
