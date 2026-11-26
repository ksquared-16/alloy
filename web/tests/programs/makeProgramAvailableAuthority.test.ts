import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("makeProgramAvailable authority contract", () => {
    it("freezes Verdict A — published revision required before association", () => {
        const command = readFileSync(
            resolve(
                __dirname,
                "../../lib/programs/commands/makeProgramAvailable/makeProgramAvailableCommand.ts",
            ),
            "utf8",
        );
        const association = readFileSync(
            resolve(__dirname, "../../lib/programs/locationProgramAssociation.ts"),
            "utf8",
        );
        const lpcRoute = readFileSync(
            resolve(__dirname, "../../app/api/admin/location-program-categories/route.ts"),
            "utf8",
        );

        expect(command).toContain("Only published Program revisions may be made available");
        expect(command).toContain("create_draft");
        expect(command).toContain("validate_draft");
        expect(command).toContain("publishProgramDraft");
        expect(command).toContain("assignProgramDistribution");
        expect(association).toContain("publishedProgramsForAssignment");
        expect(association).toContain('action: "publish"');
        expect(lpcRoute).toContain("409");
        expect(lpcRoute).toContain("Apply a published Program");
    });

    it("wires preview_make_available and make_available on the Programs configuration API", () => {
        const route = readFileSync(
            resolve(__dirname, "../../app/api/admin/configuration/programs/route.ts"),
            "utf8",
        );
        expect(route).toContain('case "preview_make_available"');
        expect(route).toContain('case "make_available"');
        expect(route).toContain("previewMakeProgramAvailable");
        expect(route).toContain("commitMakeProgramAvailable");
        expect(route).toContain("idempotencyKey");
        expect(route).toContain("canManageProgramPublication");
    });

    it("persists grouped operations for idempotency and parent audit", () => {
        const migration = readFileSync(
            resolve(
                __dirname,
                "../../../supabase/migrations/20260722140000_configuration_command_operations_make_available.sql",
            ),
            "utf8",
        );
        expect(migration).toContain("configuration_command_operations");
        expect(migration).toContain("idempotency_key");
        expect(migration).toContain("programs.make_available");
        expect(migration).toContain("UNIQUE (org_id, command_key, idempotency_key)");
    });

    it("reuses soft eligibility for preview and commit (no forked policy)", () => {
        const command = readFileSync(
            resolve(
                __dirname,
                "../../lib/programs/commands/makeProgramAvailable/makeProgramAvailableCommand.ts",
            ),
            "utf8",
        );
        const service = readFileSync(
            resolve(__dirname, "../../lib/programs/publication/programPublicationService.ts"),
            "utf8",
        );
        expect(command).toContain("resolveProgramTargetsSoft");
        expect(command).toContain("partitionMakeProgramAvailableTargets");
        expect(service).toContain("export async function resolveProgramTargetsSoft");
        expect(service).toContain("export async function loadLatestProgramPublication");
    });
});
