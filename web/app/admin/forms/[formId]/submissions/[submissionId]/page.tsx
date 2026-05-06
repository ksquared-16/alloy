import { redirect } from "next/navigation";

/** Legacy path — operational UI lives under `/adminV2/forms/.../submissions/[submissionId]`. */
export default async function AdminFormSubmissionDetailRedirectPage({
  params,
}: {
  params: Promise<{ formId: string; submissionId: string }>;
}) {
  const { formId, submissionId } = await params;
  redirect(`/adminV2/forms/${formId}/submissions/${submissionId}`);
}
