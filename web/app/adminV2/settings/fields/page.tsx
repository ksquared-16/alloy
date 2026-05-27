import SettingsFieldsHubClient from "./SettingsFieldsHubClient";
import { SETTINGS_PAGE_INTRO_CLASS, SETTINGS_PAGE_SHELL_COMPACT_CLASS } from "@/lib/adminV2/settingsPageLayout";
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
        <div className={SETTINGS_PAGE_SHELL_COMPACT_CLASS}>
            <header className="space-y-0.5">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Fields</h1>
                <p className={SETTINGS_PAGE_INTRO_CLASS}>{SETTINGS_FIELDS_SUBTITLE}</p>
            </header>
            <SettingsFieldsHubClient initialEntity={entity} />
        </div>
    );
}
