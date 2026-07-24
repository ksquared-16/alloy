import { describe, expect, it } from "vitest";
import {
    resolveLocationsConcernState,
    resolveLocationsSelection,
} from "@/lib/locations/locationsSelectionAdapter";

describe("Locations selection adapter", () => {
    const sites = ["site-a", "site-b"];

    it("prefers valid route locationId over retained", () => {
        expect(
            resolveLocationsSelection({
                routeLocationId: "site-b",
                retainedLocationId: "site-a",
                validSiteIds: sites,
            }),
        ).toEqual({
            locationId: "site-b",
            source: "route",
            error: null,
            shouldSyncRoute: false,
        });
    });

    it("restores valid retained selection when route omits locationId", () => {
        expect(
            resolveLocationsSelection({
                routeLocationId: null,
                retainedLocationId: "site-a",
                validSiteIds: sites,
            }),
        ).toEqual({
            locationId: "site-a",
            source: "retained",
            error: null,
            shouldSyncRoute: true,
        });
    });

    it("fails closed on invalid route id without inventing a default", () => {
        expect(
            resolveLocationsSelection({
                routeLocationId: "missing",
                retainedLocationId: "site-a",
                validSiteIds: sites,
            }),
        ).toEqual({
            locationId: null,
            source: "none",
            error: "Location not found or unavailable.",
            shouldSyncRoute: false,
        });
    });

    it("ignores invalid retained ids", () => {
        expect(
            resolveLocationsSelection({
                routeLocationId: null,
                retainedLocationId: "deleted",
                validSiteIds: sites,
            }),
        ).toEqual({
            locationId: null,
            source: "none",
            error: null,
            shouldSyncRoute: false,
        });
    });

    it("returns landing none when no selection exists", () => {
        expect(
            resolveLocationsSelection({
                routeLocationId: null,
                retainedLocationId: null,
                validSiteIds: sites,
            }).source,
        ).toBe("none");
    });

    it("projects concern tab from route on location change", () => {
        expect(
            resolveLocationsConcernState({
                routeTab: "rooms",
                routeItemId: "room-1",
                localTab: "overview",
                localItemId: null,
                routeLocationId: "site-b",
                localLocationId: "site-a",
            }),
        ).toEqual({
            tab: "rooms",
            itemId: "room-1",
            locationChanged: true,
        });
    });
});
