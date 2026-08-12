import { describe, expect, it } from "vitest";

import {
    formatCardFocusAspect,
    parseCardFocusAspect,
} from "@/lib/runtime/kernel/attentionCardFocus";
import { ATTENTION_SCOPE, AttentionOwner, attentionFromUrl, urlFromAttention } from "@/lib/runtime/kernel/attention";

/**
 * Card + item focus is carried as the kernel's ASPECT — the scope that already means "finer than the
 * Operational Subject". These pin the two properties that make that safe:
 *
 *   - an ASPECT movement INHERITS target/lens/subject, so a card request can never cancel subject or
 *     lens preparation, and can never silently move the operator to a different record;
 *   - the encoding round-trips through the URL, because `urlFromAttention` already projects `?aspect=`
 *     and `attentionFromUrl` already reads it — so a focused card is deep-linkable and survives a
 *     reload without the URL ever becoming the cause of attention.
 */

const TENANT = "org-1";
const PRINCIPAL = "user-1";

describe("card focus encodes into an attention aspect", () => {
    it("round-trips card, item and context", () => {
        const focus = { card_key: "children", item_id: "cm-joe", context_key: "enrollment" };
        const aspect = formatCardFocusAspect(focus);
        expect(parseCardFocusAspect(aspect)).toEqual(focus);
    });

    it("round-trips a card with no item", () => {
        const aspect = formatCardFocusAspect({ card_key: "household", item_id: null, context_key: null });
        expect(parseCardFocusAspect(aspect)).toEqual({
            card_key: "household",
            item_id: null,
            context_key: null,
        });
    });

    it("survives ids containing separator characters", () => {
        const focus = { card_key: "children", item_id: "a|b:c d", context_key: null };
        expect(parseCardFocusAspect(formatCardFocusAspect(focus))).toEqual(focus);
    });

    it("has no aspect without a card", () => {
        expect(formatCardFocusAspect(null)).toBeNull();
        expect(formatCardFocusAspect({ card_key: "  ", item_id: "x", context_key: null })).toBeNull();
    });

    it("refuses anything that is not a card-focus aspect", () => {
        // `?aspect=` is operator-supplied on a cold load. A value authored by some other producer
        // must not be misread as a card request, and a malformed one must not focus an arbitrary card.
        for (const hostile of ["", "   ", "children", "card", "card:", "unknown:children", "card:a|junk"]) {
            expect(parseCardFocusAspect(hostile), hostile).toBeNull();
        }
        expect(parseCardFocusAspect(null)).toBeNull();
    });
});

describe("an ASPECT movement is safe by construction", () => {
    const owner = () => {
        const o = new AttentionOwner();
        o.hydrate({ tenant: TENANT, principal: PRINCIPAL, target: "enrollment-pipeline", source: "direct_url" });
        o.move({ scope: ATTENTION_SCOPE.LENS, lens: "new_leads", source: "work_view_selection" });
        o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-smith", source: "subject_selection" });
        return o;
    };

    it("inherits surface, lens and subject", () => {
        const o = owner();
        o.move({
            scope: ATTENTION_SCOPE.ASPECT,
            aspect: formatCardFocusAspect({ card_key: "children", item_id: "cm-joe", context_key: null })!,
            source: "search",
        });

        const ref = o.get()!;
        expect(ref.target).toBe("enrollment-pipeline");
        expect(ref.lens).toBe("new_leads");
        expect(ref.subject).toBe("opp-smith");
        expect(parseCardFocusAspect(ref.aspect)).toEqual({
            card_key: "children",
            item_id: "cm-joe",
            context_key: null,
        });
    });

    it("a later SUBJECT movement clears the card — the card belonged to the record it left", () => {
        const o = owner();
        o.move({
            scope: ATTENTION_SCOPE.ASPECT,
            aspect: formatCardFocusAspect({ card_key: "children", item_id: "cm-joe", context_key: null })!,
            source: "search",
        });
        o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-rivers", source: "subject_selection" });

        expect(o.get()!.subject).toBe("opp-rivers");
        expect(o.get()!.aspect).toBeNull();
    });

    it("the newest card focus wins on rapid switching", () => {
        const o = owner();
        o.move({
            scope: ATTENTION_SCOPE.ASPECT,
            aspect: formatCardFocusAspect({ card_key: "children", item_id: "cm-joe", context_key: null })!,
            source: "search",
        });
        o.move({
            scope: ATTENTION_SCOPE.ASPECT,
            aspect: formatCardFocusAspect({ card_key: "household", item_id: "p-jane", context_key: null })!,
            source: "search",
        });

        expect(parseCardFocusAspect(o.get()!.aspect)).toEqual({
            card_key: "household",
            item_id: "p-jane",
            context_key: null,
        });
    });
});

describe("the focused card is deep-linkable, because the URL is a projection", () => {
    it("projects into the address and hydrates back out of it", () => {
        const o = new AttentionOwner();
        o.hydrate({ tenant: TENANT, principal: PRINCIPAL, target: "enrollment-pipeline", source: "direct_url" });
        o.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: "opp-smith", source: "subject_selection" });
        o.move({
            scope: ATTENTION_SCOPE.ASPECT,
            aspect: formatCardFocusAspect({ card_key: "children", item_id: "cm-joe", context_key: null })!,
            source: "search",
        });

        const url = urlFromAttention(o.get()!, "http://local");
        const rehydrated = attentionFromUrl(new URL(url, "http://local"), { tenant: TENANT, principal: PRINCIPAL }, "reload");

        expect(rehydrated).toBeTruthy();
        expect(parseCardFocusAspect(rehydrated!.aspect)).toEqual({
            card_key: "children",
            item_id: "cm-joe",
            context_key: null,
        });
    });
});
