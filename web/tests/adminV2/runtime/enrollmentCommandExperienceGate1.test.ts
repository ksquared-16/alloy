import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { polishTourCommsEmailHtml, renderTourCommsTemplate } from "@/lib/tours/comms/tourCommsTemplates";
import { resolveCurrentWorkActionSurface } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";

const webRoot = resolve(__dirname, "../../..");

describe("Tour invitation reusable prepare lifecycle", () => {
    it("sendTourInvitationAction uses a unique prepare key per invocation", () => {
        const src = readFileSync(
            resolve(webRoot, "lib/adminV2/actions/definitions/sendTourInvitationAction.ts"),
            "utf8",
        );
        expect(src).toContain("correlationId");
        expect(src).toContain("idempotency_key");
        expect(src).not.toMatch(
            /const idempotencyKey = `send_tour_invitation:\$\{ctx\.orgId\}:\$\{invocation\.entityId\}`;/,
        );
    });

    it("default invitation email is a concise booking CTA without option URL lists", () => {
        const rendered = renderTourCommsTemplate({
            eventKey: "tour_invitation",
            channel: "email",
            context: {
                orgName: "Firefly",
                locationName: "North Campus",
                parentName: "Kelly Kurzman",
                invitationActionUrl: "http://localhost:3015/a/Ab3X9k12",
                tourOptionsBlock: "SHOULD_NOT_APPEAR — http://localhost:3015/tour-booking/tok?option=x",
            },
        });
        expect(rendered?.channel).toBe("email");
        if (rendered?.channel !== "email") return;
        expect(rendered.bodyText).toContain("http://localhost:3015/a/Ab3X9k12");
        expect(rendered.bodyText).not.toContain("SHOULD_NOT_APPEAR");
        expect(rendered.bodyText).not.toContain("tour_options_block");
        const html = rendered.bodyHtml ?? polishTourCommsEmailHtml(
            `<p>${rendered.bodyText.replace(/\n/g, "<br/>")}</p>`,
        );
        expect(html).toMatch(/Book your tour/);
        expect(html).not.toMatch(/>http:\/\/localhost:3015\/a\/Ab3X9k12</);
    });
});

describe("Add Child Current Work host", () => {
    it("declares inline_form interaction host (capture-first, not Link/Create wizard)", () => {
        const def = canonicalActionDefinition("add_child");
        expect(def?.interactionHost).toBe("inline_form");
        expect(
            resolveCurrentWorkActionSurface({
                key: "add_child",
                handlerKey: "add_child",
                category: "supporting",
                actionRef: "add_child",
                resolved: null,
            }),
        ).toBe("inline_form");
        const panel = readFileSync(
            resolve(webRoot, "components/admin/focusPanel/cards/CurrentWorkActionPanel.tsx"),
            "utf8",
        );
        expect(panel).toContain("CurrentWorkAddChildPanel");
        const addPanel = readFileSync(
            resolve(webRoot, "components/admin/focusPanel/cards/CurrentWorkAddChildPanel.tsx"),
            "utf8",
        );
        expect(addPanel).not.toMatch(/Link existing \| Create new/);
        expect(addPanel).not.toContain("identityMode");
        expect(addPanel).toContain("bg-alloy-bend-pine");
        expect(addPanel).not.toContain("bg-alloy-pine");
        expect(addPanel).toContain("submitAddInquiryChildFromDrawer");
    });

    it("command-surface primary CTAs force Bend Pine in runtime CSS", () => {
        const css = readFileSync(resolve(webRoot, "app/adminV2/components/alloyOsRuntime.css"), "utf8");
        expect(css).toContain("[data-command-surface-primary]");
        expect(css).toContain("var(--alloy-os-bend-pine, #00a283)");
        const waitlist = readFileSync(
            resolve(webRoot, "components/admin/focusPanel/cards/CurrentWorkSubjectSelectorPanel.tsx"),
            "utf8",
        );
        expect(waitlist).toContain("bg-alloy-bend-pine");
        expect(waitlist).toContain("accent-alloy-bend-pine");
        const shell = readFileSync(
            resolve(webRoot, "components/platform/commands/CommandSurfaceShell.tsx"),
            "utf8",
        );
        expect(shell).toContain("bg-alloy-bend-pine");
    });
});

describe("Contact Family compact Current Work presentation", () => {
    it("scopes compact timeline CSS to current_work entry context", () => {
        const css = readFileSync(resolve(webRoot, "app/adminV2/components/alloyOsRuntime.css"), "utf8");
        expect(css).toContain('[data-cc-entry-context="current_work"]');
        expect(css).toContain("max-height: 9.5rem");
        const workspace = readFileSync(
            resolve(webRoot, "app/adminV2/communications/FamilyCommunicationWorkspace.tsx"),
            "utf8",
        );
        expect(workspace).toContain('data-cc-entry-context={props.entryContext');
    });
});
