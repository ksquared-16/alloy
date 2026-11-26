/**
 * Twenty messages were three problems.
 *
 * The certification tenant's validation wall was eleven command-stamping errors, three missing status
 * mappings and six grain-handoff errors. Flat, that reads as twenty independent defects and invites
 * twenty edits. These controls pin the grouping that makes the real shape visible — without hiding a
 * single error, code or path.
 */

import { describe, expect, it } from "vitest";
import { areaForPublicationError, groupPublicationErrors, summarizePublicationErrors } from "@/lib/businessProcesses/configuration/groupPublicationErrors";
import type { ConfigurationError } from "@/lib/businessProcesses/configuration/configurationDiagnostics";

const err = (code: string, message: string): ConfigurationError => ({ code, message } as ConfigurationError);

/** The real wall, by code and message shape. */
const REAL_WALL: ConfigurationError[] = [
    ...Array.from({ length: 3 }, () => err("stage_operating_contract", "Close semantics require a configured closed status.")),
    ...Array.from({ length: 6 }, () => err("stage_operating_contract", 'This path moves a family to "Enrolling", which is configured for individual children. Choose a family stage instead.')),
    ...Array.from({ length: 11 }, () => err("process_command_set_incomplete", "Work Template on 'lead' references 'quick_message' which is not process-selected.")),
];

describe("the wall groups into the problems it actually is", () => {
    it("turns twenty messages into three areas", () => {
        const groups = groupPublicationErrors(REAL_WALL);
        expect(groups).toHaveLength(3);
        expect(summarizePublicationErrors(REAL_WALL)).toBe("3 configuration areas need attention");
    });

    it("keeps every error — grouping is not filtering", () => {
        const total = groupPublicationErrors(REAL_WALL).reduce((n, g) => n + g.errors.length, 0);
        expect(total).toBe(REAL_WALL.length);
    });

    it("splits the one code that spans two areas", () => {
        // `stage_operating_contract` carries both status and grain problems, so it is the single
        // case that has to read the message rather than the code.
        const groups = groupPublicationErrors(REAL_WALL);
        expect(groups.find((g) => g.area === "statuses")?.errors).toHaveLength(3);
        expect(groups.find((g) => g.area === "stage_movement")?.errors).toHaveLength(6);
        expect(groups.find((g) => g.area === "commands_and_actions")?.errors).toHaveLength(11);
    });

    it("keys on codes, not copy, for every other area", () => {
        // A reworded message must not re-group itself.
        expect(areaForPublicationError(err("process_command_set_incomplete", "anything at all"))).toBe("commands_and_actions");
        expect(areaForPublicationError(err("process_entry_stage_unresolvable", "anything"))).toBe("stage_movement");
        expect(areaForPublicationError(err("duplicate_stage_key", "anything"))).toBe("structure");
    });

    it("orders the areas as the operator should work through them", () => {
        const mixed = [err("process_command_set_incomplete", "x"), err("duplicate_stage_key", "y"), err("stage_operating_contract", "grain")];
        expect(groupPublicationErrors(mixed).map((g) => g.area)).toEqual(["structure", "stage_movement", "commands_and_actions"]);
    });

    it("says so plainly when there is nothing to fix", () => {
        expect(groupPublicationErrors([])).toHaveLength(0);
        expect(summarizePublicationErrors([])).toBe("Ready to publish.");
    });

    it("does not silently swallow an unrecognised code", () => {
        expect(areaForPublicationError(err("something_new", "x"))).toBe("other");
        expect(groupPublicationErrors([err("something_new", "x")])[0]!.label).toBe("Other");
    });
});
