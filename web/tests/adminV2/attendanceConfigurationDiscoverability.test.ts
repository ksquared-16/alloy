/**
 * Thread 8 — a configuration surface nobody can find is not configured.
 *
 * The inventory's headline finding was that kiosk devices, external producers and
 * Attendance-affecting expectations were absent from Settings ENTIRELY while
 * their runtime substrate was promoted and working. These pin the fix at the
 * place it actually failed: the domain registry an administrator browses.
 *
 * A route that exists but is unregistered is exactly the state Thread 8 found, so
 * asserting the page files exist would miss the whole point.
 */

import { describe, expect, it } from "vitest";
import { CONFIGURATION_WORKSPACE_DOMAINS } from "@/lib/adminV2/configurationWorkspaceDomains";

const allItems = CONFIGURATION_WORKSPACE_DOMAINS.flatMap((d) =>
    d.items.map((i) => ({ domain: d.id, ...i })),
);

function item(hrefFragment: string) {
    return allItems.find((i) => i.href.includes(hrefFragment));
}

describe("Attendance configuration is discoverable from the configuration hub", () => {
    it("registers trusted devices, under the domain that owns who may act", () => {
        const entry = item("attendance-devices");
        expect(entry).toBeDefined();
        // Organization is "who uses the system and where"; a kiosk is an actor
        // that may author attendance facts at a site.
        expect(entry?.domain).toBe("organization");
    });

    it("registers connected systems", () => {
        const entry = item("attendance-integrations");
        expect(entry).toBeDefined();
        expect(entry?.domain).toBe("organization");
    });

    it("registers where expected absence and closures are managed, under Operations", () => {
        const entry = item("attendance-expectations");
        expect(entry).toBeDefined();
        expect(entry?.domain).toBe("operations");
    });
});

describe("the entries speak operator language", () => {
    it("never names a table, a key or an internal noun", () => {
        const forbidden = [
            "kiosk",
            "producer",
            "unit_role",
            "attendance_capture_scope",
            "last_seen",
            "expectation_type",
            "grain",
        ];
        for (const fragment of ["attendance-devices", "attendance-integrations", "attendance-expectations"]) {
            const entry = item(fragment);
            const text = `${entry?.label ?? ""} ${entry?.description ?? ""}`.toLowerCase();
            for (const word of forbidden) {
                expect(text).not.toContain(word);
            }
        }
    });

    it("gives each entry a description, so the hub explains rather than lists", () => {
        for (const fragment of ["attendance-devices", "attendance-integrations", "attendance-expectations"]) {
            expect(item(fragment)?.description ?? "").not.toBe("");
        }
    });
});

describe("Attendance did not grow its own configuration domain", () => {
    it("adds no new top-level domain", () => {
        // The platform law is that Attendance inherits existing architecture. An
        // "Attendance" domain would be the Attendance Studio this thread must not
        // build.
        expect(CONFIGURATION_WORKSPACE_DOMAINS.map((d) => d.id)).toEqual([
            "organization",
            "data_model",
            "operations",
            "experience",
            "commercial",
        ]);
    });
});
