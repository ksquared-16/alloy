import { describe, expect, it } from "vitest";

import { buildEntityResolveContext } from "@/lib/agent/configLayoutAssist/configLayoutAssistEntityResolve";
import {
    CONFIG_ASSIST_NEW_SECTION_VALUE,
    buildConfigLayoutAssistFieldSetupDraft,
    buildProposalFromFieldSetupConfirm,
    fieldSetupNeedsClarification,
    inferConfigAssistFieldType,
    prepareConfigLayoutAssistFieldSetup,
} from "@/lib/agent/configLayoutAssist/configLayoutAssistFieldSetup";
import { parseConfigLayoutAssistIntent } from "@/lib/agent/configLayoutAssist/configLayoutAssistIntent";

const entityResolve = buildEntityResolveContext(
    [{ entity_type: "opportunities", singular: "Inquiry", plural: "Inquiries" }],
    "opportunity"
);

describe("configLayoutAssistFieldSetup", () => {
    it("create field command needs clarification before persist", () => {
        const intent = parseConfigLayoutAssistIntent("Create Preferred Start Date for inquiries", {
            entityResolve,
        });
        expect(fieldSetupNeedsClarification(intent)).toBe(true);
        const draft = buildConfigLayoutAssistFieldSetupDraft({
            command: "Create Preferred Start Date for inquiries",
            entityResolve,
        });
        expect(draft?.inferred_field_type).toBe("date");
    });

    it("inferred type is Date for preferred start date label", () => {
        expect(inferConfigAssistFieldType("Preferred Start Date")).toBe("date");
    });

    it("required toggle changes requirement_policy on create_field operation", () => {
        const draft = buildConfigLayoutAssistFieldSetupDraft({
            command: "Create Preferred Start Date for inquiries",
            entityResolve,
        })!;
        const sectionOptions = [
            { section_key: "enrollment", label: "Enrollment details", source: "preset" as const },
        ];
        const optional = buildProposalFromFieldSetupConfirm({
            draft,
            confirm: {
                command: draft.command,
                field_type: "date",
                required: false,
                section_selection: { kind: "existing", section_key: "enrollment" },
            },
            sectionOptions,
            userId: "user-1",
        });
        const required = buildProposalFromFieldSetupConfirm({
            draft,
            confirm: {
                command: draft.command,
                field_type: "date",
                required: true,
                section_selection: { kind: "existing", section_key: "enrollment" },
            },
            sectionOptions,
            userId: "user-1",
        });
        const optOp = optional.proposal.proposed_operations.find((o) => o.kind === "create_field");
        const reqOp = required.proposal.proposed_operations.find((o) => o.kind === "create_field");
        expect((optOp?.after as Record<string, unknown>)?.is_required).toBe(false);
        expect((reqOp?.after as Record<string, unknown>)?.is_required).toBe(true);
        expect(
            (reqOp?.after as { requirement_policy?: { mode?: string } })?.requirement_policy?.mode
        ).toBe("required");
    });

    it("selected section changes section_key on create_field", () => {
        const draft = buildConfigLayoutAssistFieldSetupDraft({
            command: "Create Preferred Start Date for inquiries",
            entityResolve,
        })!;
        const built = buildProposalFromFieldSetupConfirm({
            draft,
            confirm: {
                command: draft.command,
                field_type: "date",
                required: false,
                section_selection: { kind: "existing", section_key: "enrollment" },
            },
            sectionOptions: [{ section_key: "enrollment", label: "Enrollment details", source: "preset" }],
            userId: "user-1",
        });
        const op = built.proposal.proposed_operations.find((o) => o.kind === "create_field");
        expect(op?.section_key).toBe("enrollment");
        expect(built.ready_summary.section_label).toBe("Enrollment details");
    });

    it("new section option adds create_section plus create_field", () => {
        const draft = buildConfigLayoutAssistFieldSetupDraft({
            command: "Create Preferred Start Date for inquiries",
            entityResolve,
        })!;
        const built = buildProposalFromFieldSetupConfirm({
            draft,
            confirm: {
                command: draft.command,
                field_type: "date",
                required: false,
                section_selection: { kind: "new", section_label: "Tour preferences" },
            },
            sectionOptions: [{ section_key: "custom", label: "Custom fields", source: "preset" }],
            userId: "user-1",
        });
        const kinds = built.proposal.proposed_operations.map((o) => o.kind);
        expect(kinds).toContain("create_section");
        expect(kinds).toContain("create_field");
        const sectionOp = built.proposal.proposed_operations.find((o) => o.kind === "create_section");
        expect(sectionOp?.section_key).toBe("tour_preferences");
    });

    it("prepareConfigLayoutAssistFieldSetup rejects non-create-field commands", async () => {
        const result = await prepareConfigLayoutAssistFieldSetup({
            command: "Make first name editable from the inquiry",
            orgId: "org-1",
            supabase: {
                from: () => ({
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                order: () => Promise.resolve({ data: [], error: null }),
                            }),
                        }),
                    }),
                }),
            } as unknown as import("@supabase/supabase-js").SupabaseClient,
            entityResolve,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe("NOT_CREATE_FIELD");
    });

    it("field setup card contract avoids raw JSON in component source", async () => {
        const { readFileSync } = await import("node:fs");
        const { dirname, join } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const cardPath = join(
            dirname(fileURLToPath(import.meta.url)),
            "../../../app/adminV2/components/aiCommandSurface/ConfigLayoutAssistFieldSetupCard.tsx"
        );
        const src = readFileSync(cardPath, "utf8");
        expect(src).not.toContain("JSON.stringify");
        expect(src).toContain("Confirm setup");
        expect(src).toContain("+ New section");
    });
});
