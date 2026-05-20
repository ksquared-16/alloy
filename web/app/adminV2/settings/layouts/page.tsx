import LayoutsSettingsHubClient from "./LayoutsSettingsHubClient";
import { SETTINGS_LAYOUTS_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ entity?: string }> };

export default async function AdminV2SettingsLayoutsPage({ searchParams }: PageProps) {
    const sp = searchParams ? await searchParams : {};
    return (
        <div className="w-full max-w-6xl space-y-3 pb-2">
            <header className="space-y-0.5">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Record layouts</h1>
                <p className="max-w-2xl text-sm text-alloy-midnight/60">{SETTINGS_LAYOUTS_SUBTITLE}</p>
            </header>
            <LayoutsSettingsHubClient initialEntity={sp.entity} />
        </div>
    );
}
