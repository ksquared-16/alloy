import FieldSectionsClient from "@/app/admin/system/field-sections/FieldSectionsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsFieldSectionsPage() {
  return (
    <div className="w-full" style={{ padding: "20px 20px 32px" }}>
      <div className="max-w-6xl">
        <FieldSectionsClient />
      </div>
    </div>
  );
}

