/**
 * THE ONE PLACE A CERTIFICATION FIXTURE DECIDES WHO IT MAY ADDRESS.
 *
 * This guard exists because the fixture it replaced did not have one.
 * `createCommunicationsNeedsReplyQaFixture.ts` selected a thread with
 * `order by last_message_at desc limit 10` and wrote `attention_state` onto it through a
 * service-role client. On the certification tenant the threads it would have chosen were a real
 * personal mailbox, a real mobile number, and two real external senders. Nothing in it could tell
 * a synthetic certification identity from a parent. It was deleted, not repaired.
 *
 * The property that makes a Communications fixture safe is not "be careful" — it is that the set of
 * addresses it CAN reach excludes every real person by construction. RFC 2606 reserves `.invalid`
 * and `.example` so they can never be registered, resolved, or delivered to. A sender on one of
 * those domains cannot be a customer, cannot receive mail, and cannot be reached by accident.
 *
 * Extracted into its own module so the refusal is testable on its own terms. A guard that only runs
 * inside a Playwright-driving script is a guard nobody can prove.
 */

/** The only sender domains a certification fixture will ever accept. */
export const SAFE_SENDER_SUFFIXES = Object.freeze([".alloy.invalid", ".invalid", ".example", "@example.com"]);

/**
 * Returns the normalised address, or throws if it is not a reserved undeliverable certification
 * domain. Fails closed on empty/absent input — an unresolved sender is a refusal, never a default.
 */
export function assertSafeSender(address) {
    const a = String(address || "")
        .trim()
        .toLowerCase();
    if (!a) throw new Error("no sender address resolved");
    if (!SAFE_SENDER_SUFFIXES.some((s) => a.endsWith(s))) {
        throw new Error(
            `REFUSING to use sender ${a}: not a reserved, undeliverable certification domain. ` +
                `This fixture never addresses a real person.`,
        );
    }
    return a;
}

/** Non-throwing form, for callers that filter candidate lists rather than assert one address. */
export function isSafeSender(address) {
    try {
        assertSafeSender(address);
        return true;
    } catch {
        return false;
    }
}
