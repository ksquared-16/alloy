import { describe, expect, it } from "vitest";
import { applyFormLeadCaptureIntake } from "@/lib/forms/intake/applyFormLeadCaptureIntake";
import type { FormPayload } from "@/lib/forms/validateSubmission";

describe("applyFormLeadCaptureIntake", () => {
    it("throws when vertical_id missing", async () => {
        const supabase = {} as never;
        const payload: FormPayload = {
            values: {},
            meta: {
                intake: {
                    guardian: { email: "p@example.com" },
                },
            },
        };
        await expect(
            applyFormLeadCaptureIntake(supabase, {
                orgId: "11111111-1111-4111-8111-111111111111",
                payload,
            })
        ).rejects.toThrow(/vertical_id/);
    });

    it("throws when guardian identifiers missing", async () => {
        const supabase = {} as never;
        const payload: FormPayload = {
            values: {},
            meta: {
                intake: {
                    vertical_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    guardian: { first_name: "Pat" },
                },
            },
        };
        await expect(
            applyFormLeadCaptureIntake(supabase, {
                orgId: "11111111-1111-4111-8111-111111111111",
                payload,
            })
        ).rejects.toThrow(/email or phone/);
    });
});
