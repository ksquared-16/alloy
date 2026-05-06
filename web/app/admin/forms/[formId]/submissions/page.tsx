import { redirect } from "next/navigation";

/** Legacy path — operational UI lives under `/adminV2/forms/[formId]/submissions`. */
export default async function AdminFormSubmissionsRedirectPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = await params;
  redirect(`/adminV2/forms/${formId}/submissions`);
}
