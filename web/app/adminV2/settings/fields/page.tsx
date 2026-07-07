import DataModelWorkspaceClient from "./DataModelWorkspaceClient";
import { FIELDS_HUB_REGISTRY_TRUST_NOTE } from "@/lib/fields/fieldSettingsOperatorUi";
import { SETTINGS_PAGE_SHELL_COMPACT_CLASS } from "@/lib/adminV2/settingsPageLayout";

export const dynamic = "force-dynamic";

const DATA_MODEL_SUBTITLE =
    "Understand and configure Alloy’s data model — entities, relationships, fields, computed signals, and where data can be used.";

export default async function AdminV2SettingsFieldsPage({
    searchParams,
}: {
    searchParams: Promise<{ entity?: string; tab?: string }>;
}) {
    const sp = await searchParams;
    const entity = typeof sp.entity === "string" ? sp.entity : undefined;
    const tab = typeof sp.tab === "string" ? sp.tab : undefined;
    return (
        <div className={SETTINGS_PAGE_SHELL_COMPACT_CLASS} data-testid="data-model-workspace-page">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold text-alloy-midnight">Data Model</h1>
                <p className="max-w-3xl text-sm leading-relaxed text-alloy-midnight/60">{DATA_MODEL_SUBTITLE}</p>
            </header>
            <p
                className="rounded-lg border border-alloy-forge/10 bg-alloy-pine/[0.04] px-3 py-2 text-xs leading-relaxed text-alloy-midnight/65"
                data-testid="data-model-registry-trust-note"
            >
                {FIELDS_HUB_REGISTRY_TRUST_NOTE}
            </p>
            <DataModelWorkspaceClient initialEntity={entity} initialTab={tab} />
        </div>
    );
}
