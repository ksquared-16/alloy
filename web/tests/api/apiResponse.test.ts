import { describe, it, expect } from "vitest";

import { apiOk, apiError, apiZodError, type ApiFailure, type ApiSuccess } from "@/lib/api/apiResponse";
import { CORRELATION_ID_HEADER, resolveCorrelationId } from "@/lib/api/correlationId";
import { defaultStatusForCode } from "@/lib/api/apiErrors";

async function readBody<T = unknown>(res: Response): Promise<T> {
    return (await res.json()) as T;
}

describe("apiOk", () => {
    it("returns a success envelope with data and correlation id", async () => {
        const res = apiOk({ hello: "world" });
        expect(res.status).toBe(200);
        const body = await readBody<ApiSuccess<{ hello: string }>>(res);
        expect(body.ok).toBe(true);
        expect(body.data).toEqual({ hello: "world" });
        expect(typeof body.correlation_id).toBe("string");
        expect((body.correlation_id ?? "").length).toBeGreaterThan(0);
    });

    it("sets the x-correlation-id header matching the body", async () => {
        const res = apiOk({ ok: 1 });
        const body = await readBody<ApiSuccess<unknown>>(res);
        expect(res.headers.get(CORRELATION_ID_HEADER)).toBe(body.correlation_id);
    });

    it("honors an explicit status and correlation id", async () => {
        const res = apiOk({ created: true }, { status: 201, correlationId: "cid-fixed" });
        expect(res.status).toBe(201);
        const body = await readBody<ApiSuccess<unknown>>(res);
        expect(body.correlation_id).toBe("cid-fixed");
        expect(res.headers.get(CORRELATION_ID_HEADER)).toBe("cid-fixed");
    });

    it("propagates an incoming correlation id from the request headers", async () => {
        const request = new Request("https://example.test/api", {
            headers: { [CORRELATION_ID_HEADER]: "upstream-123" },
        });
        const res = apiOk({ x: 1 }, { request });
        const body = await readBody<ApiSuccess<unknown>>(res);
        expect(body.correlation_id).toBe("upstream-123");
    });
});

describe("apiError", () => {
    it("returns a failure envelope with code + message + correlation id", async () => {
        const res = apiError("NOT_FOUND", "Record not found");
        expect(res.status).toBe(404);
        const body = await readBody<ApiFailure>(res);
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("NOT_FOUND");
        expect(body.error.message).toBe("Record not found");
        expect(typeof body.correlation_id).toBe("string");
    });

    it("derives default status from the error code", async () => {
        expect((apiError("BAD_REQUEST", "x")).status).toBe(400);
        expect((apiError("UNAUTHORIZED", "x")).status).toBe(401);
        expect((apiError("FORBIDDEN", "x")).status).toBe(403);
        expect((apiError("NOT_FOUND", "x")).status).toBe(404);
        expect((apiError("CONFLICT", "x")).status).toBe(409);
        expect((apiError("INTERNAL", "x")).status).toBe(500);
        expect(defaultStatusForCode("UNKNOWN_CODE")).toBe(400);
    });

    it("respects an explicit status override", () => {
        expect(apiError("CONFLICT", "x", 422).status).toBe(422);
    });

    it("never serializes a bare string body", async () => {
        const res = apiError("INTERNAL", "boom");
        const body = await readBody<unknown>(res);
        expect(typeof body).toBe("object");
        expect(body).not.toBeNull();
        expect(Array.isArray(body)).toBe(false);
    });

    it("does not leak stack traces in details", async () => {
        const err = new Error("db exploded");
        const res = apiError("INTERNAL", "Internal error", undefined, err);
        const body = await readBody<ApiFailure>(res);
        const serialized = JSON.stringify(body);
        expect(serialized).not.toContain("apiResponse.test");
        expect(serialized.toLowerCase()).not.toContain("at object");
        expect(body.error.details).toEqual({ message: "db exploded" });
    });

    it("omits details when none supplied", async () => {
        const res = apiError("FORBIDDEN", "nope");
        const body = await readBody<ApiFailure>(res);
        expect("details" in body.error).toBe(false);
    });
});

describe("apiZodError", () => {
    it("returns a VALIDATION_ERROR envelope with 400 status", async () => {
        const zodLike = {
            name: "ZodError",
            issues: [{ path: ["name"], message: "Required", code: "invalid_type" }],
            flatten: () => ({ formErrors: [], fieldErrors: { name: ["Required"] } }),
        };
        const res = apiZodError(zodLike);
        expect(res.status).toBe(400);
        const body = await readBody<ApiFailure>(res);
        expect(body.ok).toBe(false);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.details).toEqual({ formErrors: [], fieldErrors: { name: ["Required"] } });
        expect(typeof body.correlation_id).toBe("string");
    });

    it("falls back to the error message when no zod shape is present", async () => {
        const res = apiZodError(new Error("bad input"));
        const body = await readBody<ApiFailure>(res);
        expect(body.error.code).toBe("VALIDATION_ERROR");
        expect(body.error.details).toEqual({ message: "bad input" });
    });
});

describe("resolveCorrelationId", () => {
    it("prefers an explicit id, then incoming header, then generates", () => {
        const headers = new Headers({ [CORRELATION_ID_HEADER]: "from-header" });
        expect(resolveCorrelationId(headers, "explicit")).toBe("explicit");
        expect(resolveCorrelationId(headers)).toBe("from-header");
        const generated = resolveCorrelationId(undefined);
        expect(typeof generated).toBe("string");
        expect(generated.length).toBeGreaterThan(0);
    });
});
