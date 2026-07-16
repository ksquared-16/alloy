import { describe, expect, it } from "vitest";
import {
    buildLocationIdentityFacts,
    formatLocationLocality,
    formatLocationTimezoneLabel,
} from "@/lib/locations/locationIdentityPresentation";

describe("location identity presentation", () => {
    it("prefers locality and friendly timezone labels", () => {
        expect(formatLocationLocality({ city: "Bend", state: "OR" })).toBe("Bend, Oregon");
        expect(formatLocationTimezoneLabel("America/Los_Angeles")).toBe("Pacific Time");
        expect(formatLocationTimezoneLabel("UTC")).toBeNull();
        expect(
            buildLocationIdentityFacts({
                city: "Bend",
                state: "OR",
                timezoneIana: "America/Los_Angeles",
            }),
        ).toEqual(["Bend, Oregon", "Pacific Time"]);
    });

    it("shows friendly timezone alone when locality is missing", () => {
        expect(
            buildLocationIdentityFacts({
                city: null,
                state: null,
                timezoneIana: "America/Los_Angeles",
            }),
        ).toEqual(["Pacific Time"]);
    });

    it("omits the fact line when nothing can be represented cleanly", () => {
        expect(
            buildLocationIdentityFacts({
                city: null,
                state: null,
                timezoneIana: "America/Toronto",
            }),
        ).toEqual([]);
    });
});
