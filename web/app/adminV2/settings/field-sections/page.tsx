import FieldSectionsClient from "@/app/admin/system/field-sections/FieldSectionsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsFieldSectionsPage() {
  return (
    <div className="w-full max-w-6xl">
      <FieldSectionsClient adminV2Chrome />
    </div>
  );
}

