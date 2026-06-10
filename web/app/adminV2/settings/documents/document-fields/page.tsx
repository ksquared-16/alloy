import DocumentFieldsClient from "@/app/legacy-admin/system/document-fields/DocumentFieldsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsDocumentFieldDefinitionsPage() {
  return (
    <div className="w-full min-w-0">
      <DocumentFieldsClient adminV2Chrome />
    </div>
  );
}

