import { redirect } from "next/navigation";
import { dataModelSectionHref } from "@/lib/dataModel/dataModelChapterRoutes";

export const dynamic = "force-dynamic";

/** Compatibility: `/settings/relationships` → Data Model Relationships category. */
export default function AdminV2SettingsRelationshipsPage() {
    redirect(dataModelSectionHref("relationships"));
}
