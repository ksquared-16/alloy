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
import {
    focusPanelCardParticipatesInACodeOwnedComposition,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { cardSuccessor } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const ctx = (truth: Record<string, unknown>) => ({ truth } as unknown as OperationalContext);

/**
 * The fixture is DERIVED FROM THE SPEC, never written here. A hand-written context would name one
 * card's identity key and quietly test only the cards that happen to share it — which is how a second
 * identity shape (an account rather than a participant) would have passed by not being exercised.
 */
const withDeclaredIdentity = (spec: { identityTruthKeys: readonly string[] }) =>
    ctx(Object.fromEntries(spec.identityTruthKeys.map((key) => [key, "id_1"])));
const withBlankIdentity = (spec: { identityTruthKeys: readonly string[] }, blank: string) =>
    ctx(Object.fromEntries(spec.identityTruthKeys.map((key) => [key, blank])));

describe("mountability contract", () => {
    it("declares at least one identity-gated card", () => {
        expect(MOUNTABLE_CARD_SPECS.length).toBeGreaterThan(0);
    });

    it("1 — every spec declares the truth keys its predicate actually reads", () => {
        for (const spec of MOUNTABLE_CARD_SPECS) {
            expect(spec.identityTruthKeys.length, `${spec.key} declares no identity keys`).toBeGreaterThan(0);
            // Each declared key must be sufficient ON ITS OWN — the declaration is an any-of, and a
            // key that decides nothing would make the fixture above test less than it appears to.
            for (const key of spec.identityTruthKeys) {
                expect(
                    spec.identityKnowable(ctx({ [key]: "id_1" })),
                    `${spec.key} declares ${key} but does not admit on it`,
                ).toBe(true);
            }
        }
    });

    it("2 — identity knowable, content NOT knowable: this is the whole point", () => {
        for (const spec of MOUNTABLE_CARD_SPECS) {
            expect(
                spec.identityKnowable(withDeclaredIdentity(spec)),
                `${spec.key} should mount on identity`,
            ).toBe(true);
            // If content were knowable it would belong in the commit-critical registry as `ready`.
            const content = COMMIT_CRITICAL_CARD_SPECS.find((s) => s.key === spec.key);
            expect(content, `${spec.key} must not also claim commit-critical content`).toBeUndefined();
        }
    });

    it("3 — identity absent: the card stays reserved", () => {
        for (const spec of MOUNTABLE_CARD_SPECS) {
            for (const empty of [ctx({}), withBlankIdentity(spec, ""), withBlankIdentity(spec, "  ")]) {
                expect(spec.identityKnowable(empty), `${spec.key} must not mount without identity`).toBe(false);
            }
        }
    });

    it("5 — its commit model is a content-free shell, so nothing can read as ready", () => {
        for (const spec of MOUNTABLE_CARD_SPECS) {
            const m = spec.build(withDeclaredIdentity(spec)) as { insight?: unknown; title?: unknown };
            expect(m.title, `${spec.key} needs an identity to render`).toBeTruthy();
            expect(m.insight, `${spec.key} must not invent content before its read`).toBe("");
        }
    });

    it("8 — composition participation still gates eligibility", () => {
        // Asked of the CODE-OWNED COMPOSITION FAMILY — every grain — not of the `opportunity` member
        // alone. A card the case surface deliberately omits may still be placed at child grain, and
        // reading one member reported that as "placed nowhere".
        const unplaced = MOUNTABLE_CARD_SPECS
            .map((s) => s.key)
            .filter((k) => !focusPanelCardParticipatesInACodeOwnedComposition(k));
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
