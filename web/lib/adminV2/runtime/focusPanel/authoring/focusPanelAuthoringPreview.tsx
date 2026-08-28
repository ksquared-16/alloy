"use client";

/**
 * AUTHORING PREVIEW — the production card, shown with representative evidence.
 *
 * ── WHY THE BUILDER NEEDED THIS AT ALL ──
 *
 * The composer already rendered the real runtime components against a real
 * Operational Context. That is the right architecture and it produced the wrong
 * result, because every operational card is a CONTAINER that fetches its own
 * subject data:
 *
 *   Attendance      → "Select a child to see their day."
 *   Financials      → "No financial record."
 *   Health & Safety → "Select a child to see their health information."
 *
 * Each of those is a correct RUNTIME answer — no scoped participant, no tenant
 * account, nothing to fetch in a settings page. They are useless as an authoring
 * preview: an operator placing Financials cannot see that it has a current
 * period, a responsibility split, a past-due region and a payment row.
 *
 * ── THE SEAM, AND WHY IT IS THIS ONE ──
 *
 * The container is what cannot resolve; the PRESENTATION is fine. So the preview
 * skips the container and renders the approved presentation component directly —
 * the same `components/operationalCards/*` the runtime renders — with the same
 * fixtures the design lab uses. That is:
 *
 *     production component + authoring preview evidence
 *
 * and emphatically not a second thumbnail implementation. If the approved card
 * changes, this preview changes with it, because it IS the approved card. There
 * is nothing here to drift.
 *
 * ── IT CANNOT REACH RUNTIME ──
 *
 * Nothing in the runtime provider or composition path imports this module, and a
 * guard test asserts that. The renderer only consults it when a caller passes
 * `authoringPreview`, which only the composer canvas does. Representative
 * evidence rendering on an operator's real Focus Panel would be a fabricated
 * record, so the boundary is a test, not a convention.
 */

import ProcessCard from "@/components/operationalCards/ProcessCard";
import FinancialsCard from "@/components/operationalCards/FinancialsCard";
import AttendanceCard from "@/components/operationalCards/AttendanceCard";
import HealthSafetyCard from "@/components/operationalCards/HealthSafetyCard";
import StaffCard from "@/components/cardLab/StaffCard";
import {
    ATTENDANCE_FIXTURE,
    FINANCIALS_PAST_DUE,
    HEALTH_HIGHER_CARE,
    PROCESS_WRIGHT_DIVERGENT,
    STAFF_FIXTURE,
} from "@/lib/cardLab/cardLabFixtures";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCardDensity } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";

/**
 * The card keys the builder previews from evidence.
 *
 * Deliberately a SHORT list. A card whose production container resolves happily
 * from the composer's demo record — Household, Children, Assignments, Tour — is
 * left alone: previewing it from a fixture would replace a working real render
 * with a synthetic one, which is a downgrade dressed as an improvement.
 */
export const AUTHORING_PREVIEW_CARDS = Object.freeze([
    "business_process",
    "financials",
    "attendance",
    "health_safety",
    "staff",
] as const satisfies readonly FocusPanelCardKey[]);

export type AuthoringPreviewCardKey = (typeof AUTHORING_PREVIEW_CARDS)[number];

export function hasAuthoringPreview(key: string): key is AuthoringPreviewCardKey {
    return (AUTHORING_PREVIEW_CARDS as readonly string[]).includes(key);
}

/**
 * Financials is the one card whose PRESENTATION changes with its placement, and
 * the builder has to show that: an operator choosing between the two placements
 * is choosing between two visibly different cards, not two widths of one.
 *
 * The mapping is the card's own contract (`span: 1 | "row"`), read from the
 * authored placement rather than invented here.
 */
function financialsSpanFor(columns?: number | null, density?: FocusPanelCardDensity | null): 1 | "row" {
    if (density === "compact" || density === "micro") return 1;
    if (typeof columns === "number" && columns <= 4) return 1;
    return "row";
}

export type AuthoringPreviewProps = {
    cardKey: string;
    /** The authored placement — the preview must answer at the size being placed. */
    columns?: number | null;
    density?: FocusPanelCardDensity | null;
};

/**
 * Render one card's authoring preview, or null when the card has none.
 *
 * Every control is inert. A builder canvas is a picture of a composition; a
 * preview that could check a child in would be operating a record from a
 * settings page.
 */
export default function FocusPanelAuthoringPreview({ cardKey, columns, density }: AuthoringPreviewProps) {
    switch (cardKey) {
        case "business_process":
            // The divergent specimen on purpose: it is the only one that shows the
            // participant treatment AND the activity foot row, which is most of what
            // an author is deciding when they give this card a full row.
            return <ProcessCard evidence={PROCESS_WRIGHT_DIVERGENT} />;
        case "financials":
            return <FinancialsCard evidence={FINANCIALS_PAST_DUE} span={financialsSpanFor(columns, density)} />;
        case "attendance":
            return <AttendanceCard evidence={ATTENDANCE_FIXTURE} />;
        case "health_safety":
            return <HealthSafetyCard evidence={HEALTH_HIGHER_CARE} />;
        case "staff":
            return <StaffCard evidence={STAFF_FIXTURE} />;
        default:
            return null;
    }
}
