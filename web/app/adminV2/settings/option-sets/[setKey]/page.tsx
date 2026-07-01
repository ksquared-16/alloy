import OptionSetDetailClient from "@/app/legacy-admin/system/option-sets/OptionSetDetailClient";

export const dynamic = "force-dynamic";

function decodeSetKey(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function AdminV2SettingsOptionSetDetailPage({
  params,
}: {
  params: Promise<{ setKey: string }>;
}) {
  const { setKey: raw } = await params;
  const setKey = decodeSetKey(raw ?? "");
  return (
    <div className="w-full min-w-0">
      <OptionSetDetailClient setKey={setKey} basePath="/settings/option-sets" adminV2Chrome />
    </div>
  );
}

