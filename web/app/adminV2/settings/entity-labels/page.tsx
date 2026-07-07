import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy alias — canonical Entities settings live at /settings/entities. */
export default function AdminV2SettingsEntityLabelsRedirectPage() {
    redirect("/settings/entities");
}
