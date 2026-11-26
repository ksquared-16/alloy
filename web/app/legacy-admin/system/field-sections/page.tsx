import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — field sections live under Platform Configuration. */
export default function AdminSystemFieldSectionsRedirectPage() {
    redirect("/settings/field-sections");
}
