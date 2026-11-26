import { redirect } from "next/navigation";
import { dataModelSectionHref } from "@/lib/dataModel/dataModelChapterRoutes";

export const dynamic = "force-dynamic";

/** Compatibility: `/settings/statuses` → Data Model Statuses category. */
export default function AdminV2SettingsStatusesPage() {
    redirect(dataModelSectionHref("statuses"));
}
