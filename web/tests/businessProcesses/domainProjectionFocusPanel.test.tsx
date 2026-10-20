/** @vitest-environment jsdom */

/**
 * BP V2 Slice 2 — a domain-projection row opens its DURABLE record in the existing Focus Panel
 * boundary, through the existing durable record surface; the opportunity panel never mounts for it.
 * Enrollment (no projection frame) still mounts the opportunity panel exactly as before.
 */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/presentation/durableRecord/DurableRecordSurface", () => ({
    default: (p: { subjectType: string; subjectId: string; presentation?: string; contextKey?: string | null }) => (
        <div data-durable-surface={`${p.subjectType}:${p.subjectId}`} data-presentation={p.presentation} data-context-key={p.contextKey ?? ""} />
    ),
}));
vi.mock("@/components/presentation/workUnit/InlineOpportunityFocusPanel", () => ({
    InlineOpportunityFocusPanel: () => <div data-opportunity-panel />,
}));

import { FocusPanelSurface } from "@/components/presentation/workUnit/FocusPanelSurface";
import { OperationalSubjectProvider } from "@/components/presentation/workUnit/OperationalSubjectContext";
import { DomainProjectionFocusProvider } from "@/components/presentation/workUnit/DomainProjectionFocusContext";

const PERSON = "00000000-0000-4000-8000-000000000123";
let container: HTMLElement | null = null;
function render(node: ReactNode): HTMLElement {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(node));
    return container;
}
afterEach(() => {
    container?.remove();
    container = null;
});

const frame = { businessProcessKey: "assignments", workViewId: "all", domain: "assignments" as const, projectionKey: "current_assignments" };
const surface = (subjectId: string | null, projection: typeof frame | null) => (
    <OperationalSubjectProvider subjectId={subjectId}>
        <DomainProjectionFocusProvider frame={projection}>
            <FocusPanelSurface openRecord={() => {}} prefetchRecord={() => {}}>
                <div />
            </FocusPanelSurface>
        </DomainProjectionFocusProvider>
    </OperationalSubjectProvider>
);

describe("Focus Panel on a domain-projection surface", () => {
    it("S3: an Assignments row opens the record on its Assignment context, with the source on the boundary", () => {
        const el = render(surface(`person:${PERSON}`, { ...frame, selectedSource: { kind: "schedule_assignment", id: "sa-1", reason: "Ends Oct 29 · in 9 days" } }));
        expect(el.querySelector("[data-durable-surface]")?.getAttribute("data-context-key")).toBe("schedule");
        expect(el.querySelector("[data-focus-panel-boundary]")?.getAttribute("data-projection-source")).toBe("schedule_assignment:sa-1");
    });

    it("S3: a Billing row opens the household on its default context", () => {
        const el = render(surface(`household:${PERSON}`, { ...frame, domain: "billing", projectionKey: "charges_needing_review" }));
        expect(el.querySelector("[data-durable-surface]")?.getAttribute("data-context-key")).toBe("");
    });

    it("opens the durable person record with the originating process and view on the boundary", () => {
        const el = render(surface(`person:${PERSON}`, frame));
        expect(el.querySelector("[data-durable-surface]")?.getAttribute("data-durable-surface")).toBe(`person:${PERSON}`);
        expect(el.querySelector("[data-opportunity-panel]")).toBeNull();
        const boundary = el.querySelector("[data-focus-panel-boundary]")!;
        expect(boundary.getAttribute("data-projection-process")).toBe("assignments");
        expect(boundary.getAttribute("data-projection-work-view")).toBe("all");
        expect(boundary.getAttribute("data-projection-key")).toBe("current_assignments");
        expect(boundary.getAttribute("data-durable-subject")).toBe(`person:${PERSON}`);
    });

    it("a subject that is not a durable row id never falls back to the opportunity panel", () => {
        const el = render(surface(PERSON, frame));
        expect(el.querySelector("[data-opportunity-panel]")).toBeNull();
        expect(el.querySelector("[data-durable-surface]")).toBeNull();
    });

    it("no selection → placeholder, no record fetched", () => {
        const el = render(surface(null, frame));
        expect(el.querySelector("[data-durable-surface]")).toBeNull();
        expect(el.querySelector("[data-opportunity-panel]")).toBeNull();
    });

    it("Enrollment (no projection frame) still mounts the opportunity panel", () => {
        const el = render(surface("opp-1", null));
        expect(el.querySelector("[data-opportunity-panel]")).not.toBeNull();
        expect(el.querySelector("[data-durable-surface]")).toBeNull();
        expect(el.querySelector("[data-focus-panel-boundary]")!.hasAttribute("data-projection-process")).toBe(false);
    });
});
