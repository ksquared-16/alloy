import StatusesClient from "@/app/legacy-admin/system/statuses/StatusesClient";
import LifecycleSettingsCrossLinkBanner from "@/components/adminV2/settings/LifecycleSettingsCrossLinkBanner";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsStatusesPage() {
  return (
    <div className="statuses-config-surface w-full min-w-0 space-y-3">
      <LifecycleSettingsCrossLinkBanner variant="statuses" />
      <StatusesClient basePath="/admin/settings/statuses" adminV2Chrome />
    </div>
  );
}

