import { redirect } from "next/navigation";

/** Legacy path — operational UI lives under `/adminV2/forms`. */
export default function AdminFormsRedirectPage() {
  redirect("/adminV2/forms");
}
