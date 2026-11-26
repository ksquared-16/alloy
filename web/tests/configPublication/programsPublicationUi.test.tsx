/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProgramsPublicationWorkspace from "@/components/adminV2/settings/programs/ProgramsPublicationWorkspace";
import { resetProgramsCollectionCacheForTests } from "@/lib/programs/programsCollectionCache";

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        replace: vi.fn(),
        push: vi.fn(),
    }),
}));

vi.mock("@/contexts/AdminAuthContext", () => ({
    useAdminAuth: () => ({
        canMutate: true,
        orgId: "org-1",
        role: "admin",
        roleKeys: ["admin"],
        userEmail: "qa@example.com",
        userId: "user-1",
    }),
}));

vi.mock("@/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider", () => ({
    useConfigurationContinuityOptional: () => ({
        orgId: "org-1",
        selection: null,
        rememberLocationSelection: vi.fn(),
        rememberProgramSelection: vi.fn(),
        rememberProgramsChapterSelection: vi.fn(),
        lastInvalidation: null,
    }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = {
    capabilities: { canManage: true },
    programs: [
        {
            id: "program-1",
            key: "preschool",
            lifecycleStatus: "active",
            draft: {
                id: "draft-1",
                programId: "program-1",
                status: "validated",
                baseRevisionId: "revision-1",
                validationErrors: [],
                updatedAt: "2026-07-17T00:00:00.000Z",
                programKey: "preschool",
                label: "Preschool",
                description: "A reusable service",
                category: "Early learning",
                eligibility: {},
                audience: {},
                requiredResourceType: "classroom",
                qualificationRequirements: [],
                defaultPolicyRefs: {},
                defaultCommercialPosture: {},
            },
            revisions: [
                {
                    id: "revision-1",
                    programId: "program-1",
                    revisionNumber: 1,
                    payloadChecksum: "checksum",
                    publishedAt: "2026-07-17T00:00:00.000Z",
                    programKey: "preschool",
                    label: "Preschool",
                    description: "A reusable service",
                    category: "Early learning",
                    eligibility: {},
                    audience: {},
                    requiredResourceType: "classroom",
                    qualificationRequirements: [],
                    defaultPolicyRefs: {},
                    defaultCommercialPosture: {},
                },
            ],
            publications: [
                {
                    id: "publication-1",
                    orgId: "org-1",
                    domainKey: "programs",
                    subjectId: "program-1",
                    revision: { id: "revision-1", number: 1, checksum: "checksum" },
                    publishedAt: "2026-07-17T00:00:00.000Z",
                },
            ],
            latestPublication: {
                id: "publication-1",
                orgId: "org-1",
                domainKey: "programs",
                subjectId: "program-1",
                revision: { id: "revision-1", number: 1, checksum: "checksum" },
                publishedAt: "2026-07-17T00:00:00.000Z",
            },
        },
    ],
    locations: [{ id: "location-1", label: "Downtown" }],
    runs: [],
    attempts: [],
    assignments: [],
    availability: [],
    offerings: [],
    variants: [],
    tuitionRates: [],
    policies: [],
    products: [],
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
    resetProgramsCollectionCacheForTests();
});

afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
    resetProgramsCollectionCacheForTests();
    vi.restoreAllMocks();
});

describe("Programs Publication workspace", () => {
    it("lands on collection until a Program is selected, then exposes object concerns", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => snapshot,
            }),
        );
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root!.render(<ProgramsPublicationWorkspace />);
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="programs-publication-runtime"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="programs-landing"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="programs-readiness"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="programs-list"]')).not.toBeNull();
        // No auto-select — collection landing.
        expect(container.querySelector('[data-testid="program-overview"]')).toBeNull();
        expect(container.querySelector('[data-testid="programs-object-workspace"]')).toBeNull();

        await act(async () => {
            root!.render(
                <ProgramsPublicationWorkspace initialProgramId="program-1" initialSection="overview" />,
            );
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="program-overview"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-overview-concerns"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-overview-attention"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-definition-edit-gate-save"]')).toBeNull();
        expect(container.textContent).toContain("At a glance");
        expect(container.textContent).toContain("Publication readiness");
        expect(
            Array.from(container.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent?.trim()),
        ).toEqual([
            "Overview",
            "Delivery Options",
            "Tuition",
            "Locations",
            "Policies",
            "Relationships",
            "Publication",
            "Distribution",
            "History",
        ]);
        expect(container.textContent).toContain("1 published · 1 draft or changed · 0 assigned");

        await act(async () => {
            (container!.querySelector('[data-testid="program-edit-draft"]') as HTMLButtonElement).click();
            await Promise.resolve();
        });
        expect(container.querySelector('[data-testid="program-definition-edit-gate"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-validate-draft"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-publish"]')).not.toBeNull();

        for (const [section, testId] of [
            ["availability", "program-availability-runtime"],
            ["offerings", "program-offerings-runtime"],
            ["pricing", "program-pricing-runtime"],
            ["policies", "program-policies-runtime"],
            ["relationships", "program-relationships-runtime"],
        ] as const) {
            await act(async () => {
                (
                    container!.querySelector(
                        `[data-testid="programs-object-workspace-tab-${section}"]`,
                    ) as HTMLButtonElement
                ).click();
                await Promise.resolve();
            });
            expect(container.querySelector(`[data-testid="${testId}"]`)).not.toBeNull();
        }

        await act(async () => {
            (
                container!.querySelector(
                    '[data-testid="programs-object-workspace-tab-assignment"]',
                ) as HTMLButtonElement
            ).click();
            await Promise.resolve();
        });
        expect(container.querySelector('[data-testid="program-preview-delivery"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-assign-delivery"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-distribution-runtime"]')).not.toBeNull();

        await act(async () => {
            (
                container!.querySelector(
                    '[data-testid="programs-object-workspace-tab-publication"]',
                ) as HTMLButtonElement
            ).click();
            await Promise.resolve();
        });
        expect(container.querySelector('[data-testid="program-publication-runtime"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-distribution-runtime"]')).toBeNull();

        await act(async () => {
            (
                container!.querySelector(
                    '[data-testid="programs-object-workspace-tab-history"]',
                ) as HTMLButtonElement
            ).click();
            await Promise.resolve();
        });
        expect(container.querySelector('[data-testid="program-history-runtime"]')).not.toBeNull();
        expect(container.textContent).toContain("Configuration history");
    });

    it("keeps mutation controls out of the read-only runtime", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    ...snapshot,
                    capabilities: { canManage: false },
                }),
            }),
        );
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root!.render(
                <ProgramsPublicationWorkspace initialProgramId="program-1" initialSection="overview" />,
            );
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="programs-object-workspace-collection-add"]')).toBeNull();
        expect(container.querySelector('[data-testid="program-edit-draft"]')).toBeNull();
        expect(container.querySelector('[data-testid="program-definition-edit-gate-save"]')).toBeNull();
    });

    it("shows a bounded unavailable state and never renders raw database diagnostics", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: async () => ({
                    error: {
                        code: "not_initialized",
                        title: "Programs setup is not complete",
                        message: "This Configuration area has not been initialized in this environment.",
                        nextStep: "An administrator needs to complete platform setup before this configuration can be used.",
                        reference: "cfg-test",
                    },
                }),
            }),
        );
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root!.render(<ProgramsPublicationWorkspace />);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="programs-unavailable-state"]')).not.toBeNull();
        expect(container.textContent).toContain("Programs setup is not complete");
        expect(container.textContent).toContain("cfg-test");
        expect(container.textContent).not.toMatch(/public\.programs|schema cache/i);
        expect(container.querySelector('[data-testid="programs-empty-state-issue"]')).toBeNull();
        expect(container.querySelector('[data-testid="programs-landing"]')).toBeNull();
        expect(container.querySelector('[data-testid="programs-first-use-empty"]')).toBeNull();
    });

    it("renders the full landing for a valid empty Programs collection", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    ...snapshot,
                    programs: [],
                    assignments: [],
                    offerings: [],
                    variants: [],
                    runs: [],
                    attempts: [],
                    availability: [],
                }),
            }),
        );
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root!.render(<ProgramsPublicationWorkspace />);
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        const landing = container.querySelector('[data-testid="programs-landing"]');
        expect(landing).not.toBeNull();
        expect(landing?.getAttribute("data-programs-collection-state")).toBe("valid_empty");
        expect(container.querySelector('[data-testid="programs-unavailable-state"]')).toBeNull();
        expect(container.querySelector('[data-testid="programs-first-use-empty"]')).toBeNull();
        expect(container.querySelector('[data-testid="programs-readiness"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="programs-attention-summary"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="programs-inventory"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="programs-list-card"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="programs-landing-empty"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="programs-landing-add"]')).not.toBeNull();
        expect(container.textContent).toContain("No Programs yet");
        expect(container.textContent).toContain("0 ready");
        expect(container.textContent).toContain("No Programs have been created yet");
        expect(container.textContent).not.toMatch(/setup is not complete|not been initialized/i);
    });
});
