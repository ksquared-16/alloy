import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy route — document field settings live under Platform Configuration. */
export default function AdminSystemDocumentFieldsRedirectPage() {
    redirect("/settings/documents/document-fields");
}
