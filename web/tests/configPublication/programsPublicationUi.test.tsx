/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProgramsPublicationWorkspace from "@/components/adminV2/settings/programs/ProgramsPublicationWorkspace";

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        replace: vi.fn(),
        push: vi.fn(),
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
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.restoreAllMocks();
});

describe("Programs Publication workspace", () => {
    it("defaults to Overview and exposes reusable publication concerns intentionally", async () => {
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
        });

        expect(container.querySelector('[data-testid="programs-publication-runtime"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-overview"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-save-draft"]')).toBeNull();
        expect(container.textContent).toContain("This Program defines a reusable service");
        expect(container.textContent).toContain("1 published · 1 draft or changed · 0 assigned");

        await act(async () => {
            (container!.querySelector('[data-testid="program-detail-runtime-tab-draft"]') as HTMLButtonElement).click();
        });
        expect(container.querySelector('[data-testid="program-save-draft"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-validate-draft"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-publish"]')).not.toBeNull();

        await act(async () => {
            (container!.querySelector('[data-testid="program-detail-runtime-tab-assignment"]') as HTMLButtonElement).click();
        });
        expect(container.querySelector('[data-testid="program-preview-delivery"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-assign-delivery"]')).not.toBeNull();

        await act(async () => {
            (container!.querySelector('[data-testid="program-detail-runtime-tab-distribution"]') as HTMLButtonElement).click();
        });
        expect(container.querySelector('[data-testid="program-distribution-runtime"]')).not.toBeNull();

        await act(async () => {
            (container!.querySelector('[data-testid="program-detail-runtime-tab-history"]') as HTMLButtonElement).click();
        });
        expect(container.querySelector('[data-testid="program-history-runtime"]')).not.toBeNull();
        expect(container.textContent).toContain("Configuration history");
        expect(container.textContent).toContain("local offer state");
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
            root!.render(<ProgramsPublicationWorkspace />);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="programs-collection-add"]')).toBeNull();
        expect(container.querySelector('[data-testid="program-edit-draft"]')).toBeNull();
        await act(async () => {
            (container!.querySelector('[data-testid="program-detail-runtime-tab-draft"]') as HTMLButtonElement).click();
        });
        expect(container.querySelector('[data-testid="program-save-draft"]')).toBeNull();
        expect((container.querySelector('[data-testid="program-draft-label"]') as HTMLInputElement).disabled).toBe(true);
    });

    it("explains an empty domain and never renders raw database diagnostics", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: async () => ({
                    error: "Could not find the table 'public.programs' in the schema cache",
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

        expect(container.textContent).toContain("Programs are not ready in this environment");
        expect(container.textContent).toContain("Programs are reusable service definitions");
        expect(container.textContent).toContain("Common examples");
        expect(container.textContent).toContain("How it works");
        expect(container.textContent).toContain("Programs setup is not complete");
        expect(container.textContent).not.toMatch(/public\.programs|schema cache/i);
        expect(container.querySelector('[data-testid="programs-empty-state-issue"]')).not.toBeNull();
    });
});
