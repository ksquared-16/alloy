import DataModelWorkspaceClient from "./DataModelWorkspaceClient";
import { SETTINGS_PAGE_SHELL_COMPACT_CLASS } from "@/lib/adminV2/settingsPageLayout";

export const dynamic = "force-dynamic";

const DATA_MODEL_SUBTITLE = "Entities, relationships, fields, and where data is used across Alloy.";

export default async function AdminV2SettingsFieldsPage({
    searchParams,
}: {
    searchParams: Promise<{ entity?: string; tab?: string }>;
}) {
    const sp = await searchParams;
    const entity = typeof sp.entity === "string" ? sp.entity : undefined;
    const tab = typeof sp.tab === "string" ? sp.tab : undefined;
    return (
        <div className={`${SETTINGS_PAGE_SHELL_COMPACT_CLASS} space-y-2`} data-testid="data-model-workspace-page">
            <header className="process-config-context-bar space-y-0" data-testid="data-model-page-header">
                <p className="config-platform-hub-eyebrow text-[10px]">Platform Configuration</p>
                <h1 className="config-typo-page-title process-config-context-title text-xl leading-tight">
                    Data Model
                </h1>
                <p className="config-typo-sublabel process-config-context-summary max-w-2xl text-[11px] leading-snug text-alloy-midnight/50">
                    {DATA_MODEL_SUBTITLE}
                </p>
            </header>
            <DataModelWorkspaceClient initialEntity={entity} initialTab={tab} />
        </div>
    );
}
