import OptionSetsClient from "@/app/admin/system/option-sets/OptionSetsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsOptionSetsPage() {
  return (
    <div className="w-full max-w-6xl">
      <OptionSetsClient basePath="/adminV2/settings/option-sets" />
    </div>
  );
}

