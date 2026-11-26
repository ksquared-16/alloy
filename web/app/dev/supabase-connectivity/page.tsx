import { notFound } from "next/navigation";

import SupabaseConnectivityPanel from "./SupabaseConnectivityPanel";

/**
 * Supabase connectivity diagnostics — dev-only, and deliberately not on the login page.
 *
 * These facts are genuinely useful: a dev server can serve a client bundle compiled against an
 * older environment, and then the server renders one project while the browser signs in against
 * another. That cost two investigations. But they belong to whoever is debugging the environment,
 * not to every operator who came to sign in, and the old placement did active harm — it printed an
 * internal loopback address under the words "Password sign-in expects", which a remote operator
 * reasonably read as an instruction.
 */
export const dynamic = "force-dynamic";

export default function SupabaseConnectivityPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <SupabaseConnectivityPanel />;
}
