"use client";

import Link from "next/link";
import { Banknote } from "lucide-react";
import FinancialsLanding from "@/components/adminV2/settings/financials/FinancialsLanding";
import FinancialsWorkspaceSurface from "@/components/adminV2/settings/financials/FinancialsWorkspaceSurface";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigScopeContextBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useConfigurationContinuityOptional } from "@/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider";
import type { FinancialsWorkspaceChapter } from "@/lib/commercial/commercialChapterRoutes";
import { FINANCIALS_LANDING_SUBTITLE } from "@/lib/financials/financialsLandingModel";
import { CANONICAL_ORGANIZATION_BASE } from "@/lib/admin/canonicalAdminRoutes";
import { useRouter } from "next/navigation";
import { prepareConfigurationSoftNavTarget } from "@/lib/configRuntime/configurationContinuity";
import { useEffect } from "react";
import {
    FINANCIALS_WORKSPACE_CHAPTERS,
    organizationFinancialsChapterHref,
} from "@/lib/commercial/commercialChapterRoutes";

/**
 * Organization Financials — landing (no chapter) or existing section surface (?chapter=).
 * Slice 1: landing composition only; section panels remain functionally unchanged.
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
        <div className="process-config-page min-h-0 flex-1" data-testid="financials-configuration-page">
            <div className="w-full" data-testid="financials-content-column">
                <ConfigurationContext
                    title="Financials"
                    subtitle={FINANCIALS_LANDING_SUBTITLE}
                    titleIcon={<Banknote className="h-5 w-5" strokeWidth={2} />}
                    testId="financials-landing-context"
                >
                    <div
                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-alloy-stone/25 pt-2"
                        data-testid="financials-landing-posture"
                    >
                        <ConfigScopeContextBar
                            mode="organization"
                            organizationLabel="Organization"
                            objectLabel="Financials"
                            ownershipHint="All financial domains"
                            onModeChange={(mode) => {
                                if (mode === "organization") {
                                    router.push(CANONICAL_ORGANIZATION_BASE);
                                }
                            }}
                        />
                        <ul
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-alloy-midnight/52"
                            aria-label="Financials breadcrumb"
                        >
                            <li>
                                <Link
                                    href={CANONICAL_ORGANIZATION_BASE}
                                    className="font-medium hover:text-alloy-bend-pine"
                                >
                                    Organization
                                </Link>
                                <span className="mx-1.5 text-alloy-midnight/35" aria-hidden>
                                    ›
                                </span>
                                <span className="font-semibold text-alloy-midnight/70">Financials</span>
                            </li>
                        </ul>
                    </div>
                </ConfigurationContext>
            </div>

            <ConfigurationShell testId="financials-landing-shell">
                <main
                    className="mx-auto min-w-0 max-w-[1480px] space-y-2.5 pb-3"
                    data-testid="financials-landing-workspace"
                >
                    <FinancialsLanding />
                </main>
            </ConfigurationShell>
        </div>
    );
}
