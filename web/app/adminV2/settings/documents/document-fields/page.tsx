import DocumentFieldsClient from "@/app/admin/system/document-fields/DocumentFieldsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsDocumentFieldDefinitionsPage() {
  return (
    <div className="w-full max-w-6xl">
      <DocumentFieldsClient adminV2Chrome />
    </div>
  );
}

