import { redirect } from "next/navigation";

/** Legacy route — workspace metric placement lives under Operational Calculations. */
export default function AdminV2SettingsKpisRedirectPage() {
    redirect("/settings/calculations?tab=visibility");
}
