import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("seedEnrollmentQueueMembershipV1 script", () => {
    it("documents dry-run and apply env flags", () => {
        const script = read("scripts/seedEnrollmentQueueMembershipV1.ts");
        expect(script).toContain("CONFIRM_QUEUE_MEMBERSHIP_SEED=1");
        expect(script).toContain("SEED_ALL_ORGS=1");
        expect(script).toContain("planEnrollmentQueueMembershipSeed");
        expect(script).toContain("queue_definition changed");
    });

    it("seed module does not touch queue_definition in apply helpers", () => {
        const lib = read("lib/lifecycle/seedEnrollmentQueueMembershipV1.ts");
        expect(lib).toContain("does not touch queue_definition");
        expect(lib).not.toContain("queue_definition:");
    });
});
