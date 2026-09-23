/**
 * The deep link's date half.
 *
 * `OpenRosterModalDetail` has always documented that "site + room + date" travel
 * across a handoff so context is never reset, and the workspace applied the first
 * two and dropped the third — a link naming a day opened on today, silently. The
 * type is the contract, so this asserts the field still exists and that the
 * workspace reads it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const WORKSPACE = resolve(__dirname, "../../components/adminV2/roster/RosterWorkspace.tsx");
const EVENTS = resolve(__dirname, "../../lib/adminV2/workspaceModalEvents.ts");

describe("workspace deep link", () => {
    it("declares a date on the detail", () => {
        expect(readFileSync(EVENTS, "utf8")).toMatch(/date\?:\s*string\s*\|\s*null;/);
    });

    it("applies that date to the shared day anchor", () => {
        const src = readFileSync(WORKSPACE, "utf8");
        expect(src).toMatch(/if \(detail\.date\) setRosterDay\(detail\.date\);/);
    });

    it("offers Calendar as a deep-linkable section", () => {
        const sections = readFileSync(
            resolve(__dirname, "../../app/adminV2/operations/operationsSections.ts"),
            "utf8"
        );
        expect(sections).toMatch(/if \(raw === "calendar"\) return "calendar";/);
        expect(sections).toContain('{ key: "calendar", label: "Calendar" }');
    });
});
