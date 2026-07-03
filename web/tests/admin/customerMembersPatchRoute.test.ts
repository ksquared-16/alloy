/**
 * customer-members PATCH/GET — canonical profile grain (native + field_values).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/admin/customer-members/[id]/route";
import {
    buildNativeCustomerMemberUpdates,
    validateCustomerMemberPatchBody,
} from "@/lib/admin/customerMemberPatch";
import { assertNoChildProfileKeysOnOcmPatch } from "@/lib/fields/canonicalStrictMode";

const orgId = "11111111-1111-4111-8111-111111111111";
const otherOrgId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";

const mockUpsertFieldValues = vi.fn();
const mockLoadProfileFields = vi.fn();

vi.mock("@/lib/admin/getAdminContext", () => ({
    getAdminContextCached: vi.fn(),
}));

vi.mock("@/lib/admin/fieldValues", () => ({
    upsertFieldValuesFromBody: (...args: unknown[]) => mockUpsertFieldValues(...args),
}));

vi.mock("@/lib/completion/loadCustomerMemberProfileFields", () => ({
    loadCustomerMemberProfileFieldsByMemberId: (...args: unknown[]) => mockLoadProfileFields(...args),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(),
}));

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";

type QueryResult = { data: unknown; error: unknown };

function chainableSupabase(handlers: {
    customerMembersSelect?: QueryResult;
    customerMembersUpdate?: QueryResult;
    fieldDefinitionsSelect?: QueryResult;
}) {
    const terminal = (table: string, mode: "maybeSingle" | "single" | "array") => {
        if (table === "customer_members") {
            if (mode === "single" || mode === "maybeSingle") {
                return Promise.resolve(
                    handlers.customerMembersUpdate ?? handlers.customerMembersSelect ?? { data: null, error: null }
                );
            }
        }
        if (table === "field_definitions" && mode === "array") {
            return Promise.resolve(handlers.fieldDefinitionsSelect ?? { data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
    };

    const from = vi.fn((table: string) => {
        let mode: "maybeSingle" | "single" | "array" = "array";
        const api: Record<string, unknown> = {};
        const chain = () => api;
        api.select = vi.fn(() => chain());
        api.eq = vi.fn(() => chain());
        api.in = vi.fn(() => {
            mode = "array";
            return api;
        });
        api.maybeSingle = vi.fn(() => {
            mode = "maybeSingle";
            return terminal(table, mode);
        });
        api.single = vi.fn(() => {
            mode = "single";
            return terminal(table, mode);
        });
        api.update = vi.fn(() => ({
            eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                        single: vi.fn(() => terminal("customer_members", "single")),
                    })),
                })),
            })),
        }));
        api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            terminal(table, mode).then(resolve, reject);
        return api;
    });
    return { from };
}

function adminContext(org = orgId) {
    vi.mocked(getAdminContextCached).mockResolvedValue({
        ok: true,
        orgId: org,
        userId: "user-1",
        role: "admin",
        roleKeys: ["admin"],
        status: 200,
    } as Awaited<ReturnType<typeof getAdminContextCached>>);
}

describe("validateCustomerMemberPatchBody", () => {
    it("accepts native profile fields", () => {
        const result = validateCustomerMemberPatchBody({ first_name: "Ava", last_name: "Lee" });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.native).toEqual({ first_name: "Ava", last_name: "Lee" });
            expect(result.config).toEqual({});
        }
    });

    it("accepts config profile fields", () => {
        const result = validateCustomerMemberPatchBody({ gender: "female", allergies: "peanut" });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.config).toEqual({ gender: "female", allergies: "peanut" });
        }
    });

    it("rejects OCM/enrollment fields", () => {
        const result = validateCustomerMemberPatchBody({ start_date: "2026-09-01" });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("inquiry_child");
            expect(result.error).toContain("start_date");
        }
    });

    it("rejects unknown fields", () => {
        const result = validateCustomerMemberPatchBody({ mystery_field: "x" });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain("Unsupported fields");
        }
    });
});

describe("buildNativeCustomerMemberUpdates", () => {
    it("trims native column values", () => {
        expect(buildNativeCustomerMemberUpdates({ first_name: "  Ava  ", dob: "2020-01-15" })).toEqual({
            first_name: "Ava",
            dob: "2020-01-15",
        });
    });
});

describe("customer-members PATCH route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        adminContext();
        mockLoadProfileFields.mockResolvedValue(
            new Map([
                [
                    memberId,
                    {
                        first_name: "Ava",
                        last_name: "Lee",
                        gender: "female",
                        allergies: "peanut",
                    },
                ],
            ])
        );
    });

    it("PATCH native child profile field", async () => {
        const memberRow = {
            id: memberId,
            org_id: orgId,
            first_name: "Ava",
            last_name: "Lee",
            dob: null,
        };
        vi.mocked(createAdminClient).mockReturnValue(
            chainableSupabase({
                customerMembersSelect: { data: { id: memberId }, error: null },
                customerMembersUpdate: { data: memberRow, error: null },
            }) as ReturnType<typeof createAdminClient>
        );

        const req = new NextRequest(`http://localhost/api/admin/customer-members/${memberId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ first_name: "Ava", last_name: "Lee" }),
        });
        const res = await PATCH(req, { params: Promise.resolve({ id: memberId }) });
        expect(res.status).toBe(200);
        const json = (await res.json()) as { first_name?: string; gender?: string };
        expect(json.first_name).toBe("Ava");
        expect(json.gender).toBe("female");
        expect(mockUpsertFieldValues).not.toHaveBeenCalled();
    });

    it("PATCH config child profile field to field_values", async () => {
        vi.mocked(createAdminClient).mockReturnValue(
            chainableSupabase({
                customerMembersSelect: { data: { id: memberId }, error: null },
                fieldDefinitionsSelect: {
                    data: [
                        { field_key: "gender", entity_type: "customer_member" },
                        { field_key: "allergies", entity_type: "customer_member" },
                    ],
                    error: null,
                },
            }) as ReturnType<typeof createAdminClient>
        );

        const req = new NextRequest(`http://localhost/api/admin/customer-members/${memberId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gender: "female", allergies: "peanut" }),
        });
        const res = await PATCH(req, { params: Promise.resolve({ id: memberId }) });
        expect(res.status).toBe(200);
        expect(mockUpsertFieldValues).toHaveBeenCalledOnce();
        const call = mockUpsertFieldValues.mock.calls[0] as [
            unknown,
            string,
            string,
            string,
            Record<string, unknown>,
        ];
        expect(call[1]).toBe(orgId);
        expect(call[2]).toBe("customer_member");
        expect(call[3]).toBe(memberId);
        expect(call[4]).toEqual({ gender: "female", allergies: "peanut" });
    });

    it("rejects cross-org write when member not in org", async () => {
        vi.mocked(createAdminClient).mockReturnValue(
            chainableSupabase({
                customerMembersSelect: { data: null, error: null },
            }) as ReturnType<typeof createAdminClient>
        );

        const req = new NextRequest(`http://localhost/api/admin/customer-members/${memberId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ first_name: "Ava" }),
        });
        const res = await PATCH(req, { params: Promise.resolve({ id: memberId }) });
        expect(res.status).toBe(404);
    });

    it("rejects enrollment fields on customer_member PATCH", async () => {
        const req = new NextRequest(`http://localhost/api/admin/customer-members/${memberId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ outcome_status_key: "enrolled" }),
        });
        const res = await PATCH(req, { params: Promise.resolve({ id: memberId }) });
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error?: string };
        expect(json.error).toContain("inquiry_child");
    });
});

describe("customer-members GET route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        adminContext();
        mockLoadProfileFields.mockResolvedValue(
            new Map([
                [
                    memberId,
                    {
                        first_name: "Ava",
                        last_name: "Lee",
                        gender: "female",
                        allergies: "none",
                        medical_notes: "asthma",
                    },
                ],
            ])
        );
    });

    it("returns merged native + config field values", async () => {
        vi.mocked(createAdminClient).mockReturnValue(
            chainableSupabase({
                customerMembersSelect: {
                    data: {
                        id: memberId,
                        org_id: orgId,
                        customer_id: null,
                        first_name: "Ava",
                        last_name: "Lee",
                        dob: "2020-01-15",
                    },
                    error: null,
                },
            }) as ReturnType<typeof createAdminClient>
        );

        const res = await GET(new NextRequest(`http://localhost/api/admin/customer-members/${memberId}`), {
            params: Promise.resolve({ id: memberId }),
        });
        expect(res.status).toBe(200);
        const json = (await res.json()) as {
            first_name?: string;
            dob?: string;
            gender?: string;
            allergies?: string;
            medical_notes?: string;
        };
        expect(json.first_name).toBe("Ava");
        expect(json.dob).toBe("2020-01-15");
        expect(json.gender).toBe("female");
        expect(json.allergies).toBe("none");
        expect(json.medical_notes).toBe("asthma");
    });

    it("returns 404 for cross-org read", async () => {
        adminContext(otherOrgId);
        vi.mocked(createAdminClient).mockReturnValue(
            chainableSupabase({
                customerMembersSelect: { data: null, error: null },
            }) as ReturnType<typeof createAdminClient>
        );

        const res = await GET(new NextRequest(`http://localhost/api/admin/customer-members/${memberId}`), {
            params: Promise.resolve({ id: memberId }),
        });
        expect(res.status).toBe(404);
    });
});

describe("OCM route isolation — profile config fields stay off inquiry_child", () => {
    it("OCM PATCH rejects child profile keys including config fields", () => {
        expect(assertNoChildProfileKeysOnOcmPatch({ gender: "female" })).toBeTruthy();
        expect(assertNoChildProfileKeysOnOcmPatch({ allergies: "peanut" })).toBeTruthy();
        expect(assertNoChildProfileKeysOnOcmPatch({ medical_notes: "asthma" })).toBeTruthy();
        expect(assertNoChildProfileKeysOnOcmPatch({ start_date: "2026-09-01" })).toBeNull();
    });

    it("customer_member PATCH targets customer_member entity_type only", async () => {
        vi.mocked(createAdminClient).mockReturnValue(
            chainableSupabase({
                customerMembersSelect: { data: { id: memberId }, error: null },
                fieldDefinitionsSelect: {
                    data: [{ field_key: "medical_notes", entity_type: "customer_member" }],
                    error: null,
                },
            }) as ReturnType<typeof createAdminClient>
        );

        const req = new NextRequest(`http://localhost/api/admin/customer-members/${memberId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ medical_notes: "inhaler" }),
        });
        await PATCH(req, { params: Promise.resolve({ id: memberId }) });

        expect(mockUpsertFieldValues).toHaveBeenCalledOnce();
        expect(mockUpsertFieldValues.mock.calls[0]?.[2]).toBe("customer_member");
        expect(mockUpsertFieldValues.mock.calls[0]?.[2]).not.toBe("inquiry_child");
    });
});
