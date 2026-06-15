import { SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";

/** Preserves settings shell dimensions while section RSC loads. */
export default function AdminV2SettingsLoading() {
    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-testid="settings-route-loading" aria-busy="true">
            <div className="h-7 w-40 animate-pulse rounded-md bg-alloy-forge/10" />
            <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-alloy-forge/8" />
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div
                        key={i}
                        className="min-h-[4.75rem] animate-pulse rounded-lg border border-alloy-forge/10 bg-white/50"
                    />
                ))}
            </div>
        </div>
    );
}
