import { redirect } from "next/navigation";
import { LAYOUTS_SETTINGS_HREF } from "@/lib/admin/canonicalAdminRoutes";

/** Layout builder moved to Settings → Layouts. Permanent redirect. */
export const dynamic = "force-dynamic";

export default function AdminV2LayoutsRedirect() {
    redirect(LAYOUTS_SETTINGS_HREF);
}
