/**
 * A message recorded twice is shown once, and counted once.
 *
 * Inbound provider-identity uniqueness deliberately kept pre-existing duplicate
 * rows — a received communication is immutable history even when it arrived twice
 * — and only moved their provider identity into metadata so the index could be
 * created. Those rows are still `direction = 'inbound'`.
 *
 * Left alone they resurface the exact duplication this slice removed, one layer
 * up: shown in a conversation they read as the parent saying the same thing
 * twice, and counted they inflate unread. They are excluded from presentation.
 * They are not deleted.
 */
import { describe, expect, it } from "vitest";
import {
    isSupersededDuplicateMessage,
    withoutSupersededDuplicates,
    SUPERSEDED_DUPLICATE_KEY,
} from "@/lib/communications/supersededDuplicateMessages";

const original = { id: "m1", body: "Yes that works", metadata: {} };
const duplicate = {
    id: "m2",
    body: "Yes that works",
    metadata: {
        [SUPERSEDED_DUPLICATE_KEY]: "SM_abc123",
        superseded_reason: "duplicate_inbound_provider_delivery",
    },
};

describe("superseded duplicate messages", () => {
    it("recognises a row that surrendered its provider identity", () => {
        expect(isSupersededDuplicateMessage(duplicate)).toBe(true);
    });

    it("does not mistake an ordinary message for a duplicate", () => {
        expect(isSupersededDuplicateMessage(original)).toBe(false);
        expect(isSupersededDuplicateMessage({ id: "m3" })).toBe(false);
        expect(isSupersededDuplicateMessage({ id: "m4", metadata: null })).toBe(false);
    });

    it("shows the parent's message once, not twice", () => {
        const history = withoutSupersededDuplicates([original, duplicate]);

        expect(history.map((m) => m.id)).toEqual(["m1"]);
    });

    it("keeps every genuine message, including repeated wording", () => {
        // Two distinct provider deliveries that happen to say the same thing are
        // two messages. Only the backfill marker separates them.
        const sameWords = { id: "m5", body: "Yes that works", metadata: {} };
        const history = withoutSupersededDuplicates([original, sameWords]);

        expect(history).toHaveLength(2);
    });

    it("treats an empty marker as not superseded", () => {
        // A blank value is not provenance; it must not silently hide a message.
        expect(isSupersededDuplicateMessage({ metadata: { [SUPERSEDED_DUPLICATE_KEY]: "" } })).toBe(
            false
        );
        expect(
            isSupersededDuplicateMessage({ metadata: { [SUPERSEDED_DUPLICATE_KEY]: "   " } })
        ).toBe(false);
    });

    it("ignores a non-string marker rather than guessing", () => {
        expect(isSupersededDuplicateMessage({ metadata: { [SUPERSEDED_DUPLICATE_KEY]: 42 } })).toBe(
            false
        );
    });

    it("leaves an already-clean history untouched", () => {
        const clean = [original, { id: "m6", metadata: {} }];
        expect(withoutSupersededDuplicates(clean)).toEqual(clean);
    });
});
