/**
 * Browser-visible workload debug snapshot (Test 2C — Operator notes).
 */

import { buildIntakeWorkspaceFilterPanel } from "@/lib/forms/intakeWorkspaceFilters";
import {
    INTAKE_RUNTIME_TEST_1C_ID,
    INTAKE_RUNTIME_TEST_1D_ID,
    INTAKE_RUNTIME_TEST_ORG_ID,
    DEMO_CHILDCARE_ORG_ID,
} from "@/lib/forms/intakeRuntimeTestFixtures";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";
import { submissionCreatedOrMatchedSummary } from "@/lib/forms/submissionOperationalNarrative";

export type IntakeWorkloadBrowserDebug = {
    sessionOrgId: string | null;
    apiOrgId: string | null;
    apiUrl: string;
    totalLoaded: number;
    loadedPreview: { id: string; submitted_at: string | null }[];
    hasTest1C: boolean;
    hasTest1D: boolean;
    activeFilter: string;
    reviewRowIds: string[];
    recentRowIds: string[];
    orgMismatchHint: string | null;
};

export function buildIntakeWorkloadBrowserDebug(params: {
    sessionOrgId: string | null;
    apiOrgId: string | null;
    apiUrl: string;
    submissions: SubmissionInboxRow[];
    activeFilter: string;
    formsById: Record<string, string>;
}): IntakeWorkloadBrowserDebug {
    const { submissions, activeFilter, formsById, sessionOrgId, apiOrgId, apiUrl } = params;

    const reviewPanel = buildIntakeWorkspaceFilterPanel("needs_review", {
        submissions,
        sessions: [],
        forms: [],
        packets: [],
        formsById,
    });
    const recentPanel = buildIntakeWorkspaceFilterPanel("recent", {
        submissions,
        sessions: [],
        forms: [],
        packets: [],
        formsById,
    });

    const reviewRowIds = reviewPanel.items.filter((i) => i.submission).map((i) => i.submission!.id);
    const recentRowIds = recentPanel.items.filter((i) => i.submission).map((i) => i.submission!.id);

    const hasTest1C = submissions.some((r) => r.id === INTAKE_RUNTIME_TEST_1C_ID);
    const hasTest1D = submissions.some((r) => r.id === INTAKE_RUNTIME_TEST_1D_ID);

    let orgMismatchHint: string | null = null;
    const resolvedOrg = apiOrgId ?? sessionOrgId;
    if (resolvedOrg && resolvedOrg !== INTAKE_RUNTIME_TEST_ORG_ID && !hasTest1C && !hasTest1D) {
        orgMismatchHint =
            resolvedOrg === DEMO_CHILDCARE_ORG_ID ?
                "Use Forms Runtime Test 2D embed in Demo Childcare Co — prior Test 1C/1D were Alloy Bend only."
            :   `Prior Test 1C/1D live in Alloy Bend (${INTAKE_RUNTIME_TEST_ORG_ID.slice(0, 8)}…). For Demo Childcare Co use Test 2D embed token.`;
    }

    return {
        sessionOrgId,
        apiOrgId,
        apiUrl,
        totalLoaded: submissions.length,
        loadedPreview: submissions.slice(0, 10).map((r) => ({
            id: r.id,
            submitted_at: r.submitted_at,
        })),
        hasTest1C,
        hasTest1D,
        activeFilter,
        reviewRowIds,
        recentRowIds,
        orgMismatchHint,
    };
}

export function formatLinkedRecordSummary(row: SubmissionInboxRow): string | null {
    return submissionCreatedOrMatchedSummary(row);
}
