import PayoutsClient from "./PayoutsClient";
import SettingsDiagnosticSurfaceBanner from "@/components/adminV2/settings/configurationRuntime/SettingsDiagnosticSurfaceBanner";

export const dynamic = "force-dynamic";

/** Diagnostic commercial defaults — no primary Platform Configuration equivalent yet. */
export default function AdminSystemPayoutsPage() {
    return (
        <div className="space-y-4" data-testid="legacy-payouts-page">
            <SettingsDiagnosticSurfaceBanner
                note="Legacy vendor payout policy defaults. Financial/commercial configuration is moving under Platform Configuration → Commercial and Financials."
                destinationHref="/settings/commercial"
                destinationLabel="Commercial"
            />
            <PayoutsClient />
        </div>
    );
}
