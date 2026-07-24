import { redirect } from "next/navigation";
import { dataModelSectionHref } from "@/lib/dataModel/dataModelChapterRoutes";

export const dynamic = "force-dynamic";

/** Compatibility: `/settings/calculations` → Data Model Operational Calculations category. */
export default function AdminV2SettingsCalculationsPage() {
    redirect(dataModelSectionHref("calculations"));
}
