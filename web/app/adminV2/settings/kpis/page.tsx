import { redirect } from "next/navigation";

/** Legacy route — workspace metric placement lives under Operational Intelligence. */
export default function AdminV2SettingsKpisRedirectPage() {
    redirect("/settings/analytics?tab=visibility");
}
