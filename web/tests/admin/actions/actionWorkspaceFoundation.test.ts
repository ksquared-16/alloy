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

    it("production create lead uses workspace drawer shell with BOS rail band geometry", () => {
        const bos = read("components/admin/actions/ActionWorkspaceBosShell.tsx");
        const constants = read("lib/admin/actions/bosWorkspaceShell.ts");
        const geometry = read("lib/admin/actions/actionWorkspaceGeometry.ts");
        const paste = read("components/admin/actions/ActionWorkspacePasteCanvas.tsx");
        const gather = read("components/admin/actions/ActionWorkspaceGatherFields.tsx");
        expect(bos).toContain('presentation = "workspace-drawer"');
        expect(bos).toContain("measureAndApplyActionWorkspaceGeometry");
        expect(bos).toContain("data-adminv2-drawer");
        expect(bos).toContain("adminv2-drawer-modal-panel--bos-rail");
        expect(bos).toContain("BOS_ACTION_WORKSPACE_FORGE_PERIMETER_STYLE");
        expect(bos).toContain("action-workspace-bos-shell");
        expect(bos).not.toContain("BosRevealSequence");
        expect(bos).not.toContain("measureActionWorkspacePanelLayout");
        expect(bos).toContain("contentBleed");
        expect(bos).toContain("headerTone?:");
        expect(bos).toContain('headerTone = "integrated"');
        expect(bos).toContain('data-action-workspace-shell="bos"');
        expect(bos).toContain("data-action-workspace-bos-workspace");
        expect(bos).toContain("BOS_ACTION_WORKSPACE_VIEWPORT_SCRIM_STYLE");
        expect(bos).toContain("BOS_ACTION_WORKSPACE_FORGE_PERIMETER_STYLE");
        expect(bos).toContain("BOS_AMBIENT_GLOW_STYLE");
        expect(bos).toContain("bos-workspace-shell__perimeter");
        expect(bos).toContain("bos-workspace-shell__atmosphere");
        expect(bos).not.toContain("BosTerritoryShell");
        expect(bos).not.toContain("BosCloudTerritorySvg");
        expect(bos).not.toContain("BosSmoke");
        expect(constants).toContain("BOS_WORKSPACE_DRAWER_WIDTH");
        expect(constants).toContain("BOS_WORKSPACE_DRAWER_HEIGHT");
        expect(constants).toContain("BOS_WORKSPACE_BAND_BACKDROP_STYLE");
        expect(constants).toContain("CREATE_LEAD_WORKSPACE_TITLE");
        expect(geometry).toContain("measureAndApplyActionWorkspaceGeometry");
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
        expect(loader).toContain("BosExecutionLoaderVariant");
        expect(loader).toContain('"inline"');
        expect(loader).toContain('"panel"');
        expect(loader).toContain('"fullscreen"');
        expect(loader).toContain('"drawer"');
        expect(loader).toContain("data-bos-execution-loader");
        expect(loader).toContain("AlloyIdentityLoader");
        expect(loader).not.toContain("ActionWorkspaceBosNeuralPulse");
        expect(loader).toContain("Create Lead");
        expect(loader).toContain("Schedule Tour");
        expect(loader).toContain("BOS_EXECUTION_LOADER_PHASES_SEND_WELCOME");
        expect(loader).toContain("BOS_EXECUTION_LOADER_DEFAULT_TITLE");
        expect(loader).not.toContain("animate-spin");
        expect(execute).toContain("BosExecutionLoader");
        expect(execute).toContain('variant="fullscreen"');
    });

    it("action execution modals use BosExecutionLoader instead of generic spinners", () => {
        const addChild = read("components/admin/opportunity/actions/AddInquiryChildModal.tsx");
        const scheduleTour = read("components/admin/opportunity/actions/ScheduleTourActionFormModal.tsx");
        const drawerOpening = read("components/admin/OpportunityDrawerOpeningOverlay.tsx");
        expect(addChild).toContain("BosExecutionLoader");
        expect(addChild).toContain("BOS_EXECUTION_LOADER_PHASES_ADD_CHILD");
        expect(scheduleTour).toContain("BosExecutionLoader");
        expect(scheduleTour).toContain("BOS_EXECUTION_LOADER_PHASES_SCHEDULE_TOUR");
        expect(drawerOpening).toContain("AlloyCanonicalLoadingSurface");
        expect(drawerOpening).not.toContain("BosExecutionLoader");
        expect(drawerOpening).not.toContain("animate-spin");
    });

    it("BOS action workspace uses BosMark identity not sparkle icons", () => {
        const shell = read("components/admin/actions/ActionWorkspaceBosShell.tsx");
        const banner = read("components/admin/actions/ActionWorkspaceBosBanner.tsx");
        const success = read("components/admin/actions/ActionWorkspaceSuccessState.tsx");
        const paste = read("components/admin/actions/ActionWorkspacePasteCanvas.tsx");
        expect(shell).toContain("BosHeader");
        expect(shell).toContain('size="lg"');
        expect(shell).toContain("BOS_ACTION_WORKSPACE_VIEWPORT_SCRIM_STYLE");
        expect(shell).toContain("data-action-workspace-viewport-scrim");
        expect(shell).not.toMatch(
            /className="[^"]*action-workspace-bos-drawer-panel[^"]*bos-workspace-shell/,
        );
        expect(banner).toContain("BosMark");
        expect(success).toContain("BosMark");
        expect(paste).toContain("BosRevealSequence");
        expect(paste).toContain("BosButton");
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
        expect(modal).toContain("fetchActionIntakeSpec");
        expect(modal).toContain("validateCreateLeadFromIntakeSpec");
        expect(modal).toContain("validateCreateLeadPlatformMinimum");
        expect(modal).toContain("gatherPhase");
        expect(modal).toContain("Create Lead");
        expect(modal).toContain("CreateLeadOperationalIntake");
        expect(modal).not.toContain("Review details");
        expect(modal).toContain("resolveCreateLeadPostCreateRecommendations");
        expect(modal).toContain("mapBosRecommendationsToSuccessActions");
        expect(modal).toContain("CreateLeadOperationalIntake");
        expect(modal).not.toContain("ActionWorkspacePasteCanvas");
        expect(modal).toContain("onCreated");
        expect(modal).toContain("householdLabel");
        expect(modal).toContain("bosRecommendations");
    });

    it("review summary is read-only", () => {
        const review = read("components/admin/actions/ActionWorkspaceReviewSummary.tsx");
        expect(review).not.toContain("onChange");
        expect(review).toContain("Read-only summary");
    });

    it("persistent command rail renders executable action rows", () => {
        const list = read("app/adminV2/components/workspace/CommandRailExecutableActionList.tsx");
        const section = read("app/adminV2/components/workspace/WorkspaceCommandRailActionsSection.tsx");
        const css = read("app/adminV2/adminV2.css");
        expect(list).toContain("adminv2-command-rail-executable-action");
        expect(list).toContain("ChevronRight");
        expect(section).toContain("executableRows");
        expect(css).toContain("adminv2-command-rail-executable-actions");
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
            location_id: "site-1",
        });
        expect(guidance.ready).toBe(true);
        expect(guidance.headline).toContain("create this lead");
    });

    it("lists missing required fields for manual entry", async () => {
        const { resolveCreateLeadBosGuidance } = await import("@/lib/admin/actions/createLeadBosGuidance");
        const guidance = resolveCreateLeadBosGuidance({ first_name: "Jordan" });
        expect(guidance.ready).toBe(false);
        expect(guidance.missingItems).toContain("Parent/Guardian Last Name");
        expect(guidance.missingItems).toContain("contact method");
    });

    it("surfaces optional advisory fields when manual entry is otherwise valid", async () => {
        const { resolveCreateLeadBosGuidance } = await import("@/lib/admin/actions/createLeadBosGuidance");
        const guidance = resolveCreateLeadBosGuidance({
            first_name: "Jordan",
            last_name: "Lee",
            email: "jordan@example.com",
            location_id: "site-1",
        });
        expect(guidance.ready).toBe(true);
        expect(guidance.advisoryItems).toContain("child information");
        expect(guidance.advisoryItems).toContain("program interest");
        expect(guidance.advisoryItems).toContain("source");
    });

    it("structures post-create recommendations with readiness and blocking requirements", async () => {
        const { resolveCreateLeadPostCreateRecommendations } = await import(
            "@/lib/admin/actions/resolveCreateLeadPostCreateRecommendations"
        );
        const { mapBosRecommendationsToSuccessActions } = await import(
            "@/lib/admin/actions/mapBosRecommendationsToSuccessActions"
        );
        const sparse = resolveCreateLeadPostCreateRecommendations(
            {
                first_name: "Jordan",
                last_name: "Lee",
                child_date_of_birth: "",
            },
            { availableActionKeys: ["schedule_tour", "send_welcome_email"] },
        );
        const scheduleSparse = sparse.find((r) => r.key === "schedule-tour");
        expect(scheduleSparse?.reason).toBe("Needs child/program info");
        expect(scheduleSparse?.readiness).toBe("blocked");
        expect(scheduleSparse?.blockingRequirements).toContain("Child name");
        expect(
            sparse.some(
                (r) => r.key === "required-info:child_date_of_birth" && r.reason.includes("Required Information")
            )
        ).toBe(true);

        const actions = mapBosRecommendationsToSuccessActions(sparse, { onOpenLead: () => {} });
        expect(actions.find((a) => a.id === "schedule-tour")?.disabled).toBe(true);
        expect(actions.find((a) => a.id === "send-welcome")?.status).toBe("Available after opening lead");
        expect(actions.find((a) => a.id === "open-lead")?.disabled).toBeFalsy();

        const ready = resolveCreateLeadPostCreateRecommendations(
            {
                first_name: "Jordan",
                last_name: "Lee",
                child_first_name: "Sam",
                child_program: "prog-1",
                location_id: "loc-1",
                child_desired_start_date: "2026-09-01",
            },
            { availableActionKeys: ["schedule_tour", "send_welcome_email"] },
        );
        expect(ready.find((r) => r.key === "schedule-tour")?.readiness).toBe("ready");
        expect(ready.find((r) => r.key === "schedule-tour")?.reason).toBe("Available after opening lead");
        expect(ready.find((r) => r.key === "send-welcome")?.readiness).toBe("ready");

        const unconfigured = resolveCreateLeadPostCreateRecommendations(
            {
                first_name: "Jordan",
                last_name: "Lee",
                child_first_name: "Sam",
                child_program: "prog-1",
                location_id: "loc-1",
            },
            { availableActionKeys: [] },
        );
        expect(unconfigured.some((r) => r.key === "schedule-tour")).toBe(false);
        expect(unconfigured.some((r) => r.key === "send-welcome")).toBe(false);
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
            location_id: "site-1",
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

/**
 * @vitest-environment node
 */
describe("CreateLeadActionWorkspace render", () => {
    it("renders gather step with two-column operational intake", () => {
        const html = renderToStaticMarkup(
            createElement(CreateLeadModal, {
                open: true,
                departmentId: "dept-1",
                onClose: () => {},
                onSubmit: vi.fn(),
            }),
        );

        expect(html).toContain('data-testid="create-lead-action-workspace"');
        expect(html).toContain('data-action-workspace-shell="bos"');
        expect(html).toContain('data-action-workspace-presentation="workspace-drawer"');
        expect(html).toContain('data-action-workspace-bos-workspace="true"');
        expect(html).toContain('data-action-workspace-header-tone="integrated"');
        expect(html).toContain('data-testid="create-lead-gather-step"');
        expect(html).toContain('data-testid="create-lead-operational-intake"');
        expect(html).toContain('data-create-lead-column="material"');
        expect(html).toContain('data-create-lead-column="draft-lead"');
        expect(html).not.toContain('data-create-lead-column="bos-suggestions"');
        expect(html).not.toContain('data-create-lead-column="guidance"');
        expect(html).not.toContain('data-create-lead-column="findings"');
        expect(html).not.toContain('data-testid="action-workspace-paste-canvas"');
        expect(html).not.toContain('data-testid="create-lead-review-step"');
        const stack = read("components/admin/actions/CreateLeadMaterialStackColumn.tsx");
        expect(stack).toContain("Analyze with BOS");
        expect(stack).not.toContain("Add to stack");
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
                location_id: "site-1",
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
                location_id: "site-1",
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
