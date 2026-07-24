import { describe, expect, it } from "vitest";
import {
    classifyConfigurationRuntimeIssue,
    readConfigurationRuntimeIssue,
} from "@/lib/configPublication/runtimeIssue";

describe("Configuration Runtime operator issues", () => {
    it("turns a missing table into setup guidance without exposing database language", () => {
        const result = classifyConfigurationRuntimeIssue(
            new Error("Could not find the table 'public.programs' in the schema cache (PGRST205)"),
            { domainLabel: "Programs" },
        );

        expect(result.status).toBe(503);
        expect(result.issue).toMatchObject({
            code: "not_initialized",
            title: "Programs setup is not complete",
        });
        expect(`${result.issue.message} ${result.issue.nextStep}`).not.toMatch(
            /public\.programs|schema cache|PGRST/i,
        );
        expect(result.technical).toContain("public.programs");
    });

    it.each([
        ["PGRST204: Could not find the 'label' column", "migration_required", 503],
        ["42501: permission denied for table programs", "access_denied", 403],
        ["PGRST000: database connection failed", "unavailable", 503],
    ] as const)("classifies %s", (message, code, status) => {
        const result = classifyConfigurationRuntimeIssue(new Error(message), {
            domainLabel: "Programs",
        });
        expect(result.issue.code).toBe(code);
        expect(result.status).toBe(status);
    });

    it("does not treat an empty successful payload as not_initialized", () => {
        const result = classifyConfigurationRuntimeIssue(new Error(""), {
            domainLabel: "Programs",
        });
        expect(result.issue.code).not.toBe("not_initialized");
    });

    it("keeps ordinary failures distinct from missing platform capability", () => {
        const failed = classifyConfigurationRuntimeIssue(new Error("Load Programs: timeout"), {
            domainLabel: "Programs",
        });
        expect(failed.issue.code).not.toBe("not_initialized");
        const missing = classifyConfigurationRuntimeIssue(
            new Error("Could not find the table 'public.programs' in the schema cache"),
            { domainLabel: "Programs" },
        );
        expect(missing.issue.code).toBe("not_initialized");
    });
});
