import { redirect } from "next/navigation";

/** Prefer `/admin/v2` (rewrites to workspace); keep direct `/adminV2` usable for bookmarks. */
export default function AdminV2Page() {
  redirect("/admin/v2/workspace");
}
