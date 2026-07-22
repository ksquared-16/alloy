import { describe, expect, it } from "vitest";
import {
    applyMakeAvailableRefreshTargets,
    createMakeAvailableIdempotencyKey,
    makeAvailableIntentFingerprint,
} from "@/lib/programs/makeProgramAvailableClient";
import {
    isProgramLocationAvailabilityPrototype,
    PROGRAM_LOCATION_AVAILABILITY_STAGE,
} from "@/lib/configRuntime/programLocationAvailabilityPrototypeModel";
import { resetConfigurationInvalidationForTests } from "@/lib/configRuntime/configurationInvalidation";

describe("makeProgramAvailableClient", () => {
    it("is production stage — no prototype fixture mutation", () => {
        expect(PROGRAM_LOCATION_AVAILABILITY_STAGE).toBe("production");
        expect(isProgramLocationAvailabilityPrototype()).toBe(false);
    });

    it("creates stable idempotency keys and regenerates fingerprint on intent change", () => {
        const key = createMakeAvailableIdempotencyKey();
        expect(key.startsWith("make-available:")).toBe(true);
        const a = makeAvailableIntentFingerprint({
            program: { kind: "existing", programId: "p1" },
            locationIds: ["b", "a"],
        });
        const b = makeAvailableIntentFingerprint({
            program: { kind: "existing", programId: "p1" },
            locationIds: ["a", "b"],
        });
        const c = makeAvailableIntentFingerprint({
            program: { kind: "existing", programId: "p1" },
            locationIds: ["a", "b", "c"],
        });
        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });

    it("maps refreshTargets into Continuity scopes without crashing", () => {
        resetConfigurationInvalidationForTests();
        expect(() =>
            applyMakeAvailableRefreshTargets({
                orgId: null,
                refreshTargets: [
                    "programs:collection",
                    "locations:location:loc-1:programs",
                    "organization:programs-locations",
                ],
            }),
        ).not.toThrow();
    });
});
