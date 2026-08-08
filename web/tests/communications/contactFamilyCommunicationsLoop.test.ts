import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    composerMarkupToEmailHtml,
    composerMarkupToPlainText,
    formatComposerBodyForDisplay,
} from "@/lib/communications/v2/familyWorkspace/composerBodyMarkup";
import {
    buildContactFamilySendSuccessMessage,
    buildContactFamilySendFollowOnNotice,
    ADMIN_V2_CONTACT_FAMILY_SEND_COMPLETE,
} from "@/lib/communications/v2/familyWorkspace/contactFamilySendComplete";
import { filterResidualOperationalTasks } from "@/lib/lifecycle/filterResidualOperationalTasks";
import type { InquirySummaryTaskPreviewPayload } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

const webRoot = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("Contact Family → Communications loop", () => {
    it("Focus Panel Activity Work Items keeps Contact Family (same work identity as global WI)", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).toContain("tasks_raw");
        expect(compose).not.toContain("filterResidualOperationalTasks");

        const preview: InquirySummaryTaskPreviewPayload = {
            state: "loaded",
            open_count: 2,
            open_tasks: [
                {
                    id: "work-cf",
                    title: "Contact Family",
                    due_at: "",
                    status: "open",
                    source: "manual",
                    work_intent_key: "contact_family",
                },
                {
                    id: "adhoc-1",
                    title: "Send brochure",
                    due_at: "",
                    status: "open",
                    source: "task_assist",
                },
            ],
        };
        // Residual helper still strips stage-work for callers that want follow-ups only.
        const stageRuntime = {
            stage_key: "lead",
            template_keys: ["contact_family"],
            primary: {
                work_id: "work-cf",
                template_key: "contact_family",
                label: "Contact Family",
                state: "open",
            },
            additional: [],
        } as unknown as StageWorkRuntimeProjection;
        const residual = filterResidualOperationalTasks(preview, stageRuntime);
        expect(residual.open_tasks.map((t) => t.id)).toEqual(["adhoc-1"]);
        // Unfiltered preview retains Contact Family identity for Activity Work Items.
        expect(preview.open_tasks.find((t) => t.id === "work-cf")?.title).toBe("Contact Family");
    });

    it("family-send associates Contact Family work after confirmed send only", () => {
        const route = read("app/api/admin/communications/family-send/route.ts");
        expect(route).toContain("associateOutboundCommunicationToContactAttempt");
        expect(route).toContain("opportunity_id");
        expect(route).toContain("confirm &&");
        expect(route).toContain("result.summary.sent > 0");
        expect(route).not.toContain("stage transition");
    });

    it("Current Work entryContext skips thread open and refreshes Focus Panel", () => {
        const runtime = read("lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime.ts");
        expect(runtime).toContain('entryContext?: "current_work"');
        expect(runtime).toContain('fromCurrentWork = input.entryContext === "current_work"');
        expect(runtime).toContain("dispatchContactFamilySendComplete");
        expect(runtime).toContain("dispatchOperationalWorkRefresh");
        expect(runtime).toContain("dispatchOpportunityDrawerScopedUpdate");

        const panel = read("components/admin/focusPanel/cards/CurrentWorkActionPanel.tsx");
        expect(panel).toContain('entryContext="current_work"');

        const card = read("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(card).toContain("ADMIN_V2_CONTACT_FAMILY_SEND_COMPLETE");
        expect(card).toContain("setHandoffNotice");
        expect(card).toContain("closeActionPanel");
    });

    it("send review replaces Send footer with Confirm send only", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toContain('sendResult?.mode === "preflight"');
        expect(view).toContain("Ready to send");
        expect(view).toContain("Confirm send");
        expect(view).toContain("Back to edit");
        expect(view).toContain("data-cc-send-confirm=");
        expect(view).toContain("data-cc-send-confirm-preview");
        expect(view).toContain('data-cc-composer-footer');
        expect(view).toMatch(/!\(LIVE_WORKSPACE && sendResult\?\.mode === "preflight"\)/);
        // Preflight must not leave the normal Send / Send later / BOS footer visible.
        expect(view).not.toMatch(/preflight[\s\S]{0,200}Send SMS/);
    });

    it("success copy names channel and recipient without inferring outcomes", () => {
        expect(
            buildContactFamilySendSuccessMessage({ channel: "email", recipientLabel: "Kelly Kurzman" }),
        ).toBe("Email sent to Kelly Kurzman");
        expect(buildContactFamilySendSuccessMessage({ channel: "sms", recipientLabel: null })).toBe("SMS sent");
        expect(ADMIN_V2_CONTACT_FAMILY_SEND_COMPLETE).toBe("adminv2:contact-family-send-complete");
    });

    it("post-send follow-on explains attempt-only when associated as left_message", () => {
        expect(
            buildContactFamilySendFollowOnNotice({ associated: true, outcome_key: "left_message" }),
        ).toMatch(/stays open/i);
        expect(buildContactFamilySendFollowOnNotice({ associated: false })).toBeNull();
        const card = read("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(card).toContain("buildContactFamilySendFollowOnNotice");
    });

    it("What's Next presents dominant action separately from supporting commands", () => {
        const card = read("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(card).toContain("alloy-os-currentwork__context-action-row");
        expect(card).toContain("data-work-primary-action");
        expect(card).toContain("CurrentWorkTourGroupedActions");
        expect(card).toContain("CurrentWorkContextStrip");
        expect(card).toContain("View all activity");
        expect(card).not.toContain("View all activity →");
        expect(card).toContain("Record outcome");
        expect(card).not.toContain("Record outcome →");
        expect(card).toContain("data-work-recent-activity");
        expect(card).toContain("data-work-still-activity-row");
        expect(card).toContain("alloy-os-currentwork__record-outcome-link");
        expect(card).not.toContain("View details →");
        const strip = read("components/admin/focusPanel/cards/CurrentWorkContextStrip.tsx");
        expect(strip).toContain("formatTaskDueDate");
        expect(strip).toContain("identity-field-value__label--eyebrow");
        expect(strip).toContain("identity-field-grid");
        expect(strip).not.toContain("alloy-os-currentwork__context-inline");
        const readiness = read("components/admin/focusPanel/cards/CurrentWorkReadinessSummary.tsx");
        expect(readiness).not.toContain("readiness-owner-arrow");
        expect(readiness).not.toMatch(/>\s*→\s*</);
        expect(strip).not.toContain("Results that advance");
        expect(strip).not.toContain("context-purpose");
        const focused = read("components/admin/focusPanel/cards/CurrentWorkFocusedSurface.tsx");
        expect(focused).toContain("alloy-os-currentwork__primary-stack");
        expect(focused).toContain("data-work-supporting-row");
    });

    it("Activity Work Items expose Open work → Focus Current Work", () => {
        const popover = read("components/layout/queueRecord/LayoutRuntimeTaskDetailPopover.tsx");
        expect(popover).toContain("dispatchFocusCurrentWork");
        expect(popover).toContain("Open work");
        expect(popover).toContain("data-layout-runtime-task-open-work");
        expect(popover).not.toMatch(/Source:\s*\{/);
        const widget = read("components/layout/LayoutRuntimeTasksWidget.tsx");
        expect(widget).toContain("opportunityId");
        expect(widget).toContain("min-w-0");
    });

    it("renames BOS Assist to BOS and keeps footer button sizing aligned", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toMatch(/aria-label="BOS"/);
        expect(view).toMatch(/>\s*BOS\s*</);
        expect(view).not.toContain("BOS Assist");
        expect(view).toContain("activityPrimaryBtnClass");
        expect(view).toContain("activitySecondaryBtnClass");

        const cluster = read("components/adminV2/messaging/ComposerReplyActionCluster.tsx");
        expect(cluster).toContain('label="BOS"');
        expect(cluster).not.toContain("BOS Assist");
    });

    it("email markup renders bold/italic/underline; SMS stays plain", () => {
        const email = composerMarkupToEmailHtml("**Hello** _doing_ __now__");
        expect(email.ok).toBe(true);
        if (email.ok) {
            expect(email.html).toContain("<strong>Hello</strong>");
            expect(email.html).toContain("<em>doing</em>");
            expect(email.html).toContain("<u>now</u>");
        }
        expect(composerMarkupToPlainText("**Hello** _doing_")).toBe("Hello doing");
        const smsDisplay = formatComposerBodyForDisplay("**Hello**", "sms");
        expect(smsDisplay.kind).toBe("text");
        if (smsDisplay.kind === "text") expect(smsDisplay.text).toBe("Hello");
        const emailDisplay = formatComposerBodyForDisplay("**Hello**", "email");
        expect(emailDisplay.kind).toBe("html");
        if (emailDisplay.kind === "html") expect(emailDisplay.html).toContain("<strong>Hello</strong>");
    });

    it("email composer uses contenteditable; SMS uses plain textarea", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toContain('data-cc-email-composer="true"');
        expect(view).toContain("contentEditable");
        expect(view).toContain('disabled={workspaceMode === "sms"}');
        expect(view).toContain("document.execCommand(\"bold\")");
    });
});
