import { redirect } from "next/navigation";
import { dataModelSectionHref } from "@/lib/dataModel/dataModelChapterRoutes";

export const dynamic = "force-dynamic";

/** Compatibility: `/settings/option-sets` list → Data Model Option Sets category. */
export default function AdminV2SettingsOptionSetsPage() {
    redirect(dataModelSectionHref("option-sets"));
}
