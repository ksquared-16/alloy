import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    CREATE_LEAD_PASTE_EXAMPLES,
    buildReviewGroups,
    buildUnderstandingGroups,
    operationalSectionTitle,
} from "@/lib/bos/commandSession/createLeadUnderstandingPresentation";
import { emptyBosCommandDraft, type BosCommandDraft } from "@/lib/bos/commandSession";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";

const FIELDS: ActionWorkspaceGatherField[] = [
    {
        payload_key: "first_name",
        field_label: "First name",
        section: "person",
        section_label: "Parent / guardian",
        tier: "required",
        value_kind: "text",
    },
    {
        payload_key: "child_first_name",
        field_label: "Child first name",
        section: "child",
        section_label: "Child",
        tier: "optional",
        value_kind: "text",
    },
    {
        payload_key: "source",
        field_label: "Source",
        section: "context",
        section_label: "Context",
        tier: "optional",
        value_kind: "text",
    },
];

function draftWithValues(): BosCommandDraft {
    const draft = emptyBosCommandDraft();
    draft.values = [
        {
            fieldKey: "first_name",
            value: "Jordan",
            state: "parsed_from_source",
            evidence: [{ kind: "source_span", note: "From your note", at: "2026-01-01T00:00:00.000Z" }],
            optionResolved: false,
        },
        {
            fieldKey: "child_first_name",
            value: "Riley",
            state: "operator_entered",
            evidence: [{ kind: "operator_edit", at: "2026-01-01T00:00:00.000Z" }],
            optionResolved: false,
        },
        {
            fieldKey: "source",
            value: "Website",
            state: "inferred",
            evidence: [{ kind: "option_match", at: "2026-01-01T00:00:00.000Z" }],
            optionResolved: false,
        },
    ];
    return draft;
}

describe("createLeadUnderstandingPresentation (Round 3)", () => {
    it("maps sections to operational titles", () => {
        expect(operationalSectionTitle("person", "Parent")).toBe("Parent");
        expect(operationalSectionTitle("child", "Child")).toBe("Child");
        expect(operationalSectionTitle("context", "Context")).toBe("Lead");
        expect(operationalSectionTitle("context", "Lead")).toBe("Lead");
        expect(operationalSectionTitle("context", "Placement & preferences")).toBe("Lead");
        expect(operationalSectionTitle("person", "Parent / Guardian")).toBe("Person");
    });

    it("groups draft values by operational understanding cards", () => {
        const groups = buildUnderstandingGroups({
            draft: draftWithValues(),
            gatherFields: FIELDS,
        });
        expect(groups.map((g) => g.title)).toEqual([
            "Person",
            "Child",
            "Lead",
        ]);
        expect(groups[0]!.rows[0]).toMatchObject({ label: "First name", value: "Jordan" });
    });

    it("review groups include outcome and unresolved from preview", () => {
        const groups = buildReviewGroups({
            draft: draftWithValues(),
            gatherFields: FIELDS,
            preview: {
                title: "Create lead",
                summaryLines: [],
                householdSummary: "Jordan household",
                warnings: ["Room not selected"],
                sideEffects: ["Opens Processing review"],
                destination: {},
                generatedAt: "2026-01-01T00:00:00.000Z",
                draftFingerprint: "fp",
            },
        });
        expect(groups.some((g) => g.key === "outcome")).toBe(true);
        expect(groups.some((g) => g.key === "unresolved")).toBe(true);
    });

    it("paste examples cover operator onboarding language", () => {
        expect(CREATE_LEAD_PASTE_EXAMPLES.length).toBeGreaterThanOrEqual(4);
        expect(CREATE_LEAD_PASTE_EXAMPLES.join(" ")).toMatch(/call notes|website lead/i);
    });
});

describe("BosCommandSessionHost Round 3 convergence contracts", () => {
    const host = readFileSync(
        resolve(
            __dirname,
            "../../../app/adminV2/components/aiCommandSurface/commandSession/BosCommandSessionHost.tsx"
        ),
        "utf8"
    );
    const gather = readFileSync(
        resolve(__dirname, "../../../components/admin/actions/ActionWorkspaceGatherFields.tsx"),
        "utf8"
    );

    it("uses workspace cards, sections layout, and sticky footer control center", () => {
        expect(host).toContain("WorkspaceCard");
        expect(host).toContain("WS_ACTION_PRIMARY");
        expect(host).toContain("CreateLeadProgressiveForm");
        expect(host).toContain("data-bos-command-session-review");
        expect(host).toContain("data-bos-command-session-create-another");
        expect(host).toContain("data-bos-command-session-return-workspace");
        expect(host).toContain("sticky bottom-0");
        expect(host).toContain('message.kind !== "mode_switch"');
    });

    it("does not lead gather with a top validation strip", () => {
        expect(host).not.toMatch(
            /controller\.resolution\.blockers\.length > 0 &&\s*session\.phase !== "processing_review"/
        );
    });

    it("ActionWorkspaceGatherFields exposes sections layout for operational groups", () => {
        expect(gather).toContain('layout === "sections"');
        expect(gather).toContain("fieldColumns");
    });
});
