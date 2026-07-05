import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Consolidated: one Commercial home at /settings/commercial (Tuition is a tab there).
export default function SettingsCommercialTuitionPage() {
    redirect("/settings/commercial");
}
