import { Suspense } from "react";
import AnalyticsSettingsClient from "@/app/adminV2/settings/analytics/AnalyticsSettingsClient";

/** Operational Calculations — the canonical route (formerly /settings/analytics). */
export default function AdminV2SettingsCalculationsPage() {
    return (
        <Suspense fallback={<p className="text-sm text-alloy-midnight/55">Loading Operational Calculations…</p>}>
            <AnalyticsSettingsClient />
        </Suspense>
    );
}
