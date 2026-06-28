import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    buildFocusPanelContextChips,
    formatFocusPanelChipLabel,
    formatFocusPanelChipLabelDisplay,
    formatFocusPanelDisplayLabel,
    isFocusPanelDebugMissionCopy,
    resolveFocusPanelMissionDisplay,
    resolveFocusPanelProcessLabel,
    resolveFocusPanelStatusTone,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";
import {
    FOCUS_PANEL_HEADER_BOS_LABEL,
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

    it("BOS header label is BOS with default variant and Manage remains present", () => {
        expect(FOCUS_PANEL_HEADER_BOS_LABEL).toBe("BOS");

        const header = readSrc("components/admin/focusPanel/OpportunityFocusPanelHeader.tsx");
        expect(header).toContain("FOCUS_PANEL_HEADER_BOS_LABEL");
        expect(header).toContain('bosAssistLabel={FOCUS_PANEL_HEADER_BOS_LABEL}');
        expect(header).toContain('bosActionVariant="default"');
        expect(header).toContain("onSubjectManageActionSelect");
        expect(header).toContain("buildSubjectManageMenuFromResolvedActions");
        expect(header).toContain("displayVm.actions.header_menu");
        expect(header).not.toContain("buildRecordManageMenuForEntity");
        expect(header).not.toContain("Duplicate Lead");

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
