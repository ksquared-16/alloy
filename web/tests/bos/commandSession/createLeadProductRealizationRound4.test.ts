import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { emptyBosCommandDraft, type BosCommandDraft } from "@/lib/bos/commandSession";
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import {
    buildCreateLeadSectionModels,
    defaultOpenSectionKeys,
    sectionAffordanceLabel,
} from "@/lib/bos/commandSession/createLeadSectionPresentation";
import {
    BOS_COMMAND_WORKSPACE_MIN_WIDTH_PX,
    bumpFloatingToCommandWorkspace,
    restoreFloatingWidth,
    shouldBumpToCommandWorkspace,
} from "@/lib/bos/commandSession/bosCommandWorkspaceGeometry";

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
        payload_key: "last_name",
        field_label: "Last name",
        section: "person",
        section_label: "Parent / guardian",
        tier: "required",
        value_kind: "text",
    },
    {
        payload_key: "email",
        field_label: "Email",
        section: "person",
        section_label: "Parent / guardian",
        tier: "optional",
        value_kind: "email",
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
        payload_key: "location_id",
        field_label: "Location",
        section: "context",
        section_label: "Context",
        tier: "optional",
        value_kind: "select",
    },
    {
        payload_key: "source",
        field_label: "Source",
        section: "context",
        section_label: "Context",
        tier: "optional",
        value_kind: "text",
    },
    {
        payload_key: "intake_notes",
        field_label: "Notes",
        section: "context",
        section_label: "Context",
        tier: "optional",
        value_kind: "text",
        multiline: true,
    },
];

function sectionsFromFields() {
    const by = new Map<string, ActionWorkspaceGatherField[]>();
    for (const f of FIELDS) {
        const list = by.get(f.section) ?? [];
        list.push(f);
        by.set(f.section, list);
    }
    return [...by.entries()].map(([key, fields]) => ({
        key,
        label: fields[0]!.section_label,
        fields,
    }));
}

function draft(values: Record<string, string>): BosCommandDraft {
    const d = emptyBosCommandDraft();
    d.values = Object.entries(values).map(([fieldKey, value]) => ({
        fieldKey,
        value,
        state: "operator_entered" as const,
        evidence: [{ kind: "operator_edit" as const, at: "2026-01-01T00:00:00.000Z" }],
        optionResolved: false,
    }));
    return d;
}

describe("Round 4 progressive sections", () => {
    it("derives Family / Children / Placement / Additional from effective sections", () => {
        const models = buildCreateLeadSectionModels({
            sections: sectionsFromFields(),
            draft: emptyBosCommandDraft(),
            requiredPayloadKeys: ["first_name", "last_name"],
        });
        expect(models.map((m) => m.title)).toEqual([
            "Family",
            "Children",
            "Placement & preferences",
            "Additional information",
        ]);
    });

    it("opens Family by default when required creation info is missing", () => {
        const models = buildCreateLeadSectionModels({
            sections: sectionsFromFields(),
            draft: emptyBosCommandDraft(),
            requiredPayloadKeys: ["first_name", "last_name"],
        });
        expect(defaultOpenSectionKeys(models)).toEqual(["person"]);
        expect(sectionAffordanceLabel(models[0]!)).toBe("Open");
    });

    it("keeps optional sections empty/optional and summarizes populated Family", () => {
        const models = buildCreateLeadSectionModels({
            sections: sectionsFromFields(),
            draft: draft({
                first_name: "Sarah",
                last_name: "Jones",
                email: "sarah@example.com",
                phone: "(541) 555-0144",
            }),
            requiredPayloadKeys: ["first_name", "last_name"],
        });
        const family = models.find((m) => m.key === "person")!;
        expect(family.completion).toBe("ready");
        expect(family.summaryLines[0]).toBe("Sarah Jones");
        expect(family.summaryLines[1]).toContain("sarah@example.com");
        expect(defaultOpenSectionKeys(models)).toEqual([]);
        const children = models.find((m) => m.key === "child")!;
        expect(children.statusLabel).toBe("Optional");
        expect(sectionAffordanceLabel(children)).toBe("Add details");
    });

    it("resolves option labels in placement summary", () => {
        const labels = new Map([["location_id:site-1", "Bend Campus"]]);
        const models = buildCreateLeadSectionModels({
            sections: sectionsFromFields(),
            draft: draft({ location_id: "site-1", source: "Website" }),
            requiredPayloadKeys: ["first_name", "last_name"],
            optionLabels: labels,
        });
        const placement = models.find((m) => m.key === "context")!;
        expect(placement.summaryLines).toContain("Bend Campus");
        const additional = models.find((m) => m.key === "additional")!;
        expect(additional.summaryLines).toContain("Website");
    });
});

describe("Round 4 command-workspace sizing", () => {
    it("bumps floating width once below command workspace floor", () => {
        expect(shouldBumpToCommandWorkspace(400)).toBe(true);
        const { next, snapshot } = bumpFloatingToCommandWorkspace(
            { x: 100, y: 100, width: 400, height: 620 },
            { width: 1440, height: 900 }
        );
        expect(snapshot.bumped).toBe(true);
        expect(next.width).toBeGreaterThanOrEqual(BOS_COMMAND_WORKSPACE_MIN_WIDTH_PX);
        const restored = restoreFloatingWidth(next, snapshot, { width: 1440, height: 900 });
        expect(restored.width).toBe(400);
    });

    it("does not bump when already wide enough", () => {
        const { snapshot } = bumpFloatingToCommandWorkspace(
            { x: 100, y: 100, width: 560, height: 620 },
            { width: 1440, height: 900 }
        );
        expect(snapshot.bumped).toBe(false);
    });
});

describe("Round 4 host contracts", () => {
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
    const progressive = readFileSync(
        resolve(
            __dirname,
            "../../../app/adminV2/components/aiCommandSurface/commandSession/CreateLeadProgressiveForm.tsx"
        ),
        "utf8"
    );
    const help = readFileSync(
        resolve(
            __dirname,
            "../../../app/adminV2/components/aiCommandSurface/commandSession/CreateLeadCommandHelp.tsx"
        ),
        "utf8"
    );

    it("uses progressive sections, quiet chrome, Lead vocabulary, and help popover", () => {
        expect(host).toContain("CreateLeadProgressiveForm");
        expect(host).toContain("CreateLeadCommandHelp");
        expect(host).toContain("Describe the lead");
        expect(host).toContain("bumpFloatingToCommandWorkspace");
        expect(host).toContain("data-bos-command-session-expand");
        expect(host).not.toContain("data-bos-command-session-empty");
        expect(host).not.toContain("Paste or type the inquiry");
        expect(progressive).toContain('chrome="quiet"');
        expect(progressive).toContain("fieldColumns={props.compact ? 1 : 2}");
        expect(gather).toContain('chrome === "quiet"');
        expect(gather).toContain("INPUT_QUIET");
        expect(help).toContain('role="dialog"');
        expect(help).toContain("Escape");
        expect(help).toContain("What can I provide?");
    });
});
