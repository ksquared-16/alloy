import StatusesClient from "@/app/admin/system/statuses/StatusesClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsStatusesPage() {
  return (
    <div className="w-full min-w-0">
      <StatusesClient basePath="/adminV2/settings/statuses" adminV2Chrome />
    </div>
  );
}

