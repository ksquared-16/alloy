import { afterEach, describe, expect, it, vi } from "vitest";

import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";

describe("isTaskAssistV1UiEnabled", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("is false when unset", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "");
        expect(isTaskAssistV1UiEnabled()).toBe(false);
    });

    it("is true for true (case-insensitive)", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "TRUE");
        expect(isTaskAssistV1UiEnabled()).toBe(true);
    });

    it("is true for 1", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "1");
        expect(isTaskAssistV1UiEnabled()).toBe(true);
    });

    it("is false for other truthy-looking strings", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "yes");
        expect(isTaskAssistV1UiEnabled()).toBe(false);
    });
});
