import { describe, expect, it } from "vitest";
import {
    resolveProgramsConcernState,
    resolveProgramsSelection,
} from "@/lib/programs/programsSelectionAdapter";

describe("Programs selection adapter", () => {
    const ids = ["program-a", "program-b"];

    it("prefers valid route over retained Continuity", () => {
        expect(
            resolveProgramsSelection({
                routeProgramId: "program-b",
                retainedProgramId: "program-a",
                validProgramIds: ids,
            }),
        ).toEqual({
            objectId: "program-b",
            source: "route",
            error: null,
            shouldSyncRoute: false,
        });
    });

    it("restores retained Program when route omits selection", () => {
        expect(
            resolveProgramsSelection({
                routeProgramId: null,
                retainedProgramId: "program-a",
                validProgramIds: ids,
            }),
        ).toEqual({
            objectId: "program-a",
            source: "retained",
            error: null,
            shouldSyncRoute: true,
        });
    });

    it("never invents a first-Program default", () => {
        expect(
            resolveProgramsSelection({
                routeProgramId: null,
                retainedProgramId: null,
                validProgramIds: ids,
            }),
        ).toEqual({
            objectId: null,
            source: "none",
            error: null,
            shouldSyncRoute: false,
        });
    });

    it("fails closed on invalid route Program", () => {
        expect(
            resolveProgramsSelection({
                routeProgramId: "missing",
                retainedProgramId: "program-a",
                validProgramIds: ids,
            }),
        ).toEqual({
            objectId: null,
            source: "none",
            error: "Program not found or unavailable.",
            shouldSyncRoute: false,
        });
    });

    it("projects concern from route when Program or section changes", () => {
        expect(
            resolveProgramsConcernState({
                routeSection: "publication",
                localSection: "overview",
                routeProgramId: "program-a",
                localProgramId: "program-a",
            }),
        ).toEqual({ section: "publication", objectChanged: false });

        expect(
            resolveProgramsConcernState({
                routeSection: "overview",
                localSection: "overview",
                routeProgramId: "program-b",
                localProgramId: "program-a",
            }).objectChanged,
        ).toBe(true);
    });
});
