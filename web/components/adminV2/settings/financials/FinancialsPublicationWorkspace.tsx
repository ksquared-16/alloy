"use client";

import { Banknote } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import FinancialsLanding from "@/components/adminV2/settings/financials/FinancialsLanding";
import FinancialsWorkspaceSurface from "@/components/adminV2/settings/financials/FinancialsWorkspaceSurface";
import { CompactGroupedLandingShell } from "@/components/adminV2/settings/configurationRuntime/CompactGroupedLandingShell";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useConfigurationContinuityOptional } from "@/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider";
import type { FinancialsWorkspaceChapter } from "@/lib/commercial/commercialChapterRoutes";
import {
    FINANCIALS_WORKSPACE_CHAPTERS,
    organizationFinancialsChapterHref,
} from "@/lib/commercial/commercialChapterRoutes";
import { prepareConfigurationSoftNavTarget } from "@/lib/configRuntime/configurationContinuity";

/**
 * Organization Financials — landing (no chapter) or section surface (?chapter=).
 * Landing is compact: breadcrumb + title + launch grid (no conceptual cards).
 */
export default function FinancialsPublicationWorkspace({
    initialChapter,
}: {
    initialChapter: FinancialsWorkspaceChapter | null;
}) {
    const router = useRouter();
    const { orgId: authOrgId } = useAdminAuth();
    const continuity = useConfigurationContinuityOptional();
    const orgId = continuity?.orgId || authOrgId || "";

    useEffect(() => {
        void prepareConfigurationSoftNavTarget(organizationFinancialsChapterHref(null), (href) =>
            router.prefetch(href),
        );
        for (const chapter of FINANCIALS_WORKSPACE_CHAPTERS) {
            void prepareConfigurationSoftNavTarget(organizationFinancialsChapterHref(chapter), (href) =>
                router.prefetch(href),
            );
        }
    }, [router]);

    if (initialChapter) {
        return <FinancialsWorkspaceSurface chapter={initialChapter} orgId={orgId} />;
    }

    return (
        <CompactGroupedLandingShell
            title="Financials"
            titleIcon={<Banknote className="h-5 w-5" strokeWidth={2} />}
            testIdPrefix="financials"
        >
            <FinancialsLanding />
        </CompactGroupedLandingShell>
    );
}
