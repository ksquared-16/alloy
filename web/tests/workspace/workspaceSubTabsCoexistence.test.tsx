/**
 * @vitest-environment jsdom
 */
/**
 * R13 — does the Communications-branded `data-workspace-section-tab` create real cross-surface coupling?
 *
 * `WorkspaceSubTabs` is the shared Layer-1 sub-section tab primitive (see components/workspace/
 * doctrine.ts). It is mounted by Communications, Operations, Digital Mailroom, Work Items and
 * Scheduling, and several of those surfaces reuse the same section keys. `InboxModal` renders the
 * Communications workspace shell as a MODAL over whatever workspace is already on screen, so two
 * instances genuinely share one document — which is the only situation where the shared attribute
 * could select the wrong owner.
 *
 * This measures selector matches on a real DOM instead of arguing from the name.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import WorkspaceSubTabs from "@/components/workspace/WorkspaceSubTabs";

// The real key sets, verbatim from each surface's section definitions.
const COMMUNICATIONS = ["overview", "inbox", "announcements", "scheduled", "templates", "channels", "rules"];
const OPERATIONS = ["roster", "attendance", "staff", "children", "types", "patterns", "validation"];
const MAILROOM = ["overview", "work", "forms", "packets", "fields", "branding"];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;

function mountBoth(aKeys: string[], aScope: string, bKeys: string[], bScope: string) {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <>
                {/* The workspace already on screen. */}
                <div data-workspace-mode-sections={aScope}>
                    <WorkspaceSubTabs
                        tabs={aKeys.map((k) => ({ key: k, label: k }))}
                        activeKey={aKeys[0]!}
                        onSelect={() => {}}
                        aria-label="Work sections"
                    />
                </div>
                {/* The Communications shell rendered inside InboxModal, over it. */}
                <div data-workspace-mode-sections={bScope}>
                    <WorkspaceSubTabs
                        tabs={bKeys.map((k) => ({ key: k, label: k }))}
                        activeKey={bKeys[0]!}
                        onSelect={() => {}}
                        aria-label="Work sections"
                    />
                </div>
            </>,
        );
    });
    return root;
}

afterEach(() => {
    container?.remove();
    container = null;
});

const scopeOf = (el: Element | null) =>
    el?.closest("[data-workspace-mode-sections]")?.getAttribute("data-workspace-mode-sections") ?? null;

describe("R13 — cross-surface selector behaviour of the shared sub-tab attribute", () => {
    it("1 + 2: every surface renders the same generic contract, and none renders the old name", () => {
        mountBoth(OPERATIONS, "roster", COMMUNICATIONS, "comms");
        expect(document.querySelectorAll("[data-workspace-section-tab]").length).toBe(
            OPERATIONS.length + COMMUNICATIONS.length,
        );
        expect(document.querySelectorAll("[data-workspace-section-tabs]").length).toBe(2);
        // The Communications-branded contract must be gone from the SHARED primitive. The separate,
        // genuinely Communications-owned `data-comms-tab-panel` is untouched and not asserted here.
        expect(document.querySelectorAll("[data-comms-tab]").length).toBe(0);
        expect(document.querySelectorAll("[data-comms-modal-tabs]").length).toBe(0);
    });

    it("4: active-state selection stays with the owning surface", () => {
        mountBoth(OPERATIONS, "roster", COMMUNICATIONS, "comms");
        const selected = [...document.querySelectorAll('[role="tab"][aria-selected="true"]')];
        expect(selected).toHaveLength(2);
        expect(selected.map((e) => e.getAttribute("data-workspace-section-tab"))).toEqual([
            OPERATIONS[0],
            COMMUNICATIONS[0],
        ]);
        expect(selected.map(scopeOf)).toEqual(["roster", "comms"]);
    });

    it("5 + 6: every tab remains natively focusable in document order, per surface", () => {
        mountBoth(OPERATIONS, "roster", COMMUNICATIONS, "comms");
        const tabs = [...document.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
        // Native <button> ordering is the keyboard/focus contract — the primitive adds no handler.
        for (const t of tabs) {
            expect(t.tagName).toBe("BUTTON");
            expect(t.hasAttribute("disabled")).toBe(false);
        }
        const last = tabs[tabs.length - 1]!;
        last.focus();
        expect(document.activeElement).toBe(last);
        expect(scopeOf(document.activeElement)).toBe("comms");
    });

    it("an UNSCOPED selector on a shared key matches both surfaces", () => {
        mountBoth(MAILROOM, "mailroom", COMMUNICATIONS, "comms");
        // `overview` exists in Communications, Mailroom, Work Items and Scheduling.
        const matches = document.querySelectorAll('[data-workspace-section-tab="overview"]');
        expect(matches.length).toBe(2);
        // A test reaching for "the overview tab" gets whichever is first in document order — here
        // the underlying workspace, not the modal the operator is actually looking at.
        expect(scopeOf(matches[0]!)).toBe("mailroom");
        expect(scopeOf(matches[1]!)).toBe("comms");
    });

    it("a SCOPED selector selects exactly the intended owner", () => {
        mountBoth(MAILROOM, "mailroom", COMMUNICATIONS, "comms");
        const comms = document.querySelectorAll('[data-workspace-mode-sections="comms"] [data-workspace-section-tab="overview"]');
        const mailroom = document.querySelectorAll('[data-workspace-mode-sections="mailroom"] [data-workspace-section-tab="overview"]');
        expect(comms.length).toBe(1);
        expect(mailroom.length).toBe(1);
        expect(scopeOf(comms[0]!)).toBe("comms");
        expect(scopeOf(mailroom[0]!)).toBe("mailroom");
    });

    it("keys unique to one surface cannot collide even unscoped", () => {
        mountBoth(OPERATIONS, "roster", COMMUNICATIONS, "comms");
        expect(document.querySelectorAll('[data-workspace-section-tab="roster"]').length).toBe(1);
        expect(document.querySelectorAll('[data-workspace-section-tab="inbox"]').length).toBe(1);
    });

    it("the attribute carries no Communications semantics — it is the section key verbatim", () => {
        mountBoth(OPERATIONS, "roster", COMMUNICATIONS, "comms");
        const values = [...document.querySelectorAll("[data-workspace-section-tab]")].map((e) => e.getAttribute("data-workspace-section-tab"));
        expect(values).toEqual([...OPERATIONS, ...COMMUNICATIONS]);
    });

    it("accessible roles and labels are surface-neutral in every instance", () => {
        mountBoth(OPERATIONS, "roster", COMMUNICATIONS, "comms");
        const lists = [...document.querySelectorAll('[role="tablist"]')];
        expect(lists).toHaveLength(2);
        for (const list of lists) {
            // The primitive's Communications-branded default label must never reach a surface.
            expect(list.getAttribute("aria-label")).toBe("Work sections");
        }
        expect(document.querySelectorAll('[role="tab"]').length).toBe(OPERATIONS.length + COMMUNICATIONS.length);
        expect(document.querySelectorAll('[role="tab"][aria-selected="true"]').length).toBe(2);
    });
});
