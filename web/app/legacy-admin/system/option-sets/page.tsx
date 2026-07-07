import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — option sets live under Platform Configuration. */
export default function AdminSystemOptionSetsRedirectPage() {
    redirect("/settings/option-sets");
}
