import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    resetAdminV2NavigationTransitionForTests,
    runAdminV2NavigationTransition,
} from "@/lib/adminV2/navigation/adminV2NavigationTransition";

describe("workspace dept transition runtime", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetAdminV2NavigationTransitionForTests();
    });

    afterEach(() => {
        resetAdminV2NavigationTransitionForTests();
        vi.useRealTimers();
    });

    it("timeout still commits router.push", async () => {
        const commit = vi.fn();
        let resolvePrepare: (() => void) | undefined;
        const prepare = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolvePrepare = resolve;
                })
        );

        const resultP = runAdminV2NavigationTransition({
            href: "/adminV2/workspace/dept/dept-1",
            clickedKey: "dept:dept-1",
            variant: "department",
            prepare,
            commit,
            timeoutMs: 400,
        });

        await vi.advanceTimersByTimeAsync(400);
        const result = await resultP;

        expect(result).toBe("timeout");
        expect(commit).toHaveBeenCalledTimes(1);
        resolvePrepare?.();
    });

    it("prepare failure still commits by default", async () => {
        const commit = vi.fn();
        const result = await runAdminV2NavigationTransition({
            href: "/adminV2/workspace/dept/dept-1",
            clickedKey: "dept:dept-1",
            variant: "department",
            prepare: async () => {
                throw new Error("bootstrap failed");
            },
            commit,
        });

        expect(result).toBe("prepare_failed");
        expect(commit).toHaveBeenCalledTimes(1);
    });
});
