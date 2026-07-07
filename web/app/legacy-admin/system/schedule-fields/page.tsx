import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — schedule field settings route to Platform Configuration → Fields. */
export default function AdminSystemScheduleFieldsRedirectPage() {
    redirect("/settings/fields");
}
