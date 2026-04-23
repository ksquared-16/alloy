import OptionSetDetailClient from "@/app/admin/system/option-sets/OptionSetDetailClient";

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
    <div className="w-full max-w-6xl">
      <OptionSetDetailClient setKey={setKey} basePath="/adminV2/settings/option-sets" />
    </div>
  );
}

