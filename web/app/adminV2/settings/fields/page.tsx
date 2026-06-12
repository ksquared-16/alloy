import SettingsFieldsHubClient from "./SettingsFieldsHubClient";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { SETTINGS_PAGE_SHELL_COMPACT_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { SETTINGS_FIELDS_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";
import { FIELDS_HUB_REGISTRY_TRUST_NOTE } from "@/lib/fields/fieldSettingsOperatorUi";

export const dynamic = "force-dynamic";

export default async function AdminV2SettingsFieldsPage({
    searchParams,
}: {
    searchParams: Promise<{ entity?: string }>;
}) {
    const sp = await searchParams;
    const entity = typeof sp.entity === "string" ? sp.entity : undefined;
    return (
        <div className={SETTINGS_PAGE_SHELL_COMPACT_CLASS} data-testid="settings-fields-page">
            <SettingsPageHeader variant="hero" title="Fields" subtitle={SETTINGS_FIELDS_SUBTITLE} />
            <p
                className="-mt-2 rounded-lg border border-alloy-forge/10 bg-alloy-pine/[0.04] px-3 py-2 text-xs leading-relaxed text-alloy-midnight/65"
                data-testid="fields-hub-registry-trust-note"
            >
                {FIELDS_HUB_REGISTRY_TRUST_NOTE}
            </p>
            <SettingsFieldsHubClient initialEntity={entity} />
        </div>
    );
}
