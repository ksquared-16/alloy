/**
 * Scenario L (rotation) and Scenario M (abuse), at the unit level.
 *
 * Both are properties that look present in a code review and are absent in
 * practice, which is why they are asserted rather than argued: a "rotation" that
 * leaves the old secret working, and a "rate limit" keyed on the thing being
 * guessed.
 */

import { describe, expect, it, beforeEach } from "vitest";

import {
    KIOSK_RATE_LIMIT,
    clearKioskIdentifyBudget,
    kioskRateLimitKey,
    resetKioskRateLimitsForTests,
    takeKioskRateLimit,
} from "@/lib/childcareOperational/attendance/kiosk/kioskRateLimit";
import {
    generateKioskDeviceCredential,
    generateKioskPersonCode,
} from "@/lib/childcareOperational/attendance/kiosk/kioskCredentialRotation";
import { hashKioskCredential } from "@/lib/childcareOperational/attendance/kiosk/kioskDeviceAuthority";
import { hashKioskPersonCode } from "@/lib/childcareOperational/attendance/kiosk/kioskSessionGateway";

const DEVICE = "kiosk:front-desk";

beforeEach(() => resetKioskRateLimitsForTests());

describe("the identification budget binds the GUESSER, not the guess", () => {
    it("does not key the window on the code, which would give every wrong guess its own budget", () => {
        // The failure this prevents: a limiter that counts to one, forever.
        const key = kioskRateLimitKey(null, "identify", DEVICE);
        expect(key).toContain(DEVICE);
        expect(key).not.toContain("ABC123");
    });

    it("blocks after the budget and reports a retry-after", () => {
        const max = KIOSK_RATE_LIMIT.identify.max;
        for (let i = 0; i < max; i += 1) {
            expect(takeKioskRateLimit(null, "identify", DEVICE), `attempt ${i + 1}`).toBeNull();
        }
        const blocked = takeKioskRateLimit(null, "identify", DEVICE);
        expect(blocked).not.toBeNull();
        expect(blocked as number).toBeGreaterThan(0);
    });

    it("keeps one device's failures away from another's budget", () => {
        for (let i = 0; i < KIOSK_RATE_LIMIT.identify.max; i += 1) takeKioskRateLimit(null, "identify", DEVICE);
        expect(takeKioskRateLimit(null, "identify", "kiosk:other-room")).toBeNull();
    });

    it("keeps capture and identify on separate budgets", () => {
        for (let i = 0; i < KIOSK_RATE_LIMIT.identify.max; i += 1) takeKioskRateLimit(null, "identify", DEVICE);
        // A family mid-check-in must not be blocked by somebody's earlier typos.
        expect(takeKioskRateLimit(null, "capture", DEVICE)).toBeNull();
    });

    it("forgives the budget once a code actually resolves", () => {
        for (let i = 0; i < KIOSK_RATE_LIMIT.identify.max; i += 1) takeKioskRateLimit(null, "identify", DEVICE);
        expect(takeKioskRateLimit(null, "identify", DEVICE)).not.toBeNull();
        clearKioskIdentifyBudget(null, DEVICE);
        // Only SUCCESS clears it, so a run of pure failures still binds.
        expect(takeKioskRateLimit(null, "identify", DEVICE)).toBeNull();
    });

    it("budgets identification more tightly than capture", () => {
        expect(KIOSK_RATE_LIMIT.identify.max).toBeLessThan(KIOSK_RATE_LIMIT.capture.max);
    });
});

describe("issued secrets are the shape they claim to be", () => {
    it("draws person codes from an alphabet with no lookalike characters", () => {
        // These are read aloud at a desk and typed on glass; O/0 and I/1 turn a
        // rotation into a support call.
        for (let i = 0; i < 40; i += 1) {
            expect(generateKioskPersonCode()).toMatch(/^[ABCDEFGHJKLMNPQRTUVWXY2346789]{8}$/);
        }
    });

    it("does not repeat itself", () => {
        const codes = new Set(Array.from({ length: 200 }, () => generateKioskPersonCode()));
        expect(codes.size).toBeGreaterThan(190);
        const creds = new Set(Array.from({ length: 50 }, () => generateKioskDeviceCredential()));
        expect(creds.size).toBe(50);
    });

    it("makes device credentials far longer than person codes — they are never typed", () => {
        expect(generateKioskDeviceCredential().length).toBeGreaterThan(generateKioskPersonCode().length * 3);
    });
});

describe("rotation changes the answer, which is the whole point", () => {
    it("gives a rotated device credential a different selector", () => {
        // Resolution selects BY the hash, so a changed hash is a changed lookup:
        // the old secret stops matching any row rather than matching a stale one.
        const before = generateKioskDeviceCredential();
        const after = generateKioskDeviceCredential();
        expect(hashKioskCredential(before)).not.toBe(hashKioskCredential(after));
    });

    it("gives a rotated person code a different selector", () => {
        expect(hashKioskPersonCode(generateKioskPersonCode())).not.toBe(
            hashKioskPersonCode(generateKioskPersonCode()),
        );
    });

    it("treats a person code case-insensitively but a device credential exactly", () => {
        // A parent typing "abc123" at a tablet means the same code. A device
        // credential is machine-held, so case is signal, not noise.
        expect(hashKioskPersonCode("abc123")).toBe(hashKioskPersonCode("ABC123"));
        expect(hashKioskCredential("aBc")).not.toBe(hashKioskCredential("AbC"));
    });
});
