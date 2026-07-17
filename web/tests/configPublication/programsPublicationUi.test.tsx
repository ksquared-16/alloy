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
    it("shows draft, publish, impact-preview, assignment, and history controls", async () => {
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
        expect(container.querySelector('[data-testid="program-save-draft"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-validate-draft"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-publish"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-preview-delivery"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="program-assign-delivery"]')).not.toBeNull();
        expect(container.textContent).toContain("Published and delivery history");
        expect(container.textContent).toContain("local offer state");
    });
});
