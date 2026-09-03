/**
 * MOUNTABILITY IS NOT READINESS.
 *
 * A cell used to have two outcomes — reserved or ready — so a card that fetches its own data sat
 * blank until Settlement handed it an identity the provisioning answer already carried. Measured on
 * document entry: participant identity at ~1150ms, the card's own request not issued until ~3430ms.
 *
 * These guard the contract that closes that gap WITHOUT weakening `ready`. They assert the registry
 * shape and the state model, never a card's name — a card appears only as an example of a
 * declaration, so a future self-fetching card inherits the rule for free.
 */
import { describe, expect, it } from "vitest";
import { MOUNTABLE_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import { FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { cardSuccessor } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const ctx = (truth: Record<string, unknown>) => ({ truth } as unknown as OperationalContext);
const WITH_IDENTITY = ctx({ "child.customer_member_id": "cm_1" });

describe("mountability contract", () => {
    it("declares at least one identity-gated card", () => {
        expect(MOUNTABLE_CARD_SPECS.length).toBeGreaterThan(0);
    });

    it("2 — identity knowable, content NOT knowable: this is the whole point", () => {
        for (const spec of MOUNTABLE_CARD_SPECS) {
            expect(spec.identityKnowable(WITH_IDENTITY), `${spec.key} should mount on identity`).toBe(true);
            // If content were knowable it would belong in the commit-critical registry as `ready`.
            const content = COMMIT_CRITICAL_CARD_SPECS.find((s) => s.key === spec.key);
            expect(content, `${spec.key} must not also claim commit-critical content`).toBeUndefined();
        }
    });

    it("3 — identity absent: the card stays reserved", () => {
        for (const empty of [ctx({}), ctx({ "child.customer_member_id": "" }), ctx({ "child.customer_member_id": "  " })]) {
            for (const spec of MOUNTABLE_CARD_SPECS) {
                expect(spec.identityKnowable(empty), `${spec.key} must not mount without identity`).toBe(false);
            }
        }
    });

    it("5 — its commit model is a content-free shell, so nothing can read as ready", () => {
        for (const spec of MOUNTABLE_CARD_SPECS) {
            const m = spec.build(WITH_IDENTITY) as { insight?: unknown; title?: unknown };
            expect(m.title, `${spec.key} needs an identity to render`).toBeTruthy();
            expect(m.insight, `${spec.key} must not invent content before its read`).toBe("");
        }
    });

    it("8 — composition participation still gates eligibility", () => {
        const placed = new Set(FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.map((e) => e.key));
        const unplaced = MOUNTABLE_CARD_SPECS.map((s) => s.key).filter((k) => !placed.has(k));
        expect(
            unplaced,
            `A mountable card that no composition places would spend commit work the operator never ` +
                `sees — the law that refused 'scheduling'. Place it or remove it: ${unplaced.join(", ")}`,
        ).toEqual([]);
    });

    it("7 + 10 — a globally superseded identity is never mountable", () => {
        for (const spec of MOUNTABLE_CARD_SPECS) {
            expect(cardSuccessor(spec.key), `${spec.key} is superseded and must not mount`).toBeNull();
        }
    });
});
