import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Consolidated: Commercial has one operator home — the tabbed workspace at
// /settings/commercial (Programs & tuition is its first tab).
export default function SettingsCommercialProgramsPage() {
    redirect("/settings/commercial");
}
