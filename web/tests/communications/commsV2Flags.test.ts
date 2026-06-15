import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    COMMS_V2_FLAG_KEYS,
    commsV2FlagEnvName,
    isCommsV2FlagEnabled,
    type CommsV2FlagKey,
} from "@/lib/communications/v2/flags";

const CORE_FLAGS: CommsV2FlagKey[] = [
    "comms_v2_command_center",
    "comms_v2_record_tab",
    "comms_v2_composer",
    "comms_v2_live_workspace",
];

const NON_CORE_FLAGS: CommsV2FlagKey[] = COMMS_V2_FLAG_KEYS.filter(
    (key) => !CORE_FLAGS.includes(key)
);

/**
 * PKG-01 — Communications V2 feature flags.
 * Core surfaces default ON; non-core packages default OFF; explicit env tokens override.
 */
describe("Communications V2 feature flags", () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const key of COMMS_V2_FLAG_KEYS) {
            const name = commsV2FlagEnvName(key);
            saved[name] = process.env[name];
            delete process.env[name];
        }
    });

    afterEach(() => {
        for (const [name, val] of Object.entries(saved)) {
            if (val === undefined) delete process.env[name];
            else process.env[name] = val;
        }
    });

    it("defaults core flags ON when their env var is unset", () => {
        for (const key of CORE_FLAGS) {
            expect(isCommsV2FlagEnabled(key)).toBe(true);
        }
    });

    it("defaults non-core flags OFF when their env var is unset", () => {
        for (const key of NON_CORE_FLAGS) {
            expect(isCommsV2FlagEnabled(key)).toBe(false);
        }
    });

    it("maps every flag key to a distinct NEXT_PUBLIC_ env var", () => {
        const names = COMMS_V2_FLAG_KEYS.map((k) => commsV2FlagEnvName(k));
        for (const name of names) {
            expect(name.startsWith("NEXT_PUBLIC_COMMS_V2_")).toBe(true);
        }
        expect(new Set(names).size).toBe(names.length);
    });

    it.each(["1", "true", "TRUE", "Yes", " yes ", "on", "ON"])(
        "enables a core flag when its env var is the truthy token %j",
        (token) => {
            const key: CommsV2FlagKey = "comms_v2_command_center";
            process.env[commsV2FlagEnvName(key)] = token;
            expect(isCommsV2FlagEnabled(key)).toBe(true);
        }
    );

    it.each(["0", "false", "no", "off"])(
        "disables a core flag for explicit falsy value %j",
        (token) => {
            const key: CommsV2FlagKey = "comms_v2_composer";
            process.env[commsV2FlagEnvName(key)] = token;
            expect(isCommsV2FlagEnabled(key)).toBe(false);
        }
    );

    it("enables a non-core flag when its env var is explicitly truthy", () => {
        const key: CommsV2FlagKey = "comms_v2_bos";
        process.env[commsV2FlagEnvName(key)] = "1";
        expect(isCommsV2FlagEnabled(key)).toBe(true);
    });

    it("isolates flags from one another", () => {
        process.env[commsV2FlagEnvName("comms_v2_bos")] = "1";
        expect(isCommsV2FlagEnabled("comms_v2_bos")).toBe(true);
        expect(isCommsV2FlagEnabled("comms_v2_command_center")).toBe(true);
    });
});
