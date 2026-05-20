import SettingsFieldsHubClient from "./SettingsFieldsHubClient";
import { SETTINGS_FIELDS_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";

export const dynamic = "force-dynamic";

export default async function AdminV2SettingsFieldsPage({
    searchParams,
}: {
    searchParams: Promise<{ entity?: string }>;
}) {
    const sp = await searchParams;
    const entity = typeof sp.entity === "string" ? sp.entity : undefined;
    return (
        <div className="w-full max-w-6xl space-y-3 pb-2">
            <header className="space-y-0.5">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Fields</h1>
                <p className="max-w-2xl text-sm text-alloy-midnight/60">{SETTINGS_FIELDS_SUBTITLE}</p>
            </header>
            <SettingsFieldsHubClient initialEntity={entity} />
        </div>
    );
}
