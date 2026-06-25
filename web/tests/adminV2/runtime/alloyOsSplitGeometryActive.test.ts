import { describe, expect, it, vi } from "vitest";

import {
    ALLOY_OS_RUNTIME_ATTR,
    ALLOY_OS_RUNTIME_PERSPECTIVE_ATTR,
    ALLOY_OS_RUNTIME_SPLIT_ATTR,
} from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import { isAlloyOsSplitGeometryActive } from "@/lib/bos/drawerWorkspaceGeometry";

function htmlStub(attrs: Record<string, string | undefined>): HTMLElement {
    return {
        getAttribute(name: string) {
            return attrs[name] ?? null;
        },
    } as unknown as HTMLElement;
}

describe("isAlloyOsSplitGeometryActive", () => {
    it("returns true when the split attribute is set", () => {
        expect(isAlloyOsSplitGeometryActive(htmlStub({ [ALLOY_OS_RUNTIME_SPLIT_ATTR]: "true" }))).toBe(
            true,
        );
    });

    it("infers split from runtime + perspective + open drawer before the split attribute lands", () => {
        vi.stubGlobal("document", {
            querySelector: () => ({}),
        });
        vi.stubGlobal("window", {
            location: { pathname: "/adminV2/workspace/dept/x/work-unit/y" },
        });
        expect(
            isAlloyOsSplitGeometryActive(
                htmlStub({
                    [ALLOY_OS_RUNTIME_ATTR]: "on",
                    [ALLOY_OS_RUNTIME_PERSPECTIVE_ATTR]: "enrollment:decision",
                }),
            ),
        ).toBe(true);
        vi.unstubAllGlobals();
    });
});
