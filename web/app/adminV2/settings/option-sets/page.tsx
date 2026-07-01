import OptionSetsClient from "@/app/legacy-admin/system/option-sets/OptionSetsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsOptionSetsPage() {
  return (
    <div className="w-full min-w-0">
      <OptionSetsClient basePath="/admin/settings/option-sets" adminV2Chrome />
    </div>
  );
}

