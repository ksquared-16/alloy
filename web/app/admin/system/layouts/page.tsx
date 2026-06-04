import { redirect } from "next/navigation";

/**
 * Layout configuration moved to AdminV2 at `/adminV2/layouts`.
 * This legacy route is kept only as a permanent redirect.
 */
export const dynamic = "force-dynamic";

export default function AdminSystemLayoutsRedirect() {
    redirect("/adminV2/layouts");
}
