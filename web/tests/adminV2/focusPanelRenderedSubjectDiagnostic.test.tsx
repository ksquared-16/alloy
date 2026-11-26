/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { FocusPanelRenderedSubjectProvider } from "@/components/admin/focusPanel/focusPanelRenderedSubjectContext";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const PANEL = read("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx");
const CARD = read("components/admin/focusPanel/UniversalCard.tsx");

function render(node: React.ReactNode): HTMLElement {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => { root.render(node as never); });
    return host;
}

const card = (props: Record<string, unknown> = {}) =>
    createElement(UniversalCard as never, { title: "Card", ...props } as never);

/**
 * OX SLICE 5 — THE CARD DIAGNOSTIC MUST NAME WHOSE CONTENT IS ON SCREEN.
 *
 * Three earlier attempts bound this to the renderer's generic UniversalCard branch, which the real
 * cards never reach: FinancialsCard, ChildrenCard, HouseholdCard, CurrentWorkCard and ReadinessCard
 * each render their OWN UniversalCard, so cardsBoundToB measured 0/20 on deployed a86b7384.
 * Reading the context inside UniversalCard covers all of them at once.
 */
describe("focus panel rendered-subject diagnostic", () => {
    it("every UniversalCard carries the rendered subject, whoever constructed it", () => {
        const host = render(
            createElement(FocusPanelRenderedSubjectProvider, { value: "subject-B" }, card()),
        );
        const el = host.querySelector("[data-card-subject]");
        expect(el).not.toBeNull();
        expect(el?.getAttribute("data-card-subject")).toBe("subject-B");
    });

    it("bespoke and generic cards are covered identically — the context is read, not passed", () => {
        // A bespoke card differs only in what it renders INSIDE; the attribute comes from the shared
        // boundary, so no call site has to remember to pass it.
        const host = render(
            createElement(
                FocusPanelRenderedSubjectProvider,
                { value: "subject-B" },
                createElement("div", null, card({ title: "Financials" }), card({ title: "Children" })),
            ),
        );
        const subjects = [...host.querySelectorAll("[data-card-subject]")].map((e) => e.getAttribute("data-card-subject"));
        expect(subjects).toEqual(["subject-B", "subject-B"]);
    });

    it("an unknown subject fails closed — the attribute is absent, never guessed", () => {
        const host = render(createElement(FocusPanelRenderedSubjectProvider, { value: null }, card()));
        expect(host.querySelector("[data-card-subject]")).toBeNull();
    });

    it("outside the Focus Panel there is no subject to assert", () => {
        const host = render(card());
        expect(host.querySelector("[data-card-subject]")).toBeNull();
    });

    it("an explicit override still wins, for a card that genuinely knows better", () => {
        const host = render(
            createElement(FocusPanelRenderedSubjectProvider, { value: "subject-B" }, card({ "data-card-subject": "subject-X" })),
        );
        expect(host.querySelector("[data-card-subject]")?.getAttribute("data-card-subject")).toBe("subject-X");
    });

    it("A -> B changes the emitted subject", () => {
        const hostA = render(createElement(FocusPanelRenderedSubjectProvider, { value: "subject-A" }, card()));
        expect(hostA.querySelector("[data-card-subject]")?.getAttribute("data-card-subject")).toBe("subject-A");
        const hostB = render(createElement(FocusPanelRenderedSubjectProvider, { value: "subject-B" }, card()));
        expect(hostB.querySelector("[data-card-subject]")?.getAttribute("data-card-subject")).toBe("subject-B");
    });

    it("RETAINED A CONTENT IS NEVER LABELLED B — the provider is fed from the rendered payload", () => {
        /*
         * This is the whole correctness question. `bodyRenderKey` is the committed operational
         * snapshot and moves to the destination FAST while the prior grid is still held, so feeding
         * the diagnostic from it would stamp A's cards with B's id. `visible` is `resolved ??
         * heldPrior` — what is actually on screen — so during a hold it names A.
         */
        expect(PANEL).toContain("value={visible ? String(visible.displayVm.entity.id) : null}");
        expect(PANEL).not.toMatch(/FocusPanelRenderedSubjectProvider[\s\S]{0,400}value=\{bodyRenderKey\}/);
    });

    it("the diagnostic is read-only — no fetch, cache or state in its path", () => {
        // Strip comments first: the file's own prose says it "owns no cache", and matching that
        // sentence would fail the assertion for describing the property it is asserting.
        const ctx = read("components/admin/focusPanel/focusPanelRenderedSubjectContext.tsx")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "");
        for (const forbidden of ["fetch(", "useState", "useEffect", "localStorage", "cache"]) {
            expect(ctx.includes(forbidden), `code must not contain ${forbidden}`).toBe(false);
        }
        // UniversalCard only READS it.
        expect(CARD).toContain("useFocusPanelRenderedSubject()");
    });
});
