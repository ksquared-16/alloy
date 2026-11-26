import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — work units live under Platform Configuration (diagnostic). */
export default function AdminSystemWorkUnitsRedirectPage() {
    redirect("/settings/work-units");
}
