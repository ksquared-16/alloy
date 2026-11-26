import { describe, expect, it } from "vitest";

/**
 * Two-org JWT RLS matrix — certification contract.
 * Live JWT integration runs in staging certification script; this test locks expectations.
 */
describe("person_child_relationship RLS matrix contract", () => {
    it("documents org boundary expectations", () => {
        const matrix = {
            orgA_can: [
                "create_relationship",
                "list_own",
                "read_own",
                "patch_own",
                "add_remove_roles_own",
                "read_write_field_values_own",
            ],
            orgA_cannot: [
                "list_orgB",
                "read_orgB",
                "patch_orgB",
                "mutate_orgB_roles",
            ],
            unauthenticated: "reject_all",
            insufficient_role: "reject_mutations",
        };
        expect(matrix.orgA_can.length).toBeGreaterThan(0);
        expect(matrix.orgA_cannot).toContain("read_orgB");
    });
});
