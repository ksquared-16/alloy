/**
 * Phase A certification (A9) — cross-provider convergence sweep.
 *
 * Asserts every canonical contract exists and is wired, so downstream phases
 * (C consumer migration, D capacity ops, E legacy removal) build against stable
 * seams. This is the Phase-A analogue of globalCanonicalFieldConsumerConvergence:
 * it certifies the providers are present and honour the shared status model; it
 * does NOT migrate consumers (that is Phase C+).
 */

import { describe, expect, it } from "vitest";

// A8 — shared contracts
import {
    mergeResolutionStatus,
    sortAppliedRules,
    sortWarnings,
} from "@/lib/location/operationalResolutionContracts";
import { isChildcareLocationType } from "@/lib/location/canonicalLocationModel";
import { DEFAULT_MIXED_AGE_RATIO_POLICY } from "@/lib/childcareOperational/capacity/capacityContractTypes";

// A7 — config hardening
import { resolveConfigRule } from "@/lib/childcareOperational/config/resolveConfigRule";
import { resolveLicensedCeiling, validateLicensedOverrideNotWeaker } from "@/lib/childcareOperational/config/regulatoryCeiling";

// A1 — Location provider
import {
    canonicalLocationDisplay,
    normalizeLocationRow,
    resolveLocationById,
    resolveLocationHierarchy,
    resolveLocationsForOrganization,
    resolveLocationsForUser,
    resolveSiteLocations,
} from "@/lib/location/canonicalLocationProvider";

// A2 — Program provider
import {
    findOrphanOfferingProgramKeys,
    resolveProgramByKey,
    resolveProgramsForLocation,
    resolveProgramsForOrganization,
} from "@/lib/programs/canonicalProgramProvider";

// A3 — Room provider
import {
    resolveRoomById,
    resolveRoomsForLocation,
    resolveRoomsForProgram,
    toCanonicalRoom,
} from "@/lib/location/canonicalRoomProvider";
import { KNOWN_ROOM_DIRECT_QUERY_OFFENDERS } from "@/lib/location/roomConsumerConvergence";

// A4 — Timezone provider
import {
    buildOperationalTimeContext,
    dualTimeLabel,
    formatInLocationTz,
    resolveLocationTimezone,
    resolveRecipientTimezone,
    resolveViewerTimezone,
} from "@/lib/location/timezoneResolution";

// A6 — Ratio resolver
import { resolveApplicableRatioRules, resolveMixedAgeRatio, resolveRatio } from "@/lib/childcareOperational/capacity/resolveRatio";

// A5 — Capacity resolver
import { resolveOperationalCapacity } from "@/lib/childcareOperational/capacity/resolveOperationalCapacity";

const fns = {
    // A1
    normalizeLocationRow,
    canonicalLocationDisplay,
    resolveLocationsForOrganization,
    resolveLocationsForUser,
    resolveSiteLocations,
    resolveLocationById,
    resolveLocationHierarchy,
    // A2
    resolveProgramsForOrganization,
    resolveProgramsForLocation,
    resolveProgramByKey,
    findOrphanOfferingProgramKeys,
    // A3
    resolveRoomsForLocation,
    resolveRoomById,
    resolveRoomsForProgram,
    toCanonicalRoom,
    // A4
    resolveLocationTimezone,
    resolveViewerTimezone,
    resolveRecipientTimezone,
    formatInLocationTz,
    dualTimeLabel,
    buildOperationalTimeContext,
    // A5/A6
    resolveOperationalCapacity,
    resolveRatio,
    resolveMixedAgeRatio,
    resolveApplicableRatioRules,
    // A7
    resolveConfigRule,
    resolveLicensedCeiling,
    validateLicensedOverrideNotWeaker,
};

describe("Phase A certification — every canonical contract is exported and callable", () => {
    it("exposes all provider/resolver entrypoints as functions", () => {
        for (const [name, fn] of Object.entries(fns)) {
            expect(typeof fn, `${name} should be a function`).toBe("function");
        }
    });
});

describe("Phase A certification — shared status model + scope boundary", () => {
    it("resolution status merges deterministically and address is excluded from childcare", () => {
        expect(mergeResolutionStatus(["resolved", "incomplete"])).toBe("incomplete");
        expect(typeof sortWarnings).toBe("function");
        expect(typeof sortAppliedRules).toBe("function");
        expect(isChildcareLocationType("address")).toBe(false);
        expect(DEFAULT_MIXED_AGE_RATIO_POLICY).toBe("most_restrictive");
    });

    it("the Room consumer-convergence ledger is enumerated as the Phase C burn-down target", () => {
        expect(KNOWN_ROOM_DIRECT_QUERY_OFFENDERS.length).toBeGreaterThan(0);
    });
});
