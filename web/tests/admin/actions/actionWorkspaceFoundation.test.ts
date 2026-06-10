import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { canFastPathCreateLead } from "@/lib/admin/actions/actionWorkspaceGatherFlow";
import {
    bosSuggestionsFromExtraction,
    createLeadParserSpec,
    emptyCreateLeadGatherValues,
    validateCreateLeadPlatformMinimum,
} from "@/lib/admin/actions/createLeadPlatformGather";
import { parseCreateLeadIntakeText } from "@/lib/lifecycle/parseCreateLeadIntakeText";
import { CreateLeadModal } from "@/components/admin/opportunity/actions/CreateLeadModal";

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("action workspace foundation", () => {
    it("default shell fits viewport without overlapping BOS Command Center", () => {
        const shell = read("components/admin/actions/ActionWorkspaceShell.tsx");
        expect(shell).toContain("ACTION_WORKSPACE_VIEWPORT_INSET");
        expect(shell).toContain("overflow-hidden");
        expect(shell).toContain("w-[min(80vw,1400px)]");
        expect(shell).toContain("ACTION_WORKSPACE_LAYER_Z");
        expect(shell).toContain("data-action-workspace-panel");
    });

    it("production create lead uses stable BOS workspace without cloud perimeter", () => {
        const bos = read("components/admin/actions/ActionWorkspaceBosShell.tsx");
        const constants = read("lib/admin/actions/bosWorkspaceShell.ts");
        const paste = read("components/admin/actions/ActionWorkspacePasteCanvas.tsx");
        const gather = read("components/admin/actions/ActionWorkspaceGatherFields.tsx");
        expect(bos).toContain("BOS_BACKDROP_STYLE");
        expect(bos).toContain("BOS_AMBIENT_GLOW_STYLE");
        expect(bos).toContain("BOS_SHELL_MIDNIGHT_FORGE");
        expect(bos).toContain("data-action-workspace-bos-brand");
        expect(bos).toContain("BOS_SHELL_TERRITORY_TITLE");
        expect(bos).toContain('data-action-workspace-shell="bos"');
        expect(bos).toContain("data-action-workspace-bos-workspace");
        expect(bos).toContain("data-bos-ambient-glow");
        expect(bos).toContain("ACTION_WORKSPACE_VIEWPORT_INSET");
        expect(bos).toContain("overflow-hidden");
        expect(bos).toContain("BOS_WORKSPACE_PANEL_HEIGHT");
        expect(bos).not.toContain("BosTerritoryShell");
        expect(bos).not.toContain("BosCloudTerritorySvg");
        expect(bos).not.toContain("clipPath");
        expect(bos).not.toContain("clip-path");
        expect(constants).toContain("BOS_WORKSPACE_WIDTH");
        expect(constants).toContain("min(1200px, 84vw)");
        expect(constants).toContain("BOS_WORKSPACE_TOP_INSET");
        expect(constants).toContain("3.75rem");
        expect(constants).toContain("BOS_WORKSPACE_PANEL_HEIGHT");
        expect(constants).toContain("ACTION_WORKSPACE_VIEWPORT_INSET");
        expect(constants).toContain("BOS_PASTE_CANVAS_MIN_HEIGHT");
        expect(paste).toContain("bosWorkspaceShell");
        expect(paste).toContain("sectionTitle");
        expect(paste).toContain("Tell BOS about the family");
        expect(paste).toContain("Paste email, call note");
        expect(gather).toContain("border-b-2 border-[#00A283]");
    });

    it("dev cloud territory shell remains for design-system exploration", () => {
        const cloud = read("components/admin/actions/ActionWorkspaceBosCloudShell.tsx");
        const shell = read("components/admin/actions/BosTerritoryShell.tsx");
        const gallery = read("app/dev/action-workspace-bos-cloud/ActionWorkspaceBosCloudGallery.tsx");
        expect(cloud).toContain("BosTerritoryShell");
        expect(shell).toContain("BosCloudTerritorySvg");
        expect(gallery).toContain("ActionWorkspaceBosCloudShell");
    });

    it("step rail uses bend pine for active step not blue", () => {
        const rail = read("components/admin/actions/ActionWorkspaceStepRail.tsx");
        expect(rail).toContain("#00A283");
        expect(rail).not.toContain("alloy-blue");
    });

    it("step rail exposes gather review execute success", () => {
        const rail = read("components/admin/actions/ActionWorkspaceStepRail.tsx");
        const types = read("lib/admin/actions/actionWorkspaceTypes.ts");
        expect(rail).toContain("action-workspace-step-${step.key}");
        expect(rail).toContain("ACTION_WORKSPACE_STEPS");
        expect(types).toContain('key: "gather"');
        expect(types).toContain('label: "Review/Edit"');
        expect(types).toContain('label: "Create"');
        expect(types).toContain('key: "success"');
    });

    it("canonical BOS execution loader is reusable and documented", () => {
        const loader = read("components/admin/actions/BosExecutionLoader.tsx");
        const execute = read("components/admin/actions/ActionWorkspaceExecuteState.tsx");
        expect(loader).toContain("BosExecutionLoader");
        expect(loader).toContain("data-bos-execution-loader");
        expect(loader).toContain("ActionWorkspaceBosNeuralPulse");
        expect(loader).toContain("Create Lead");
        expect(loader).toContain("Schedule Tour");
        expect(loader).not.toContain("animate-spin");
        expect(execute).toContain("BosExecutionLoader");
    });

    it("BOS action workspace uses genie lamp not sparkle icons", () => {
        const shell = read("components/admin/actions/ActionWorkspaceBosShell.tsx");
        const banner = read("components/admin/actions/ActionWorkspaceBosBanner.tsx");
        const success = read("components/admin/actions/ActionWorkspaceSuccessState.tsx");
        expect(shell).toContain("BosGenieLampIcon");
        expect(banner).toContain("BosGenieLampIcon");
        expect(success).toContain("BosGenieLampIcon");
        expect(shell).not.toContain("Sparkles");
        expect(banner).not.toContain("Sparkles");
    });

    it("BOS suggestions require explicit apply with inline edit", () => {
        const bos = read("components/admin/actions/ActionWorkspaceBosSuggestions.tsx");
        expect(bos).toContain("action-workspace-bos-apply-button");
        expect(bos).toContain("onSuggestionValueChange");
        expect(bos).toContain("BOS_CONFIDENCE_STYLES");
    });

    it("create lead modal uses action workspace not small modal shell", () => {
        const modal = read("components/admin/opportunity/actions/CreateLeadModal.tsx");
        expect(modal).toContain("ActionWorkspaceBosShell");
        expect(modal).not.toContain("ActionWorkspaceBosCloudShell");
        expect(modal).not.toContain("ActionWorkspaceShell");
        expect(modal).not.toContain("ActionIntakeModalShell");
        expect(modal).toContain('step === "gather"');
        expect(modal).toContain('step === "review"');
        expect(modal).toContain('step === "execute"');
        expect(modal).toContain('step === "success"');
        expect(modal).not.toContain("fetchActionIntakeSpec");
        expect(modal).toContain("validateCreateLeadPlatformMinimum");
        expect(modal).toContain("gatherPhase");
        expect(modal).toContain("Create Lead");
        expect(modal).toContain("Review details");
        expect(modal).toContain("resolveCreateLeadSuccessActions");
        expect(modal).toContain("Tell BOS about the family");
        expect(modal).toContain("onCreated");
        expect(modal).toContain("ActionWorkspaceBosGuidancePanel");
        expect(modal).toContain("householdLabel");
        expect(modal).toContain("bosRecommendations");
    });

    it("review summary is read-only", () => {
        const review = read("components/admin/actions/ActionWorkspaceReviewSummary.tsx");
        expect(review).not.toContain("onChange");
        expect(review).toContain("Read-only summary");
    });
});

describe("create lead BOS guidance", () => {
    it("shows ready copy when platform minimum is satisfied", async () => {
        const { resolveCreateLeadBosGuidance } = await import("@/lib/admin/actions/createLeadBosGuidance");
        const guidance = resolveCreateLeadBosGuidance({
            first_name: "Jordan",
            last_name: "Lee",
            email: "jordan@example.com",
            phone: "",
        });
        expect(guidance.ready).toBe(true);
        expect(guidance.headline).toContain("create this lead");
    });

    it("lists missing required fields for manual entry", async () => {
        const { resolveCreateLeadBosGuidance } = await import("@/lib/admin/actions/createLeadBosGuidance");
        const guidance = resolveCreateLeadBosGuidance({ first_name: "Jordan" });
        expect(guidance.ready).toBe(false);
        expect(guidance.missingItems).toContain("Last name");
        expect(guidance.missingItems).toContain("contact method");
    });

    it("surfaces optional advisory fields when manual entry is otherwise valid", async () => {
        const { resolveCreateLeadBosGuidance } = await import("@/lib/admin/actions/createLeadBosGuidance");
        const guidance = resolveCreateLeadBosGuidance({
            first_name: "Jordan",
            last_name: "Lee",
            email: "jordan@example.com",
        });
        expect(guidance.ready).toBe(true);
        expect(guidance.advisoryItems).toContain("child information");
        expect(guidance.advisoryItems).toContain("program interest");
        expect(guidance.advisoryItems).toContain("source");
    });

    it("gates schedule tour when child/program/location are missing", async () => {
        const { resolveCreateLeadBosRecommendations, resolveCreateLeadSuccessActions } = await import(
            "@/lib/admin/actions/createLeadBosGuidance"
        );
        const sparse = resolveCreateLeadBosRecommendations({
            first_name: "Jordan",
            last_name: "Lee",
            child_date_of_birth: "",
        });
        const scheduleSparse = sparse.find((r) => r.id === "schedule-tour");
        expect(scheduleSparse?.detail).toBe("Needs child/program info");
        expect(scheduleSparse?.tone).toBe("warning");
        expect(sparse.some((r) => r.label === "Child DOB" && r.detail === "Required Information")).toBe(true);

        const actions = resolveCreateLeadSuccessActions({
            first_name: "Jordan",
            last_name: "Lee",
        });
        expect(actions.find((a) => a.id === "schedule-tour")?.disabled).toBe(true);
        expect(actions.find((a) => a.id === "send-welcome")?.status).toBe("Template ready soon");

        const ready = resolveCreateLeadBosRecommendations({
            first_name: "Jordan",
            last_name: "Lee",
            child_first_name: "Sam",
            child_program: "prog-1",
            location_id: "loc-1",
        });
        expect(ready.find((r) => r.id === "schedule-tour")?.detail).toBe("Available after opening lead");
    });

    it("formats household label with Family naming", async () => {
        const { formatCreateLeadHouseholdLabel } = await import("@/lib/admin/actions/createLeadBosGuidance");
        expect(
            formatCreateLeadHouseholdLabel({
                first_name: "Lebron",
                last_name: "James",
            })
        ).toBe("James Family");
    });
});

describe("create lead platform minimum", () => {
    it("requires name and email or phone only", () => {
        const invalid = validateCreateLeadPlatformMinimum({
            ...emptyCreateLeadGatherValues(),
            first_name: "Ada",
        });
        expect(invalid.ok).toBe(false);

        const valid = validateCreateLeadPlatformMinimum({
            ...emptyCreateLeadGatherValues(),
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
        });
        expect(valid.ok).toBe(true);
    });
});

describe("create lead BOS suggestion flow", () => {
    it("produces suggestions without auto-applying to gather values", () => {
        const spec = createLeadParserSpec("dept-1");
        const extraction = parseCreateLeadIntakeText({
            text: "Parent: Jordan Lee\nEmail: jordan@example.com",
            spec,
        });
        const suggestions = bosSuggestionsFromExtraction(extraction);
        expect(suggestions.length).toBeGreaterThan(0);
        const values = emptyCreateLeadGatherValues();
        expect(values.first_name).toBe("");
        expect(suggestions.some((s) => s.payload_key === "first_name")).toBe(true);
    });
});

describe("CreateLeadActionWorkspace render", () => {
    it("renders gather step with paste canvas and analyze CTA", () => {
        const html = renderToStaticMarkup(
            createElement(CreateLeadModal, {
                open: true,
                departmentId: "dept-1",
                onClose: () => {},
                onSubmit: vi.fn(),
            })
        );

        expect(html).toContain('data-testid="create-lead-action-workspace"');
        expect(html).toContain('data-action-workspace-shell="bos"');
        expect(html).toContain('data-action-workspace-bos-workspace="true"');
        expect(html).toContain('data-bos-ambient-glow="true"');
        expect(html).not.toContain('data-action-workspace-bos-cloud-territory="true"');
        expect(html).not.toContain("data-bos-cloud-territory-svg");
        expect(html).toContain('data-testid="create-lead-gather-step"');
        expect(html).toContain('data-testid="action-workspace-paste-canvas"');
        expect(html).toContain('data-testid="action-workspace-analyze-button"');
        expect(html).toContain("Analyze with BOS");
        expect(html).toContain("Tell BOS about the family");
        expect(html).toContain('data-testid="action-workspace-step-rail"');
        expect(html).not.toContain('data-testid="create-lead-review-step"');
        expect(html).not.toContain('data-testid="create-lead-gather-fields"');
    });
});

describe("create lead gather phases", () => {
    it("fast path skips review when BOS apply is clean and high confidence", () => {
        const ok = canFastPathCreateLead({
            gatherPhase: "details",
            values: {
                first_name: "Jordan",
                last_name: "Lee",
                email: "jordan@example.com",
                phone: "",
            },
            appliedFromBos: true,
            valuesEditedAfterApply: false,
            lastAppliedSuggestions: [
                {
                    id: "first_name:Jordan",
                    payload_key: "first_name",
                    field_label: "First name",
                    suggested_value: "Jordan",
                    confidence: "high",
                    selected: true,
                },
                {
                    id: "last_name:Lee",
                    payload_key: "last_name",
                    field_label: "Last name",
                    suggested_value: "Lee",
                    confidence: "high",
                    selected: true,
                },
                {
                    id: "email:jordan@example.com",
                    payload_key: "email",
                    field_label: "Email",
                    suggested_value: "jordan@example.com",
                    confidence: "high",
                    selected: true,
                },
            ],
        });
        expect(ok).toBe(true);
    });

    it("fast path blocked when any suggestion was medium confidence", () => {
        const ok = canFastPathCreateLead({
            gatherPhase: "details",
            values: {
                first_name: "Jordan",
                last_name: "Lee",
                email: "jordan@example.com",
                phone: "",
            },
            appliedFromBos: true,
            valuesEditedAfterApply: false,
            lastAppliedSuggestions: [
                {
                    id: "source:Website",
                    payload_key: "source",
                    field_label: "Source",
                    suggested_value: "Website",
                    confidence: "medium",
                    selected: true,
                },
            ],
        });
        expect(ok).toBe(false);
    });
});
