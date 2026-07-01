import { redirect } from "next/navigation";

/** Legacy path — operational UI lives under canonical `/admin/forms`. */
export default function AdminFormsRedirectPage() {
  redirect("/admin/forms");
}
