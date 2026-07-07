import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — departments live under Platform Configuration. */
export default function AdminSystemDepartmentsRedirectPage() {
    redirect("/settings/departments");
}
