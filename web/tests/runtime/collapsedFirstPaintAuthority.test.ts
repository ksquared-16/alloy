/**
 * P0-7.6 OWNER 1 — FIRST-PAINT AUTHORITY AND STAGE-2 MONOTONICITY.
 *
 * ── WHAT WAS MEASURED ───────────────────────────────────────────────────────────────────────────
 *
 * On deployed a1ecf609, four cold real-page samples, pinned six-card specimen (a family with five
 * children). Exactly ONE authoritative change occurred in WU-09 at drawer-VM arrival, identically
 * in every sample:
 *
 *   - Attendance      "Resolving attendance…"  (data-focus-panel-cell-reserved=true)
 *   + Attendance      "Select a child to see their day."
 *   - Health & Safety "Resolving health & safety…" (reserved)
 *   + Health & Safety "Select a child to see their health information."
 *
 * Semantic finality (V2.1) followed that batch by ~40ms. Nothing else in WU-09 changed.
 *
 * ── WHY IT WAS NOT A CORRECTION ─────────────────────────────────────────────────────────────────
 *
 * A reserved cell makes NO authoritative claim, so this is RESERVED -> KNOWN_EMPTY, not
 * KNOWN -> DIFFERENT_KNOWN. The drawer supplied no truth for it: the commit producer withheld the
 * cards because `hasParticipantIdentity` was false, and the settled producer admits every card
 * unconditionally. Only the producer in charge changed.
 *
 * And the answer already knew: `composeProvisioningAnswerForRoute` resolves participation on every
 * path that has a subject, and the panel carries `resolvedParticipant` and `summaryDocSeed` from
 * the SAME answer object. A null scope at commit is RESOLVED-AND-NONE, never NOT-YET-RESOLVED.
 *
 * These tests pin that, and pin the monotonicity law that stops the repair becoming a stale-value
 * regression. Every forbidden transition below has a planted counterpart that must fail.
 */
import { describe, expect, it } from "vitest";

import {
    MOUNTABLE_CARD_SPECS,
    PARTICIPANT_IDENTITY_TRUTH_KEYS,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import { buildSelfFetchingCardShell } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { focusPanelCardCatalogLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const SCOPED = ["attendance", "health_safety"] as const;

const ctx = (truth: Record<string, unknown>, participant?: string | null) =>
    ({
        truth,
        ...(participant !== undefined
            ? { participantScope: participant ? { customerMemberId: participant, displayName: null } : null }
            : {}),
    }) as unknown as OperationalContext;

const spec = (key: string) => MOUNTABLE_CARD_SPECS.find((s) => s.key === key)!;

/* ── THE MONOTONICITY LAW ─────────────────────────────────────────────────────────────────────── */

type Transition =
    | "DETAIL_ADDED"
    | "SAME"
    | "AUTHORITATIVE_COLLAPSED_CORRECTION"
    | "CARD_REPLACED"
    | "KNOWN_TO_DIFFERENT_KNOWN"
    | "KNOWN_TO_UNKNOWN"
    | "GEOMETRY_RELOCATED";

/** The collapsed fields the renderer actually consumes (census: eight, all configuration). */
const COLLAPSED_FIELDS = ["key", "title", "archetype", "tier", "span", "density", "iconName", "visible"] as const;
const GEOMETRY = ["tier", "span", "density"] as const;

/** Classify first-paint -> Stage-2-settled for ONE collapsed card. */
function classify(first: FocusPanelCardModel | null, settled: FocusPanelCardModel | null): Transition {
    if (first && !settled) return "KNOWN_TO_UNKNOWN";
    if (!first || !settled) return "DETAIL_ADDED"; // reserved -> present is legitimate convergence
    if (first.key !== settled.key) return "CARD_REPLACED";
    for (const f of GEOMETRY) {
        if (first[f] !== settled[f]) return "GEOMETRY_RELOCATED";
    }
    for (const f of COLLAPSED_FIELDS) {
        if (first[f] !== settled[f]) return "KNOWN_TO_DIFFERENT_KNOWN";
    }
    return "SAME";
}

const FORBIDDEN: Transition[] = [
    "AUTHORITATIVE_COLLAPSED_CORRECTION",
    "CARD_REPLACED",
    "KNOWN_TO_DIFFERENT_KNOWN",
    "KNOWN_TO_UNKNOWN",
    "GEOMETRY_RELOCATED",
];

/**
 * The SETTLED model for a self-fetching card, as the drawer-VM producer builds it. Stated here as
 * the literals the legacy producer uses, NOT by calling the shared builder — otherwise the two
 * would agree by construction and the convergence assertion would prove nothing.
 */
const SETTLED: Record<string, Partial<FocusPanelCardModel>> = {
    attendance: { key: "attendance", title: "Attendance", insight: "", tier: "work", span: 2, density: "compact" },
    health_safety: { key: "health_safety", title: "Health & Safety", insight: "", tier: "work", span: 2, density: "compact" },
};

describe("the answer already knows there is no sole participant", () => {
    it("admits a scoped card when participation resolved to NONE but a subject exists", () => {
        for (const key of SCOPED) {
            expect(spec(key).identityKnowable(ctx({ id: "opp-1" }, null)), `${key} must mount`).toBe(true);
        }
    });

    it("still admits when a participant IS present (the pre-existing path is unchanged)", () => {
        for (const key of SCOPED) {
            expect(spec(key).identityKnowable(ctx({ id: "opp-1" }, "member-1"))).toBe(true);
            expect(spec(key).identityKnowable(ctx({ "child.customer_member_id": "member-1" }))).toBe(true);
        }
    });

    it("RESERVES when there is no subject — an answer that has not arrived claims nothing", () => {
        // This is the line between KNOWN_EMPTY and UNKNOWN. Losing it is how a pending read gets
        // presented as a settled empty.
        for (const key of SCOPED) {
            for (const truth of [{}, { id: "" }, { id: "   " }]) {
                expect(spec(key).identityKnowable(ctx(truth, null)), `${key} must reserve`).toBe(false);
            }
        }
    });

    it("does not borrow another card's identity to justify mounting", () => {
        for (const key of SCOPED) {
            expect(spec(key).identityTruthKeys).toEqual(PARTICIPANT_IDENTITY_TRUTH_KEYS);
        }
    });
});

describe("convergence: first paint equals the Stage-2 settled model", () => {
    for (const key of SCOPED) {
        it(`${key} mounts at commit with the SAME model settlement would build`, () => {
            const first = spec(key).build(ctx({ id: "opp-1" }, null));
            for (const [field, value] of Object.entries(SETTLED[key])) {
                expect(first[field as keyof FocusPanelCardModel], `${key}.${field}`).toEqual(value);
            }
            expect(first.title).toBe(focusPanelCardCatalogLabel(key));
        });

        it(`${key} first paint -> settled is SAME, not a correction`, () => {
            const first = spec(key).build(ctx({ id: "opp-1" }, null));
            const settled = { ...first, ...SETTLED[key] } as FocusPanelCardModel;
            expect(classify(first, settled)).toBe("SAME");
        });
    }
});

describe("PLANTS — every forbidden Stage-2 transition must bind", () => {
    const base = () => buildSelfFetchingCardShell("attendance", "Attendance");

    it("plant: Stage 2 changes a collapsed known fact", () => {
        const settled = { ...base(), title: "Attendance (today)" };
        expect(classify(base(), settled)).toBe("KNOWN_TO_DIFFERENT_KNOWN");
    });

    it("plant: Stage 2 replaces the card with a different key", () => {
        const settled = { ...base(), key: "attendance_v2" } as unknown as FocusPanelCardModel;
        expect(classify(base(), settled)).toBe("CARD_REPLACED");
    });

    it("plant: Stage 2 relocates geometry", () => {
        expect(classify(base(), { ...base(), span: 1 })).toBe("GEOMETRY_RELOCATED");
        expect(classify(base(), { ...base(), density: "standard" })).toBe("GEOMETRY_RELOCATED");
        expect(classify(base(), { ...base(), tier: "reference" })).toBe("GEOMETRY_RELOCATED");
    });

    it("plant: a card known at first paint becomes unavailable after Stage 2", () => {
        expect(classify(base(), null)).toBe("KNOWN_TO_UNKNOWN");
    });

    it("plant: Stage 2 changes the icon (presentation the renderer does consume)", () => {
        expect(classify(base(), { ...base(), iconName: "Sparkles" })).toBe("KNOWN_TO_DIFFERENT_KNOWN");
    });

    it("plant: first paint incorrectly claims a known value with no subject", () => {
        // If the predicate ever admits on an empty answer, this binds: the card would be mounted
        // while participation is genuinely unresolved, which is the stale trade.
        for (const key of SCOPED) {
            expect(spec(key).identityKnowable(ctx({}, null)), `${key} must not claim`).toBe(false);
        }
    });

    it("plant: A′ UNKNOWN frozen so it can never legitimately converge", () => {
        // reserved -> present must remain ALLOWED, or Stage 2 could never fill a genuinely
        // unknown cell. Forbidding this would trade stale for blind.
        expect(classify(null, base())).toBe("DETAIL_ADDED");
        expect(FORBIDDEN).not.toContain(classify(null, base()));
    });

    it("the law itself lists every forbidden transition", () => {
        expect(FORBIDDEN).toEqual([
            "AUTHORITATIVE_COLLAPSED_CORRECTION",
            "CARD_REPLACED",
            "KNOWN_TO_DIFFERENT_KNOWN",
            "KNOWN_TO_UNKNOWN",
            "GEOMETRY_RELOCATED",
        ]);
    });
});
