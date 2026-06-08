import { describe, expect, it } from "vitest";
import {
    mergeEnrollmentOperationalIntoMetadata,
    parseEnrollmentOperationalFromMetadata,
    sanitizeEnrollmentOperationalPatch,
} from "@/lib/opportunities/enrollmentOperationalMetadata";

describe("enrollmentOperationalMetadata", () => {
    it("parses empty metadata as none bucket", () => {
        expect(parseEnrollmentOperationalFromMetadata(null).wait_bucket).toBe("none");
    });

    it("sanitizes and merges wait_bucket", () => {
        const patch = sanitizeEnrollmentOperationalPatch({ wait_bucket: "waiting_on_documents", wait_since: "2026-05-01T12:00:00.000Z" });
        expect(patch?.wait_bucket).toBe("waiting_on_documents");
        const merged = mergeEnrollmentOperationalIntoMetadata({}, patch!);
        expect((merged.enrollment_operational as { wait_bucket?: string }).wait_bucket).toBe("waiting_on_documents");
    });

    it("rejects invalid wait_bucket values", () => {
        const patch = sanitizeEnrollmentOperationalPatch({ wait_bucket: "not_a_bucket" });
        expect(patch).toBeNull();
    });
});
