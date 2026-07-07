import { redirect } from "next/navigation";

/**
 * Layout configuration moved to Platform Configuration → Surfaces.
 * This legacy route is kept only as a permanent redirect.
 */
export const dynamic = "force-dynamic";

export default function AdminSystemLayoutsRedirect() {
    redirect("/settings/surfaces");
}
