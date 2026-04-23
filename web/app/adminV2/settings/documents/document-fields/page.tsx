import DocumentFieldsClient from "@/app/admin/system/document-fields/DocumentFieldsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsDocumentFieldDefinitionsPage() {
  return (
    <div className="w-full" style={{ padding: "20px 20px 32px" }}>
      <div className="max-w-6xl">
        <DocumentFieldsClient />
      </div>
    </div>
  );
}

