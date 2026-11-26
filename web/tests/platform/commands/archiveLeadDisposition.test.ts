/**
 * P4.S4 — Archive Lead Disposition B (unavailable).
 * No production executor; facade commit must stay disabled; distinct from delete_lead.
 */

import { describe, expect, it } from "vitest";

import { getPlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import { prepareCommandInvocation } from "@/lib/platform/commands/runtime/prepareCommandInvocation";
import { isCommandRuntimeFacadeExecutionSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import {
    assertDestructiveCommitAllowed,
    getDestructiveCommandPolicy,
    isDestructiveFacadeCommitAllowlisted,
} from "@/lib/platform/commands/runtime/destructive";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";

function baseInvocation(
    partial: Partial<CommandInvocationRequest> & Pick<CommandInvocationRequest, "commandKey">
): CommandInvocationRequest {
    return {
        origin: "operator",
        operationalContext: "focus_panel",
        surface: "record_header",
        ...partial,
    };
}

describe("P4.S4 archive_lead Disposition B", () => {
    it("remains unavailable with no execution owner", () => {
        const cap = getPlatformCapability("archive_lead");
        expect(cap?.maturity).toBe("unavailable");
        expect(cap?.executionOwner).toBe("none");
        expect(cap?.implementationStatus).toBe("missing");
        expect(cap?.destructiveKind).toBe("archive");
    });

    it("keeps delete and archive distinct", () => {
        const archive = getDestructiveCommandPolicy("archive_lead");
        const del = getDestructiveCommandPolicy("delete_lead");
        expect(archive?.impactClass).toBe("archive");
        expect(del?.impactClass).toBe("delete");
        expect(archive?.recovery.kind).toBe("none");
        expect(del?.recovery.kind).toBe("none");
    });

    it("does not enable facade commit or preview adapter cutover", () => {
        expect(isDestructiveFacadeCommitAllowlisted("archive_lead")).toBe(false);
        expect(assertDestructiveCommitAllowed({ capabilityKey: "archive_lead" }).allowed).toBe(
            false
        );
        expect(isCommandRuntimeFacadeExecutionSupported("archive_lead")).toBe(false);
        const prep = prepareCommandInvocation(baseInvocation({ commandKey: "archive_lead" }));
        expect(prep.snapshot.destructivePreparation?.facadeCommitEnabled).toBe(false);
        expect(prep.snapshot.runnable).toBe(false);
    });

    it("does not treat close_lead as archive alias", () => {
        const close = getPlatformCapability("close_lead");
        expect(close?.executionOwner).toBe("mutation_runtime");
        expect(close?.destructiveKind).not.toBe("archive");
        expect(close?.canonicalCommandKey).toBe("close_lead");
    });
});
