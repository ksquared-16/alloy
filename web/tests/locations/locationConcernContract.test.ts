import { describe, expect, it } from "vitest";
import {
    LOCATION_CONCERN_REGISTRY,
    adjacentLocationConcerns,
    locationConcernCompatibilityHref,
    locationConcernHref,
    projectLocationConcernTransition,
    resolveActiveLocationConcern,
    shouldApplyLocationConcernResponse,
} from "@/lib/locations/locationConcernContract";

describe("Location concern contract", () => {
    it("registers every live Location concern, in operator order", () => {
        // Eight since Slice 12. The object-centric rewrite (2c6f0f261) retired the
        // section-first IA without re-homing Operational Rules, so canonical
        // capacity, ratio, operating-window and schedule authoring had no operator
        // path at all. It sits after Scheduling, where the operational
        // configuration it governs already lives.
        expect(LOCATION_CONCERN_REGISTRY.map((c) => c.key)).toEqual([
            "overview",
            "programs",
            "rooms",
            "schedule",
            "operational-rules",
            "tours",
            "placement",
            "access",
        ]);
    });

    it("resolves active concern from route and normalizes invalid tabs", () => {
        expect(resolveActiveLocationConcern("rooms")).toEqual({ concern: "rooms", normalized: false });
        expect(resolveActiveLocationConcern(undefined)).toEqual({
            concern: "overview",
            normalized: false,
        });
        expect(resolveActiveLocationConcern("not-a-tab")).toEqual({
            concern: "overview",
            normalized: true,
        });
    });

    it("builds canonical and compatibility concern hrefs", () => {
        expect(locationConcernHref("site-1", "schedule", "pat-9")).toBe(
            "/organization/locations?locationId=site-1&tab=schedule&itemId=pat-9",
        );
        expect(locationConcernCompatibilityHref("site-1", "tours")).toBe(
            "/settings/locations?locationId=site-1&tab=tours",
        );
    });

    it("projects unloaded vs empty vs refreshing distinctly", () => {
        expect(
            projectLocationConcernTransition({
                hasPriorContent: false,
                loading: true,
                refreshing: false,
                error: null,
            }),
        ).toBe("cold");
        expect(
            projectLocationConcernTransition({
                hasPriorContent: true,
                loading: false,
                refreshing: true,
                error: null,
            }),
        ).toBe("refreshing");
        expect(
            projectLocationConcernTransition({
                hasPriorContent: false,
                loading: false,
                refreshing: false,
                error: null,
                isEmptyResult: true,
            }),
        ).toBe("empty");
        expect(
            projectLocationConcernTransition({
                hasPriorContent: false,
                loading: false,
                refreshing: false,
                error: null,
                forbidden: true,
            }),
        ).toBe("forbidden");
    });

    it("rejects stale concern responses when seq or location drifts", () => {
        expect(
            shouldApplyLocationConcernResponse({
                requestSeq: 1,
                latestSeq: 2,
                requestLocationId: "a",
                activeLocationId: "a",
            }),
        ).toBe(false);
        expect(
            shouldApplyLocationConcernResponse({
                requestSeq: 2,
                latestSeq: 2,
                requestLocationId: "a",
                activeLocationId: "b",
            }),
        ).toBe(false);
        expect(
            shouldApplyLocationConcernResponse({
                requestSeq: 2,
                latestSeq: 2,
                requestLocationId: "a",
                activeLocationId: "a",
                requestConcern: "rooms",
                activeConcern: "schedule",
            }),
        ).toBe(false);
        expect(
            shouldApplyLocationConcernResponse({
                requestSeq: 2,
                latestSeq: 2,
                requestLocationId: "a",
                activeLocationId: "a",
                requestConcern: "access",
                activeConcern: "access",
            }),
        ).toBe(true);
    });

    it("lists adjacent concerns for prefetch policy", () => {
        expect(adjacentLocationConcerns("rooms")).toEqual(["programs", "schedule"]);
        expect(adjacentLocationConcerns("overview")).toEqual(["programs"]);
    });
});
