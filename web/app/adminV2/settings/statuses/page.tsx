import StatusesClient from "@/app/admin/system/statuses/StatusesClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsStatusesPage() {
  return (
    <div className="w-full" style={{ padding: "20px 20px 32px" }}>
      <div className="max-w-6xl">
        <StatusesClient basePath="/adminV2/settings/statuses" />
      </div>
    </div>
  );
}

