import { describe, expect, it } from "vitest";
import {
    FORMS_MODULE_NAV_ITEMS,
    resolveFormsModuleNavKey,
} from "@/lib/forms/formsModuleNav";

describe("formsModuleNav", () => {
    it("defines four intake operations destinations", () => {
        expect(FORMS_MODULE_NAV_ITEMS.map((i) => i.key)).toEqual([
            "workspace",
            "packets",
            "sessions",
            "submissions",
        ]);
    });

    it("resolves active nav key from pathname", () => {
        expect(resolveFormsModuleNavKey("/adminV2/forms")).toBe("workspace");
        expect(resolveFormsModuleNavKey("/adminV2/forms/")).toBe("workspace");
        expect(resolveFormsModuleNavKey("/adminV2/forms/packet-definitions")).toBe("packets");
        expect(resolveFormsModuleNavKey("/adminV2/forms/packet-definitions/abc")).toBe("packets");
        expect(resolveFormsModuleNavKey("/adminV2/forms/packets")).toBe("sessions");
        expect(resolveFormsModuleNavKey("/adminV2/forms/packets/session-id")).toBe("sessions");
        expect(resolveFormsModuleNavKey("/adminV2/forms/submissions")).toBe("submissions");
        expect(
            resolveFormsModuleNavKey(
                "/adminV2/forms/ffffffff-ffff-4fff-8fff-ffffffffffff/submissions"
            )
        ).toBe("submissions");
        expect(
            resolveFormsModuleNavKey("/adminV2/forms/ffffffff-ffff-4fff-8fff-ffffffffffff")
        ).toBe("workspace");
    });
});
