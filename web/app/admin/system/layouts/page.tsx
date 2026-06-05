import { redirect } from "next/navigation";

/**
 * Layout configuration moved to AdminV2 Settings at `/adminV2/settings/layouts`.
 * This legacy route is kept only as a permanent redirect.
 */
export const dynamic = "force-dynamic";

export default function AdminSystemLayoutsRedirect() {
    redirect("/adminV2/settings/layouts");
}
