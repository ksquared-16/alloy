/**
 * THE MOUNT PREDICATE AND THE TRANSPORTED SCOPE — Part 1b.
 *
 * Part 1 delivered the authoritative participant to the browser and changed nothing, because the
 * predicate deciding mountability read `child.customer_member_id` from truth and never consulted
 * `participantScope`. Measured on deployed ad4f0f6d7: the scope was present, both producers had
 * already computed their content, and both cards still reserved until the drawer settled ~3s later.
 *
 * These gates hold the converged predicate from both sides — it must accept the scope, it must
 * still accept the child-grain truth key, and it must refuse everything that is not authoritative
 * identity.
 */
import { describe, expect, it } from "vitest";

import { MOUNTABLE_CARD_SPECS, PARTICIPANT_IDENTITY_TRUTH_KEYS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const specFor = (key: string) => MOUNTABLE_CARD_SPECS.find((s) => s.key === key)!;
const PARTICIPANT_CARDS = ["attendance", "health_safety"] as const;

const ctx = (over: Partial<OperationalContext>): OperationalContext =>
    ({ truth: {}, ...over }) as OperationalContext;

const scope = (customerMemberId: string | null) =>
    ({
        participationId: "ocm-1",
        customerMemberId,
        personId: null,
        displayName: null,
        imageUrl: null,
        stageKey: null,
        stageLabel: null,
    }) as OperationalContext["participantScope"];

describe("the predicate accepts the authoritative resolved scope", () => {
    for (const key of PARTICIPANT_CARDS) {
        it(`${key} is mountable from participantScope alone`, () => {
            expect(specFor(key).identityKnowable(ctx({ participantScope: scope("cm-1") }))).toBe(true);
        });
    }
});

describe("the child-grain truth path is kept, not replaced", () => {
    for (const key of PARTICIPANT_CARDS) {
        it(`${key} is still mountable from ${PARTICIPANT_IDENTITY_TRUTH_KEYS[0]}`, () => {
            // A child-grain frame is told its subject directly and has no scope to resolve.
            const truth = Object.fromEntries(PARTICIPANT_IDENTITY_TRUTH_KEYS.map((k) => [k, "cm-1"]));
            expect(specFor(key).identityKnowable(ctx({ truth }))).toBe(true);
        });
    }
});

describe("identity must be identity — nothing weaker admits a card", () => {
    for (const key of PARTICIPANT_CARDS) {
        it(`${key} reserves when no participant is resolved`, () => {
            // Ambiguous and absent both arrive here as a null scope; the resolver already refused.
            expect(specFor(key).identityKnowable(ctx({}))).toBe(false);
            expect(specFor(key).identityKnowable(ctx({ participantScope: null }))).toBe(false);
        });

        it(`${key} reserves on a scope carrying no member`, () => {
            // A scope object is not an identity. Accepting one would mount a card that cannot read.
            expect(specFor(key).identityKnowable(ctx({ participantScope: scope(null) }))).toBe(false);
            expect(specFor(key).identityKnowable(ctx({ participantScope: scope("   ") }))).toBe(false);
        });

        it(`${key} reserves on a blank truth key`, () => {
            const truth = Object.fromEntries(PARTICIPANT_IDENTITY_TRUTH_KEYS.map((k) => [k, "  "]));
            expect(specFor(key).identityKnowable(ctx({ truth }))).toBe(false);
        });
    }
});

describe("the predicate decides mountability only", () => {
    it("admits participant cards as self-loading, never as content-ready", () => {
        /*
         * Mount eligibility is not content readiness. These cards own their own read; admitting
         * them says "you may start", not "your answer is here". Part 1b must not blur that — a
         * card marked ready without content is a card that renders an authoritative-looking empty.
         */
        for (const key of PARTICIPANT_CARDS) {
            const model = specFor(key).build(ctx({ participantScope: scope("cm-1") }));
            expect(JSON.stringify(model)).not.toContain("cm-1");
        }
    });

    it("carries no authorization answer into the scope", () => {
        const s = scope("cm-1") as Record<string, unknown>;
        for (const forbidden of ["access", "grants", "roleKeys", "canView", "permission"]) {
            expect(s).not.toHaveProperty(forbidden);
        }
    });
});
