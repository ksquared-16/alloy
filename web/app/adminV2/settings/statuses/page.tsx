import StatusesConfigurationPage from "@/components/adminV2/settings/statuses/StatusesConfigurationPage";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsStatusesPage() {
    return (
        <div className="statuses-config-surface process-config-page flex min-h-0 w-full min-w-0 flex-1 flex-col">
            <StatusesConfigurationPage />
        </div>
    );
}
