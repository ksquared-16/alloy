import { describe, expect, it } from "vitest";

import { adminActionErrorMessage } from "@/lib/admin/actions/adminActionErrorMessage";
import { seedFromEnrollmentPaperworkDetail } from "@/lib/enrollment/paperwork/useEnrollmentPaperworkComposeSeed";

/**
 * A REFUSAL AN OPERATOR CANNOT READ IS WORSE THAN NO REFUSAL.
 *
 * `/api/admin/actions/execute` refuses with `{ok:false, error:{code, message}}`. The paperwork
 * composer typed that field as a string and put it straight into JSX, so when Lennon Kurzman's
 * journey came back 422 — "This journey is not pinned to a published Business Process revision" —
 * React refused to render the object, the Focus Panel boundary caught the throw, and the whole
 * Process Card became "This card could not be displayed."
 *
 * Measured in Chromium against the production QA build before the repair:
 *   HTTP 422 /api/admin/actions/execute {"ok":false,"error":{"code":"VALIDATION_ERROR","message":…}}
 *   [focus-panel] card "business_process" failed to render Error: Minified React error #31
 */
describe("the refusal is the message", () => {
    it("reads the message out of the envelope's error object", () => {
        expect(
            adminActionErrorMessage(
                { error: { code: "VALIDATION_ERROR", message: "This journey is not pinned to a published Business Process revision." } },
                "fallback",
            ),
        ).toBe("This journey is not pinned to a published Business Process revision.");
    });

    it("still accepts a plain string, which some routes send", () => {
        expect(adminActionErrorMessage({ error: "Unsupported entity_type" }, "fallback")).toBe("Unsupported entity_type");
    });

    it("never returns a non-string, whatever the envelope carries", () => {
        for (const error of [undefined, null, {}, { code: "X" }, { message: "" }, 42, [], { message: null }]) {
            const out = adminActionErrorMessage({ error }, "fallback");
            expect(typeof out, JSON.stringify(error)).toBe("string");
            expect(out.length).toBeGreaterThan(0);
        }
    });

    it("falls back only when the envelope says nothing", () => {
        expect(adminActionErrorMessage({ error: { code: "X" } }, "fallback")).toBe("fallback");
    });
});

/**
 * The composer has to be able to say WHOSE paperwork it is about. The recipient is an adult; the
 * subject is a child, and on a household with two children in Enrolling nothing else distinguishes
 * one send from the other.
 */
describe("the paperwork seed names its subject", () => {
    it("carries the child label from the prepared draft", () => {
        const seed = seedFromEnrollmentPaperworkDetail(
            {
                access_url: "https://example.test/forms/embed/abc",
                child_label: "Lennon Kurzman",
                recipient_person_id: "p1",
                subject: "Enrollment paperwork",
                email_body: "Please complete",
            },
            "cm1",
        );
        expect(seed.subjectLabel).toBe("Lennon Kurzman");
        expect(seed.enrollmentPaperworkChildId).toBe("cm1");
    });

    it("says nothing rather than inventing a subject when the draft names none", () => {
        const seed = seedFromEnrollmentPaperworkDetail(
            { access_url: "https://example.test/forms/embed/abc", recipient_person_id: "p1" },
            "cm1",
        );
        expect(seed.subjectLabel).toBeNull();
    });
});
