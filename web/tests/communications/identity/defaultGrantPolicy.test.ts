import { describe, expect, it } from "vitest";

import {
    evaluateIdentitySendAccess,
    operatorCanOverrideSender,
} from "@/lib/communications/identity/admin/defaultGrantPolicy";

const USER = "33333333-3333-3333-3333-333333333333";

describe("defaultGrantPolicy", () => {
    it("open_until_restricted allows communications.send when no grants exist", () => {
        const result = evaluateIdentitySendAccess({
            defaultAccessMode: "open_until_restricted",
            grantsForIdentity: [],
            operatorUserId: USER,
            operatorHasCommunicationsSend: true,
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("open_until_restricted");
    });

    it("explicit_grants_required denies without grant", () => {
        const result = evaluateIdentitySendAccess({
            defaultAccessMode: "explicit_grants_required",
            grantsForIdentity: [],
            operatorUserId: USER,
            operatorHasCommunicationsSend: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("explicit_required_denied");
    });

    it("explicit grant permits send under explicit mode", () => {
        const result = evaluateIdentitySendAccess({
            defaultAccessMode: "explicit_grants_required",
            grantsForIdentity: [{ user_id: USER, can_send: true, status: "active" }],
            operatorUserId: USER,
            operatorHasCommunicationsSend: true,
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("explicit_grant");
    });

    it("open mode with grants restricts non-granted users", () => {
        const result = evaluateIdentitySendAccess({
            defaultAccessMode: "open_until_restricted",
            grantsForIdentity: [{ user_id: "other-user", can_send: true, status: "active" }],
            operatorUserId: USER,
            operatorHasCommunicationsSend: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.label).toBe("Explicitly restricted");
    });

    it("operatorCanOverrideSender requires override permission under explicit mode", () => {
        expect(
            operatorCanOverrideSender({
                defaultAccessMode: "explicit_grants_required",
                grants: [{ user_id: USER, can_override_default: true, can_manage: false, status: "active" }],
                operatorUserId: USER,
                hasCommunicationsSend: false,
            })
        ).toBe(true);
        expect(
            operatorCanOverrideSender({
                defaultAccessMode: "explicit_grants_required",
                grants: [{ user_id: USER, can_override_default: false, can_manage: false, status: "active" }],
                operatorUserId: USER,
                hasCommunicationsSend: false,
            })
        ).toBe(false);
    });
});
