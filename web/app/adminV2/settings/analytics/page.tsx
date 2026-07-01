import { Suspense } from "react";
import AnalyticsSettingsClient from "@/app/adminV2/settings/analytics/AnalyticsSettingsClient";

export default function AdminV2SettingsAnalyticsPage() {
    return (
        <Suspense fallback={<p className="text-sm text-alloy-midnight/55">Loading analytics configuration…</p>}>
            <AnalyticsSettingsClient />
        </Suspense>
    );
}
