import SettingsClient from "@/app/legacy-admin/settings/SettingsClient";

export const dynamic = "force-dynamic";

/** Pipelines & stages (moved from legacy /admin/settings for IA clarity). */
export default function AdminSystemPipelinesPage() {
    return <SettingsClient />;
}
