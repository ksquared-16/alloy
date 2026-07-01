import { Suspense } from "react";
import { getAdminAuth } from "@/lib/adminAuth";
import { getAdminOrgIdForUser } from "@/lib/admin/entityLabelsServer";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchEffectiveUserDisplayTimezone } from "@/lib/admin/timezoneContract";
import type { AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";
import ViewerTimezoneClientProvider from "./ViewerTimezoneClientProvider";

export const dynamic = "force-dynamic";

export default async function AdminV2WorkflowsLayout({ children }: { children: React.ReactNode }) {
    let viewerTimezone: AdminViewerTimezoneValue = { iana: "UTC", source: "utc_fallback" };
    try {
        const auth = await getAdminAuth();
        const uid = auth?.user?.id;
        if (uid) {
            const orgId = await getAdminOrgIdForUser(uid);
            if (orgId) {
                const supabase = createAdminClient();
                viewerTimezone = await fetchEffectiveUserDisplayTimezone(supabase, { userId: uid, orgId });
            }
        }
    } catch {
        /* keep UTC fallback */
    }

    return (
        <ViewerTimezoneClientProvider value={viewerTimezone}>
            <Suspense fallback={<div className="p-4 text-sm text-alloy-midnight/70">Loading…</div>}>{children}</Suspense>
        </ViewerTimezoneClientProvider>
    );
}
