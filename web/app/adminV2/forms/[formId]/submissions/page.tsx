import FormSubmissionsClient from "@/app/admin/forms/[formId]/submissions/FormSubmissionsClient";

export const dynamic = "force-dynamic";

export default function AdminV2FormSubmissionsPage() {
  return <FormSubmissionsClient />;
}
