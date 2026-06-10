import { redirect } from "next/navigation";

/** Prefer canonical `/admin`; `/adminV2` redirects at the edge. */
export default function AdminV2Page() {
  redirect("/admin/workspace");
}
