/**
 * A reply carries a conversation, never a destination.
 *
 * Two recipient modes exist and they are mutually exclusive: a resolved Person,
 * or a thread whose sender Alloy has not identified. The second exists so an
 * operator can answer a parent who texted in before anyone knew who they were —
 * and it must not become a way to reach an arbitrary number by wrapping that
 * number in a request that also happens to name a thread.
 */
import { describe, expect, it } from "vitest";
import {
    resolveSendRecipientMode,
    ADDRESS_BEARING_FIELDS,
} from "@/lib/communications/send/resolveSendRecipientMode";

const THREAD = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";

describe("recipient modes are mutually exclusive", () => {
    it("resolves a person on its own", () => {
        expect(resolveSendRecipientMode({ recipient_person_id: PERSON })).toEqual({
            mode: "person",
            personId: PERSON,
        });
    });

    it("resolves a thread on its own", () => {
        expect(resolveSendRecipientMode({ thread_id: THREAD })).toEqual({
            mode: "thread",
            threadId: THREAD,
        });
    });

    it("refuses both together", () => {
        const out = resolveSendRecipientMode({ recipient_person_id: PERSON, thread_id: THREAD });

        expect(out.mode).toBe("invalid");
        expect(out).toMatchObject({ code: "ambiguous_recipient_mode" });
    });

    it("refuses neither", () => {
        expect(resolveSendRecipientMode({}).mode).toBe("invalid");
        expect(resolveSendRecipientMode({ recipient_person_id: "", thread_id: "  " }).mode).toBe("invalid");
    });
});

describe("a thread reply may not carry a destination", () => {
    it.each([...ADDRESS_BEARING_FIELDS])("refuses a supplied %s", (field) => {
        const out = resolveSendRecipientMode({ thread_id: THREAD, [field]: "+15559990000" });

        expect(out.mode).toBe("invalid");
        expect(out).toMatchObject({ code: "thread_recipient_address_not_permitted" });
    });

    it("refuses rather than ignores, so a caller is never misled", () => {
        // Dropping the field silently would let a caller believe the message had
        // been redirected.
        const out = resolveSendRecipientMode({ thread_id: THREAD, to: "+15559990000" });

        expect(out.mode).not.toBe("thread");
    });

    it("ignores empty address fields, which carry no intent", () => {
        expect(
            resolveSendRecipientMode({ thread_id: THREAD, to: "", phone: "   ", email: null }).mode
        ).toBe("thread");
    });

    it("requires a real thread id", () => {
        expect(resolveSendRecipientMode({ thread_id: "nope" })).toMatchObject({
            mode: "invalid",
            code: "invalid_thread_id",
        });
    });

    it("does not accept an id-shaped string that is not a UUID", () => {
        // An ingress receipt id is a UUID, but a truncated or arbitrary token is
        // not — and must not be mistaken for a conversation.
        expect(resolveSendRecipientMode({ thread_id: "1111-1111" }).mode).toBe("invalid");
    });
});

describe("person mode is unchanged", () => {
    it("still requires a UUID", () => {
        expect(resolveSendRecipientMode({ recipient_person_id: "not-a-uuid" })).toMatchObject({
            mode: "invalid",
            code: "typed_recipient_required",
        });
    });

    it("is unaffected by address fields, which other validation already refuses", () => {
        // Free-text `to` is rejected earlier in the route for every mode; this
        // function's job is only to decide the mode.
        expect(resolveSendRecipientMode({ recipient_person_id: PERSON, phone: "+1555" }).mode).toBe(
            "person"
        );
    });
});
