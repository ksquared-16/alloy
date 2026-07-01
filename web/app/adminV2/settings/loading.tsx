import { SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";

/**
 * Chrome-stable streaming fallback for every `/settings` route.
 *
 * Next.js applies this segment `loading.tsx` to the settings index **and** to
 * every subpage that lacks its own. Settings subpages do not share one structure
 * (hero header, tab bar, compact forms, and full-bleed config surfaces all
 * coexist), so this fallback intentionally renders **no page-specific structure**
 * — only a neutral, calm reserve at stable page width/padding.
 *
 * It previously painted the index hub's 6-tile grid here, which morphed every
 * subpage on entry (tile grid → real page structure), violating the locked
 * runtime doctrine ("Do not add skeletons that morph page structure" —
 * `docs/system/adminv2-runtime-performance-doctrine.md`). Keeping the reserve
 * structure-neutral makes the transition into any settings page an additive
 * content fill instead of a layout rearrangement.
 */
export default function AdminV2SettingsLoading() {
    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-testid="settings-route-loading" aria-busy="true">
            <div className="h-6 w-44 animate-pulse rounded-md bg-alloy-forge/10" />
            <div className="mt-6 space-y-3">
                <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-alloy-forge/8" />
                <div className="h-4 w-5/6 max-w-2xl animate-pulse rounded bg-alloy-forge/8" />
                <div className="h-4 w-2/3 max-w-2xl animate-pulse rounded bg-alloy-forge/8" />
            </div>
        </div>
    );
}
