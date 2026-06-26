import CommunicationsSetupClient from "@/app/adminV2/settings/communications/CommunicationsSetupClient";
import ConfigurationPatternPlaceholder from "@/components/adminV2/settings/configurationRuntime/ConfigurationPatternPlaceholder";

export const dynamic = "force-dynamic";

export default function CommunicationsSetupSettingsPage() {
    return (
        <div className="w-full min-w-0 space-y-3">
            <header>
                <h1 className="config-typo-page-title">Communications setup</h1>
                <p className="config-typo-sublabel mt-1 max-w-2xl">
                    Org-scoped email and SMS provider bindings.
                </p>
            </header>
            <ConfigurationPatternPlaceholder surface="communications" />
            <CommunicationsSetupClient />
        </div>
    );
}
