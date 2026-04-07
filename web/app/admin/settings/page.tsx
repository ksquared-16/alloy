import { redirect } from "next/navigation";

/** Legacy URL: pipelines live under System → Data model. */
export default function AdminLegacySettingsRedirectPage() {
    redirect("/admin/system/pipelines");
}
