import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("BosCommandSessionHost dispatch", () => {
    it("routes create_lead to Create Lead body and other registry keys to generic body", () => {
        const src = readFileSync(
            resolve(
                __dirname,
                "../../../app/adminV2/components/aiCommandSurface/commandSession/BosCommandSessionHost.tsx"
            ),
            "utf8"
        );
        expect(src).toContain("getBosCommandAdapterRegistration");
        expect(src).toContain("GenericBosCommandSessionBody");
        expect(src).toContain('actionKey === "create_lead"');
        expect(src).not.toMatch(
            /if \(session\.invocation\.actionKey !== "create_lead"\)[\s\S]*not available in BOS yet/
        );
    });
});
