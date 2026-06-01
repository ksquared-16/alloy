import StatusesClient from "@/app/admin/system/statuses/StatusesClient";
import LifecycleSettingsCrossLinkBanner from "@/components/adminV2/settings/LifecycleSettingsCrossLinkBanner";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsStatusesPage() {
  return (
    <div className="w-full min-w-0 space-y-3">
      <LifecycleSettingsCrossLinkBanner variant="statuses" />
      <StatusesClient basePath="/adminV2/settings/statuses" adminV2Chrome />
    </div>
  );
}

