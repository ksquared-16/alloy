/**
 * THE COMMAND ROW IS ONE ROW, AND RESOLVING THE WORK IS NOT ONE OF ITS BUTTONS.
 *
 * Measured on a deployed Lead card: five content-sized commands wrapped to two lines — "Contact
 * Family / Tour ▾ / Move to Waitlist" above "Add Child / Record outcome" — each a different width
 * because each sized to its own label, and the filled primary a different height from its
 * neighbours. It read as an assembled pile rather than a row.
 *
 * Two changes, and only the first is cosmetic. `record_outcome` leaves the row entirely: it closes
 * what the stage's own lines just described, so it belongs under them as a link, not beside the
 * commands that start new work. That is also what takes the row from five commands to four and
 * makes one row honest at this width.
 *
 * The split is the RUNTIME's, not the card's — the card is explicitly forbidden from filtering or
 * re-ordering the configured set, so the adapter hands it two separate slots.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ProcessCard from "@/components/operationalCards/ProcessCard";
import { adaptBusinessProcessEvidenceToProcessCard } from "@/lib/adminV2/runtime/focusPanel/businessProcess/adaptBusinessProcessEvidenceToProcessCard";
import type { ProcessCardActionInput } from "@/lib/adminV2/runtime/focusPanel/businessProcess/adaptBusinessProcessEvidenceToProcessCard";

/** The command set the deployed Lead card actually carried when the row wrapped. */
const LEAD_COMMANDS: ProcessCardActionInput[] = [
    { key: "quick_message", label: "Contact Family", primary: true },
    { key: "schedule_tour", label: "Tour", menu: [{ key: "schedule_tour", label: "Schedule tour" }] },
    { key: "waitlist_child", label: "Move to Waitlist" },
    { key: "add_child", label: "Add Child" },
    { key: "record_outcome", label: "Record outcome" },
] as ProcessCardActionInput[];

function evidence(actions: ProcessCardActionInput[] = LEAD_COMMANDS) {
    return adaptBusinessProcessEvidenceToProcessCard({
        evidence: {
            processName: "Enrollment",
            // The adapter reads the case's stage from `caseStageLabel`.
            caseStageLabel: "Lead",
            stages: [],
            participants: [],
            stillNeeded: [],
            dueLine: null,
            headline: null,
        } as never,
        subjectLabel: null,
        activity: [],
        actions,
    });
}

const html = (actions?: ProcessCardActionInput[]) =>
    renderToStaticMarkup(<ProcessCard evidence={evidence(actions)} />);

describe("the runtime splits resolving-the-work out of the command set", () => {
    it("keeps the outcome command out of the row", () => {
        const e = evidence();
        expect(e.actions.map((a) => a.key)).not.toContain("record_outcome");
    });

    it("carries it in its own slot instead of dropping it", () => {
        expect(evidence().outcomeAction?.key).toBe("record_outcome");
    });

    it("leaves every other configured command in the row, in configured order", () => {
        expect(evidence().actions.map((a) => a.key)).toEqual([
            "quick_message",
            "schedule_tour",
            "waitlist_child",
            "add_child",
        ]);
    });

    it("matches on key, never on label — configuration may rename it", () => {
        const renamed = evidence([{ key: "record_outcome", label: "Close this out" } as ProcessCardActionInput]);
        expect(renamed.actions).toEqual([]);
        expect(renamed.outcomeAction?.label).toBe("Close this out");
    });

    it("reports no outcome slot on a stage that projects none", () => {
        const e = evidence([{ key: "add_child", label: "Add Child" } as ProcessCardActionInput]);
        expect(e.outcomeAction).toBeNull();
        expect(e.actions.map((a) => a.key)).toEqual(["add_child"]);
    });
});

describe("what the card renders", () => {
    it("renders the outcome as a link, not as a command in the row", () => {
        const markup = html();
        // Present, and carrying its command identity so execution and certification are unchanged.
        expect(markup).toContain("alloy-os-process__outcome-link");
        expect(markup).toContain('data-process-action="record_outcome"');
        // The link sits in the stage's own column, not in the action row.
        const linkAt = markup.indexOf("alloy-os-process__outcome-link");
        const rowAt = markup.indexOf("alloy-os-currentwork__helpful-row");
        expect(linkAt).toBeGreaterThan(-1);
        expect(rowAt).toBeGreaterThan(-1);
        expect(linkAt, "the outcome link must precede the command row in the card").toBeLessThan(rowAt);
    });

    it("names the stage without prefixing the grain the panel is already scoped to", () => {
        const markup = html();
        expect(markup).toContain("Lead");
        expect(markup).not.toContain("Case ·");
        expect(markup).not.toContain("Case &#xB7;");
    });

    it("still renders every other configured command", () => {
        const markup = html();
        for (const key of ["quick_message", "waitlist_child", "add_child"]) {
            expect(markup).toContain(key);
        }
    });

    it("omits the link entirely when no outcome is projected", () => {
        const markup = html([{ key: "add_child", label: "Add Child" } as ProcessCardActionInput]);
        expect(markup).not.toContain("alloy-os-process__outcome-link");
    });
});
