import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    buildFocusPanelContextChips,
    buildFocusPanelContextChipsFromQueuePreviewSeed,
    formatFocusPanelChipLabel,
    formatFocusPanelChipLabelDisplay,
    formatFocusPanelDisplayLabel,
    isFocusPanelDebugMissionCopy,
    resolveFocusPanelMissionDisplay,
    resolveFocusPanelProcessLabel,
    resolveFocusPanelStatusTone,
    resolveQueuePreviewSeedIdentitySummaryLine,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";
import {
    FOCUS_PANEL_SUPPRESS_HEADER_STAGE_CTA,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelHeaderActions";

const webRoot = join(process.cwd());
const repoRoot = join(process.cwd(), "..");

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

function readDoc(rel: string): string {
    return readFileSync(join(repoRoot, rel), "utf8");
}

describe("focusPanelDisplayLabels", () => {
    it("humanizes raw status keys as Title Case chips", () => {
        expect(formatFocusPanelChipLabel("new_inquiry")).toBe("New Lead");
        expect(formatFocusPanelChipLabel("at-risk")).toBe("At Risk");
        expect(formatFocusPanelChipLabel("ready")).toBe("Ready");
        expect(formatFocusPanelChipLabel("blocked")).toBe("Blocked");
    });

    it("chip display helper returns Title Case not ALL CAPS", () => {
        expect(formatFocusPanelChipLabelDisplay("at-risk")).toBe("At Risk");
        expect(formatFocusPanelChipLabelDisplay("ready")).toBe("Ready");
        expect(formatFocusPanelChipLabelDisplay("ready")).not.toBe("READY");
    });

    it("filters debug mission copy", () => {
        expect(isFocusPanelDebugMissionCopy("Mission proof for current stage")).toBe(true);
        expect(isFocusPanelDebugMissionCopy("visual review capture")).toBe(true);
        expect(isFocusPanelDebugMissionCopy("Schedule tour with family")).toBe(false);
    });

    it("resolves mission display without debug strings", () => {
        expect(
            resolveFocusPanelMissionDisplay({
                perspectiveMission: "Mission proof for lead",
                stagePurpose: "Schedule tour with family",
            })?.value,
        ).toBe("Schedule tour with family");
    });

    it("resolves process label from record", () => {
        expect(resolveFocusPanelProcessLabel({ _work_unit_label: "Enrollment" })).toBe("Enrollment");
    });

    it("formats display labels for read-only status chip", () => {
        expect(formatFocusPanelDisplayLabel("new_inquiry")).toBe("New Lead");
    });

    it("builds context chips for status, process, and location", () => {
        const chips = buildFocusPanelContextChips({
            statusLabel: "New Lead",
            statusKey: "new_inquiry",
            processLabel: "Enrollment",
            locationLabel: "Downtown Campus",
        });
        expect(chips).toHaveLength(3);
        expect(chips[0]).toMatchObject({ label: "New Lead", kind: "status", tone: "due" });
        expect(chips[1]).toMatchObject({ label: "Enrollment", kind: "process" });
        expect(chips[2]).toMatchObject({ label: "Downtown Campus", kind: "location" });
    });

    it("builds seed-backed context chips for cold Focus Panel open", () => {
        const chips = buildFocusPanelContextChipsFromQueuePreviewSeed({
            title: "Jordan Lee",
            statusLabel: "New Lead",
            statusKey: "new_lead",
            stageLabel: "New Leads",
            locationLabel: "North Campus",
        });
        expect(chips).toHaveLength(3);
        expect(chips.map((chip) => chip.label)).toEqual(["New Lead", "New Leads", "North Campus"]);
    });

    it("resolves queue preview seed identity summary from attention/work or contact", () => {
        expect(
            resolveQueuePreviewSeedIdentitySummaryLine({
                title: "Jordan Lee",
                operTrustHeadline: "Tour follow-up overdue",
                subtitle: "Sam Parent",
            }),
        ).toBe("Tour follow-up overdue");
        expect(
            resolveQueuePreviewSeedIdentitySummaryLine({
                title: "Jordan Lee",
                subtitle: "Sam Parent",
            }),
        ).toBe("Sam Parent");
    });

    it("maps status keys to System 5 chip tones", () => {
        expect(resolveFocusPanelStatusTone("ready")).toBe("ready");
        expect(resolveFocusPanelStatusTone("new_inquiry")).toBe("due");
        expect(resolveFocusPanelStatusTone("blocked")).toBe("blocked");
    });
});

describe("Focus Panel header composition guards", () => {
    it("compact header does not render SUBJECT meta label", () => {
        const header = readSrc("components/admin/focusPanel/FocusPanelCompactHeader.tsx");
        expect(header).not.toContain("alloy-os-fp-header-compact__subject-label");
        expect(header).not.toContain(">Subject<");
        const identity = readSrc("components/admin/focusPanel/FocusPanelSubjectIdentityBlock.tsx");
        expect(identity).not.toContain(">Subject<");
    });

    it("renders subject identity tile and context chips", () => {
        const identity = readSrc("components/admin/focusPanel/FocusPanelSubjectIdentityBlock.tsx");
        expect(identity).toContain("data-focus-panel-subject-tile");
        expect(identity).toContain("alloy-os-fp-header-compact__subject-tile");
        expect(identity).toContain("alloy-os-fp-header-compact__context-chip");
        expect(identity).toContain('data-focus-panel-chip-kind={chip.kind}');
        expect(identity).not.toContain("alloy-os-fp-header-compact__context-suffix");
        expect(identity).not.toContain("alloy-os-fp-header-compact__context-sep");
    });

    it("status appears once as read-only chip not loose text", () => {
        const identity = readSrc("components/admin/focusPanel/FocusPanelSubjectIdentityBlock.tsx");
        expect(identity).toContain("data-focus-panel-status-readonly");
        expect(identity).not.toContain("VmProgressiveStatusDropdown");

        const opportunity = readSrc("components/admin/focusPanel/OpportunityFocusPanelHeader.tsx");
        expect(opportunity).not.toContain("VmProgressiveStatusDropdown");
        expect(opportunity).toContain("buildFocusPanelContextChips");
        expect(opportunity).not.toContain("contextSuffix");
    });

    it("process is rendered as context chip", () => {
        const opportunity = readSrc("components/admin/focusPanel/OpportunityFocusPanelHeader.tsx");
        expect(opportunity).toContain("resolveFocusPanelProcessLabel");
        expect(opportunity).toContain("processLabel");
        expect(opportunity).toContain("buildFocusPanelContextChips");
    });

    it("does not render Move to qualification or other stage-movement header CTAs", () => {
        expect(FOCUS_PANEL_SUPPRESS_HEADER_STAGE_CTA).toBe(true);

        const compact = readSrc("components/admin/focusPanel/FocusPanelCompactHeader.tsx");
        expect(compact).not.toContain("primaryAction");
        expect(compact).not.toContain("alloy-os-fp-header-compact__primary-btn");

        const opportunity = readSrc("components/admin/focusPanel/OpportunityFocusPanelHeader.tsx");
        expect(opportunity).not.toContain("showPrimaryHeaderAction");
        expect(opportunity).not.toContain("onPrimaryHeaderAction(");
        expect(opportunity).not.toContain("alloy-os-fp-header-compact__primary-btn");
        expect(opportunity).not.toContain("primaryHeaderAction={");
    });

    it("header carries no mission/action cue (it must not compete with the cards)", () => {
        const identity = readSrc("components/admin/focusPanel/FocusPanelSubjectIdentityBlock.tsx");
        expect(identity).not.toContain("alloy-os-fp-header-compact__mission-row");
        expect(identity).not.toContain("alloy-os-fp-header-compact__mission-value");
        expect(identity).not.toContain(">Mission<");
        const opportunity = readSrc("components/admin/focusPanel/OpportunityFocusPanelHeader.tsx");
        expect(opportunity).not.toContain("resolveFocusPanelMissionDisplay");
        expect(opportunity).not.toContain("mission={");
    });

    it("Focus Panel header omits BOS (floating chat owns it) and keeps Manage", () => {
        const header = readSrc("components/admin/focusPanel/OpportunityFocusPanelHeader.tsx");
        expect(header).toContain("hideBos");
        expect(header).not.toContain("FOCUS_PANEL_HEADER_BOS_LABEL");
        expect(header).not.toContain("bosAssistLabel=");
        expect(header).toContain("onSubjectManageActionSelect");
        expect(header).toContain("buildSubjectManageMenuFromResolvedActions");
        expect(header).toContain("displayVm.actions.header_menu");
        expect(header).not.toContain("buildRecordManageMenuForEntity");
        expect(header).not.toContain("Duplicate Lead");

        const controls = readSrc("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(controls).toContain("hideBos");
        expect(controls).toContain("BosDrawerAssistCta");

        const bos = readSrc("components/admin/drawer/BosDrawerAssistCta.tsx");
        expect(bos).toContain("BosMark");
        expect(bos).toContain("leadingIcon");
        expect(bos).toContain("label?: string");
    });

    it("mode selected state uses Bend Pine classes", () => {
        const mode = readSrc("components/admin/focusPanel/FocusPanelModeSwitch.tsx");
        expect(mode).toContain("data-focus-panel-mode-selected");
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain("--alloy-os-bend-pine");
        expect(css).toContain("alloy-os-focus-panel-mode-switch__tab--active");
        expect(css).toMatch(/alloy-os-focus-panel-mode-switch__tab--active[\s\S]*font-weight: 600/);
    });

    it("UniversalCard shared shell uses soft perimeter + layered elevation tokens (no decorative left rails)", () => {
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain("--alloy-os-fp-card-border");
        expect(css).toContain("--alloy-os-fp-card-shadow");
        expect(css).toContain("--alloy-os-fp-card-shadow-hover");
        // ~8% stronger perimeter (22% → 30% midnight mix) without changing white cards / shadow.
        expect(css).toMatch(
            /--alloy-os-fp-card-border:\s*color-mix\(in srgb, var\(--alloy-os-midnight[^)]*\)\s*30%/,
        );
        expect(css).toMatch(/\.alloy-os-ucard\s*\{[^}]*box-shadow:\s*var\(--alloy-os-fp-card-shadow/);
        expect(css).toMatch(
            /\.alloy-os-ucard--tier-work,\s*\n\.alloy-os-ucard\[data-card-role="active-work"\]\s*\{\s*\n\s*border-left-width:\s*1px;/,
        );
        // What's Next / work cards must not keep Bend Pine accent rails.
        expect(css).not.toMatch(
            /\.alloy-os-currentwork\[data-work-card-perspective="summary"\][\s\S]{0,120}border-left:\s*4px\s+solid\s+var\(--alloy-os-bend-pine/,
        );
        expect(css).not.toMatch(
            /data-card-role="active-work"\][\s\S]{0,160}inset\s+2px\s+0\s+0\s+0\s+color-mix\(in\s+srgb,\s*var\(--alloy-os-bend-pine/,
        );
    });

    it("What's Next summary adds breath between description, actions, and Still Needed", () => {
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain(".alloy-os-currentwork__summary-controls");
        expect(css).toMatch(
            /\.alloy-os-currentwork__summary-controls\s*\{[^}]*gap:\s*14px/,
        );
        expect(css).toMatch(
            /\.alloy-os-ucard\[data-universal-card-key="current_work"\] \.alloy-os-ucard__body\s*\{[^}]*padding-top:\s*6px/,
        );
    });

    it("queue row shell uses lighter soft-depth tokens (not Focus Panel shadow intensity)", () => {
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        const shell = readSrc("lib/presentation/runtime/queueRowCardShell.ts");
        expect(shell).toContain("alloy-os-queue-row-card");
        expect(css).toContain(".alloy-os-queue-row-card");
        expect(css).toContain("--alloy-os-queue-row-shadow");
        expect(css).toMatch(
            /\.alloy-os-queue-row-card\s*\{[^}]*box-shadow:\s*var\(--alloy-os-queue-row-shadow/,
        );
        // ~30% lighter shade vs Focus Panel card shadow opacities.
        expect(css).toMatch(/--alloy-os-queue-row-shadow:[\s\S]*?0\.05/);
        expect(css).toContain("--alloy-os-fp-card-shadow");
    });

    it("header identity uses System 5 chip language", () => {
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain("alloy-os-fp-header-compact__subject-tile");
        expect(css).toContain("alloy-os-fp-header-compact__context-chip--tone-ready");
        expect(css).toContain("alloy-os-ucard__status--ready");
    });

    it("header actions share normalized button treatment", () => {
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain("--fp-header-btn-h");
        expect(css).toContain("[data-bos-assist-button=\"true\"]");
        expect(css).toContain("alloy-os-fp-header-compact__context-chip");
    });
});

describe("Enrollment Freeze — depth + overlay polish", () => {
    it("focus cards have a reverse-zoom dismiss (closing) animation", () => {
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain("@keyframes alloy-os-fp-card-zoom-out");
        expect(css).toContain('data-fp-closing="true"');
        const grid = readSrc("components/admin/focusPanel/FocusPanelCardGrid.tsx");
        expect(grid).toContain("data-fp-closing");
        const host = readSrc("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        expect(host).toContain("closing={closing}");
    });

    it("inline overlays open downward only — no upward variant", () => {
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(css).not.toContain('data-overlay-direction="up"');
        const overlay = readSrc("components/admin/focusPanel/cards/CardInlineOverlay.tsx");
        // Direction is invariant ("down"); constrained space scrolls into view.
        expect(overlay).toContain('data-overlay-direction="down"');
        expect(overlay).toContain("scrollIntoView");
        expect(overlay).not.toContain('"up"');
    });
});

describe("Surface Builder composer chrome", () => {
    it("keeps remove/configure controls above the drag bar hit target", () => {
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toMatch(/\.alloy-os-fp-composer-cell__chrome\s*\{[^}]*z-index:\s*8/);
        expect(css).toMatch(/\.alloy-os-fp-composer-cell__drag-bar\s*\{[^}]*z-index:\s*6/);
        // Drag bar ends before the stable top-right Configure toolbar.
        expect(css).toMatch(/\.alloy-os-fp-composer-cell__drag-bar\s*\{[^}]*right:\s*156px/);
        expect(css).toContain("alloy-os-fp-composer-cell__toolbar");
        expect(css).toMatch(/\.alloy-os-fp-composer-cell__configure\s*\{[^}]*opacity:\s*0\.78/);
        const composer = readSrc("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");
        expect(composer).toContain("onRemove");
        expect(composer).toContain("removeArea");
        expect(composer).toContain("alloy-os-fp-composer-cell__toolbar");
    });

    it("Linked card host ignores mount-time base reports and clears on dismiss", () => {
        const host = readSrc("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        expect(host).toContain('visibilityByCardKey.get(card) === "linked"');
        expect(host).toContain("setActiveDepth((prev) => (prev?.card === card ? null : prev))");
        expect(host).toContain("alloy-os-focus-panel-linked-host");
        const composer = readSrc("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");
        expect(composer).toContain('entry.visibility ?? "visible") === "visible"');
        expect(composer).toContain("toRemove");
        expect(composer).toContain("toAdd");
    });

    it("top-pins elevated cards for all composer depth states (not vertically centered)", () => {
        const css = readSrc("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toMatch(
            /\[data-fp-composer-depth-active="true"\][\s\S]*\.alloy-os-ucard\s*\{[^}]*top:\s*12px/,
        );
        expect(css).toContain("alloy-os-focus-panel-linked-host");
        expect(css).toMatch(
            /\.alloy-os-focus-panel-linked-host\s*\{[^}]*align-items:\s*start/,
        );
        expect(css).not.toMatch(
            /\.alloy-os-focus-panel-linked-host\s*\{[^}]*place-items:\s*center/,
        );
        // Linked host matches Visible Focus Card frost (not a dark modal dim).
        expect(css).toMatch(
            /\.alloy-os-focus-panel-linked-host__backdrop\s*\{[^}]*rgba\(255,\s*255,\s*255/,
        );
        expect(css).not.toMatch(
            /\.alloy-os-focus-panel-linked-host__backdrop\s*\{[^}]*alloy-os-midnight/,
        );
    });

    it("Assignments work surface uses Focus Card back chrome, not a modal close ✕", () => {
        const card = readSrc("components/admin/focusPanel/cards/SchedulingCard.tsx");
        expect(card).not.toContain('data-schedule-close="true"');
        expect(card).toContain("data-schedule-back");
        expect(card).toContain("alloy-os-ucard__action--system5");
    });
});

describe("Targeted contact editing + depth history (QA)", () => {
    it("Household has per-row edit affordances, not a global Edit contact link", () => {
        const card = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
        const summary = readSrc("components/admin/focusPanel/identity/IdentityRecordSummary.tsx");
        expect(summary).toContain("data-household-edit-contact"); // per-row affordance
        expect(card).toContain("setEditingPersonId"); // targeted edit state
        expect(card).not.toContain('data-household-action="edit"'); // global link removed
        expect(card).toContain('requestFocus("children", childId, source)'); // handoff records source
        const edit = readSrc("components/admin/focusPanel/cards/HouseholdContactEdit.tsx");
        expect(edit).toContain("Edit ${personName}"); // edit names the target
    });

    it("child rows in Household do not use the edit path (belonging-only handoff)", () => {
        const card = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
        // child rows render via onOpenChild (handoff), never onEditContact / ContactRow.
        expect(card).toContain("onOpenChild");
        expect(card).toContain("Belonging only");
    });

    it("Children Back returns to the prior card via depth history", () => {
        const children = readSrc("components/admin/focusPanel/cards/ChildrenCard.tsx");
        expect(children).toContain('data-children-action="back-to-source"');
        expect(children).toContain("coordination?.back?.()");
        expect(children).toContain("focusPanelCardBackLabel");
        const host = readSrc("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        expect(host).toContain("depthHistoryRef"); // local stack
        expect(host).toContain("previousFocus");
        expect(host).toContain("back"); // back() + coordination.back
        // No routing / drawer navigation for handoff back.
        expect(host).not.toContain("router.push");
    });
});

describe("Canvas builder mounted in the settings editor (Experience Builder V4)", () => {
    it("FocusPanelSummarySurfaceEditor mounts the canvas-first builder + persists via the existing flow", () => {
        const editor = readSrc("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx");
        expect(editor).toContain("FocusPanelRuntimeComposerCanvas"); // runtime-shaped composer is the editor canvas
        expect(editor).toContain("FocusPanelVisibilityZones"); // Visible / Linked compact overlays
        expect(editor).not.toContain("FocusPanelRowLayoutBuilder"); // the row-control panel is gone
        expect(editor).toContain("onSelectCard"); // selecting a card on the canvas opens the Inspector
        expect(editor).toContain("readFocusPanelPublishedLayout"); // loads existing metadata
        expect(editor).toContain("withPublishedLayoutMetadata"); // injects on save/publish
        expect(editor).toContain("buildDocWithLayout"); // reused by save AND publish
        expect(editor).toContain("saveFocusPanelSummaryDraft"); // existing draft path
        expect(editor).toContain("publishFocusPanelSummary"); // existing publish path
    });

    it("Canvas owns composition (drag + grid span resize); inspector owns behavior", () => {
        const canvas = readSrc("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");
        expect(canvas).toContain("alloy-os-fp-composer-cell__handle--w"); // right edge → span columns
        expect(canvas).toContain("alloy-os-fp-composer-cell__handle--h"); // bottom edge → span rows
        expect(canvas).toContain("alloy-os-fp-composer-cell__toolbar"); // stable top-right Configure
        expect(canvas).toContain("alloy-os-fp-composer-cell__configure");
        expect(canvas).toContain("moveArea"); // drag to move a region (snaps to grid)
        expect(canvas).toContain("resizeArea"); // edge drag resizes the region
        expect(canvas).toContain("onSelectCard"); // click selects → inspector
        /*
         * Composition is owned by the EXPLICIT CANDIDATE MODEL now. The canvas used
         * to import `snapMoveTarget` — a pointer→row→column inference the operator
         * could not see and six rounds of QA could not make predictable. It
         * enumerates the legal destinations, draws them, and commits the one the
         * pointer selected, so the guard is that those three are the same call.
         */
        expect(canvas).toContain("enumerateDropCandidates");
        expect(canvas).toContain("pickDropCandidate");
        expect(canvas).toContain("applyDropCandidate");
        expect(canvas).not.toContain("snapMoveTarget");
    });
});

describe("operational action doctrine", () => {
    it("documents pipeline and Withdraw Child invariant example", () => {
        const doc = readDoc("docs/platform/operator/operational-action-doctrine.md");
        expect(doc).toContain("Operational Action pipeline");
        expect(doc).toContain("Withdraw Child");
        expect(doc).toContain("active_schedule_must_end_on_or_before_withdrawal_date");
        expect(doc).toContain("update_schedule_end_date");
        expect(doc).toContain("Manage and command rail");
        expect(doc).toContain("not hardcoded UI logic");
    });
});
