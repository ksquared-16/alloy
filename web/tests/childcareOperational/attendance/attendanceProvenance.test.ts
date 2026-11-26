/**
 * Provenance is derived, never accepted.
 *
 * The pre-Thread-2 defect: the route read `actor_type` / `source_type` from the
 * request body, so an authenticated operator could file a fact stamped `parent`
 * or `system`. These tests pin the replacement contract — the ONLY inputs that
 * can influence stored provenance are ones the server established.
 */

import { describe, expect, it } from "vitest";
import {
    AttendanceProvenanceError,
    CLIENT_ASSERTABLE_CHANNELS,
    operatorChannelForSurface,
    resolveAttendanceProvenance,
} from "@/lib/childcareOperational/attendance/attendanceProvenance";

describe("no channel is client-assertable", () => {
    it("keeps the client-assertable set empty", () => {
        // If this ever grows, someone decided a caller may name its own trust
        // path. That is the exact defect this thread closed.
        expect(CLIENT_ASSERTABLE_CHANNELS).toEqual([]);
    });
});

describe("authenticated operator capture", () => {
    it("stamps staff + operator_action from the console", () => {
        const p = resolveAttendanceProvenance({
            channel: "operator_console",
            actorUserId: "user-1",
            correlationId: "corr-1",
        });
        expect(p.actorType).toBe("staff");
        expect(p.sourceType).toBe("operator_action");
        expect(p.actorUserId).toBe("user-1");
        expect(p.correlationId).toBe("corr-1");
    });

    it("records the workspace as its own channel with the same authority", () => {
        const workspace = resolveAttendanceProvenance({ channel: "staff_workspace", actorUserId: "user-1" });
        const console_ = resolveAttendanceProvenance({ channel: "operator_console", actorUserId: "user-1" });
        expect(workspace.sourceType).toBe("staff_workspace");
        expect(console_.sourceType).toBe("operator_action");
        // Different attribution, identical actor authority.
        expect(workspace.actorType).toBe(console_.actorType);
        expect(workspace.actorUserId).toBe(console_.actorUserId);
    });

    it("refuses to author an operator fact with no authenticated user", () => {
        expect(() => resolveAttendanceProvenance({ channel: "operator_console", actorUserId: null })).toThrow(
            AttendanceProvenanceError
        );
        expect(() => resolveAttendanceProvenance({ channel: "staff_workspace", actorUserId: "   " })).toThrow(
            AttendanceProvenanceError
        );
    });
});

describe("surface → channel mapping is server-side", () => {
    it("maps the workspace surface and defaults everything else to the console", () => {
        expect(operatorChannelForSurface("workspace")).toBe("staff_workspace");
        expect(operatorChannelForSurface("focus_panel")).toBe("operator_console");
        expect(operatorChannelForSurface(null)).toBe("operator_console");
        // An unrecognised surface must not become a privileged channel.
        expect(operatorChannelForSurface("kiosk")).toBe("operator_console");
        expect(operatorChannelForSurface("integration_api")).toBe("operator_console");
    });
});

describe("non-human producers must identify themselves", () => {
    it("refuses an anonymous system or integration write", () => {
        for (const channel of ["integration_api", "door_access", "system", "processing_import", "kiosk"] as const) {
            expect(() => resolveAttendanceProvenance({ channel })).toThrow(AttendanceProvenanceError);
        }
    });

    it("accepts an integration that names its credential, and records it as source_key", () => {
        const p = resolveAttendanceProvenance({
            channel: "integration_api",
            producerKey: "classroom-coach-prod",
        });
        expect(p.actorType).toBe("system");
        expect(p.sourceType).toBe("integration_api");
        expect(p.sourceKey).toBe("classroom-coach-prod");
        expect(p.actorUserId).toBeNull();
    });

    it("treats a kiosk as a device producing facts about a person", () => {
        const p = resolveAttendanceProvenance({
            channel: "kiosk",
            producerKey: "kiosk-front-desk-01",
            actorPersonId: "person-9",
        });
        expect(p.sourceType).toBe("kiosk");
        expect(p.sourceKey).toBe("kiosk-front-desk-01");
        expect(p.actorPersonId).toBe("person-9");
    });
});

describe("an unknown channel is refused rather than defaulted", () => {
    it("throws instead of falling back to a trusted value", () => {
        expect(() =>
            resolveAttendanceProvenance({ channel: "totally_made_up" as never, actorUserId: "u" })
        ).toThrow(AttendanceProvenanceError);
    });
});
