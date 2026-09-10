/**
 * Scenario H and N at the unit level: the shared device forgets.
 *
 * The leak this guards against is accumulation — one field left behind on one
 * path. So the test asserts the PROPERTY ("holds no family state") rather than
 * listing fields, because a list is exactly what goes stale when a field is added.
 */

import { describe, expect, it } from "vitest";
import {
    IDLE_INTERACTION,
    KIOSK_IDLE_TIMEOUT_MS,
    holdsFamilyState,
    resetInteraction,
    type KioskInteraction,
} from "@/lib/childcareOperational/attendance/kiosk/kioskInteractionState";

const BUSY: KioskInteraction = {
    step: "done",
    code: "ABC123",
    operation: "check_out",
    children: [{ child_id: "emma", display_name: "Emma Stone", eligible: true, message: null }],
    selected: ["emma"],
    results: [{ child_id: "emma", display_name: "Emma Stone", recorded: true, message: null }],
    notice: "Something happened",
    operationToken: "tok-1",
    operationEventAt: "2026-09-18T08:00:00.000Z",
};

describe("reset forgets the family, completely", () => {
    it("holds nothing after a reset, whatever it held before", () => {
        expect(holdsFamilyState(BUSY)).toBe(true);
        expect(holdsFamilyState(resetInteraction())).toBe(false);
    });

    it("returns to idle", () => {
        expect(resetInteraction().step).toBe("idle");
    });

    it("builds a fresh object rather than spreading the previous one", () => {
        // A spread is how a field survives a reset everybody believed was total.
        const reset = resetInteraction();
        expect(reset).toEqual(IDLE_INTERACTION);
        expect(reset).not.toBe(IDLE_INTERACTION);
        reset.code = "mutated";
        expect(IDLE_INTERACTION.code).toBe("");
    });

    it("notices family state in EVERY field, so a new one cannot be forgotten quietly", () => {
        const fields: Partial<KioskInteraction>[] = [
            { code: "A" },
            { children: BUSY.children },
            { selected: ["emma"] },
            { results: BUSY.results },
            { operation: "check_in" },
            { operationToken: "t" },
            { operationEventAt: "2026-09-18T08:00:00.000Z" },
            { notice: "n" },
        ];
        for (const patch of fields) {
            expect(holdsFamilyState({ ...IDLE_INTERACTION, ...patch }), JSON.stringify(patch)).toBe(true);
        }
    });

    it("forgets on its own within a lobby-appropriate time", () => {
        expect(KIOSK_IDLE_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
        expect(KIOSK_IDLE_TIMEOUT_MS).toBeGreaterThan(10_000);
    });
});
