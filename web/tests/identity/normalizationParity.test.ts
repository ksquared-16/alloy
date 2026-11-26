import { describe, expect, it } from "vitest";
import {
    normalizeDob,
    normalizeEmail,
    normalizeName,
    normalizePhone,
    phoneDigitsNanp,
    phoneLookupVariants,
} from "@/lib/identity";
import { normalizeEmail as intakeNormalizeEmail } from "@/lib/intake/normalize/email";
import { normalizePhoneDigits } from "@/lib/intake/normalize/phone";
import { parseFlexibleDate } from "@/lib/intake/normalize/date";
import {
    normalizeIntakeEmail,
    normalizeIntakePhone,
    phoneLookupVariants as intakePhoneLookupVariants,
} from "@/lib/forms/intake/intakePersonMatch";
import {
    normalizeEmailForFindOrCreate,
    normalizePhoneForFindOrCreate,
} from "@/lib/identity/compat";
import { normalizeEmail as contactNormalizeEmail, normalizePhone as contactNormalizePhone } from "@/lib/contactNormalize";
import { normalizeBookingEmail, normalizeBookingPhone } from "@/lib/bookingIdentityNormalize";

describe("lib/identity canonicalize", () => {
    it("normalizeEmail: trim+lower; empty→null", () => {
        expect(normalizeEmail("  User@EXAMPLE.COM ")).toBe("user@example.com");
        expect(normalizeEmail("")).toBeNull();
        expect(normalizeEmail("   ")).toBeNull();
        expect(normalizeEmail(null)).toBeNull();
        expect(normalizeEmail(undefined)).toBeNull();
    });

    it("normalizePhone: canonical E.164 NANP +1XXXXXXXXXX", () => {
        expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
        expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
        expect(normalizePhone("15551234567")).toBe("+15551234567");
        expect(normalizePhone("5551234567")).toBe("+15551234567");
        expect(normalizePhone("")).toBeNull();
        expect(normalizePhone("   ")).toBeNull();
        expect(normalizePhone(null)).toBeNull();
    });

    it("normalizeName: trim+lower+collapse whitespace; empty→null", () => {
        expect(normalizeName("  Jane   Marie  Doe ")).toBe("jane marie doe");
        expect(normalizeName("")).toBeNull();
        expect(normalizeName("   ")).toBeNull();
        expect(normalizeName(null)).toBeNull();
    });

    it("normalizeDob: ISO YYYY-MM-DD variants", () => {
        expect(normalizeDob("2024-02-02")).toBe("2024-02-02");
        expect(normalizeDob("2/2/24")).toBe("2024-02-02");
        expect(normalizeDob("Feb 2 2024")).toBe("2024-02-02");
        expect(normalizeDob("2 February 2024")).toBe("2024-02-02");
        expect(normalizeDob("")).toBeNull();
        expect(normalizeDob("not a date")).toBeNull();
        expect(normalizeDob("2/31/2024")).toBeNull();
    });

    it("phoneLookupVariants covers +1 / 10-digit / formatted", () => {
        const v = phoneLookupVariants("+15551234567");
        expect(v).toContain("+15551234567");
        expect(v).toContain("5551234567");
        expect(v).toContain("15551234567");
        expect(v.some((x) => x.includes("("))).toBe(true);
    });
});

describe("parity vs intake call sites (byte-identical adapters)", () => {
    const emails = ["  User@EXAMPLE.COM ", "a@b.co", "", "   ", "Mixed.Case@Domain.ORG"];
    const phones = [
        "(555) 123-4567",
        "+1 (555) 123-4567",
        "5551234567",
        "15551234567",
        "  ",
        "123",
        "abc",
        "11231231234",
    ];
    const names = ["  Jane   Doe ", "Pat", "", "  A   B  C  "];
    const dobs = ["2.2.24", "02/02/24", "2024-02-02", "Feb 2, 2024", "2/31/2024", ""];

    it("intake normalizeEmail matches adapter string form", () => {
        for (const e of emails) {
            expect(intakeNormalizeEmail(e)).toBe(e.trim().toLowerCase());
        }
    });

    it("normalizeIntakeEmail matches empty→null corpus", () => {
        expect(normalizeIntakeEmail("  User@EXAMPLE.COM ")).toBe("user@example.com");
        expect(normalizeIntakeEmail("   ")).toBeNull();
        expect(normalizeIntakeEmail(null)).toBeNull();
        expect(normalizeIntakeEmail(undefined)).toBeNull();
    });

    it("intake normalizePhoneDigits / normalizeIntakePhone parity on corpus", () => {
        for (const p of phones) {
            const legacyDigits = (() => {
                const digits = p.replace(/\D/g, "");
                if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
                return digits;
            })();
            expect(normalizePhoneDigits(p)).toBe(legacyDigits);
            expect(phoneDigitsNanp(p)).toBe(legacyDigits);

            const intakeLegacy =
                typeof p === "string"
                    ? (() => {
                          const digits = p.replace(/\D/g, "");
                          if (!digits.length) return null;
                          if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
                          return digits;
                      })()
                    : null;
            expect(normalizeIntakePhone(p)).toBe(intakeLegacy);
        }
    });

    it("intake phoneLookupVariants order/content for 10-digit", () => {
        const expected = [
            "5551234567",
            "+15551234567",
            "15551234567",
            "(555) 123-4567",
            "555-123-4567",
            "555.123.4567",
        ];
        expect(intakePhoneLookupVariants("5551234567")).toEqual(expected);
    });

    it("parseFlexibleDate delegates to normalizeDob", () => {
        for (const d of dobs) {
            expect(parseFlexibleDate(d)).toBe(normalizeDob(d));
        }
    });

    it("normalizeName collapse matches double-space corpus", () => {
        for (const n of names) {
            const legacy =
                typeof n === "string" ? n.trim().toLowerCase().replace(/\s+/g, " ") : "";
            const canon = normalizeName(n);
            expect(canon ?? "").toBe(legacy === "" ? "" : legacy);
        }
    });

    it("findOrCreate compat: email canonical; phone trim-only (legacy preserved)", () => {
        expect(normalizeEmailForFindOrCreate("  A@B.COM ")).toBe("a@b.com");
        expect(normalizeEmailForFindOrCreate("  ")).toBeNull();
        expect(normalizePhoneForFindOrCreate("  (555) 123-4567  ")).toBe("(555) 123-4567");
        expect(normalizePhoneForFindOrCreate("  ")).toBeNull();
        // Explicitly NOT E.164 at this call site (behavior preserved)
        expect(normalizePhoneForFindOrCreate("(555) 123-4567")).not.toBe("+15551234567");
    });
});

describe("legacy normalizer divergence (reported; booking/comms not re-pointed in B1a)", () => {
    it("contactNormalizePhone aligns with E.164 for NANP 10/11", () => {
        expect(contactNormalizePhone("(555) 123-4567")).toBe(normalizePhone("(555) 123-4567"));
        expect(contactNormalizePhone("15551234567")).toBe(normalizePhone("15551234567"));
        expect(contactNormalizeEmail("  A@B.COM ")).toBe(normalizeEmail("  A@B.COM "));
    });

    it("bookingIdentityNormalize phone: empty digits returns trimmed (diverges from null)", () => {
        expect(normalizeBookingPhone("abc")).toBe("abc");
        expect(normalizePhone("abc")).toBeNull();
        expect(normalizeBookingEmail("  A@B.COM ")).toBe("a@b.com");
        // booking empty email → "" ; canonical → null
        expect(normalizeBookingEmail("  ")).toBe("");
        expect(normalizeEmail("  ")).toBeNull();
    });
});
