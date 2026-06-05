import { redirect } from "next/navigation";

/** Layout builder moved to /adminV2/settings/layouts. Permanent redirect. */
export const dynamic = "force-dynamic";

export default function AdminV2LayoutsRedirect() {
    redirect("/adminV2/settings/layouts");
}
