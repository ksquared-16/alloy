import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_V2_ROUTE_LOADING_VOCABULARY } from "@/lib/adminV2/navigation/adminV2RouteLoadingVocabulary";
import {
    DEFAULT_ADMIN_V2_NAVIGATION_TRANSITION_TIMEOUT_MS,
    adminV2NavigationClickedItemProps,
    getAdminV2NavigationTransitionSnapshot,
    isAdminV2NavigationItemPending,
    resetAdminV2NavigationTransitionForTests,
    runAdminV2NavigationTransition,
} from "@/lib/adminV2/navigation/adminV2NavigationTransition";

describe("adminV2NavigationTransition", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetAdminV2NavigationTransitionForTests();
    });

    afterEach(() => {
        resetAdminV2NavigationTransitionForTests();
        vi.useRealTimers();
    });

    it("commitFirst commits immediately and runs prepare in background", async () => {
        const commit = vi.fn();
        let resolvePrepare: (() => void) | undefined;
        const prepare = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolvePrepare = resolve;
                })
        );

        const result = await runAdminV2NavigationTransition({
            href: "/workspace/work-unit/new-leads",
            clickedKey: "lifecycle:lc-1",
            variant: "work_unit",
            commitFirst: true,
            prepare,
            commit,
        });

        expect(result).toBe("commit_first");
        expect(commit).toHaveBeenCalledTimes(1);
        expect(prepare).toHaveBeenCalledTimes(1);
        resolvePrepare?.();
        await Promise.resolve();
        expect(getAdminV2NavigationTransitionSnapshot().phase).toBe("idle");
    });

    it("commitFirst keeps pending snapshot visible through commit callback", async () => {
        let pendingDuringCommit = false;
        const commit = vi.fn(() => {
            pendingDuringCommit = isAdminV2NavigationItemPending("lifecycle:lc-1");
        });
        const prepare = vi.fn(async () => undefined);

        const result = await runAdminV2NavigationTransition({
            href: "/workspace/work-unit/new-leads",
            clickedKey: "lifecycle:lc-1",
            variant: "work_unit",
            commitFirst: true,
            prepare,
            commit,
        });

        expect(result).toBe("commit_first");
        expect(pendingDuringCommit).toBe(true);
        await Promise.resolve();
        expect(getAdminV2NavigationTransitionSnapshot().phase).toBe("idle");
        expect(isAdminV2NavigationItemPending("lifecycle:lc-1")).toBe(false);
    });

    it("commits after successful prepare before timeout", async () => {
        const commit = vi.fn();
        const prepare = vi.fn(async () => {
            await Promise.resolve();
        });

        const resultP = runAdminV2NavigationTransition({
            href: "/adminV2/workspace/dept/dept-1",
            clickedKey: "dept:dept-1",
            variant: "department",
            prepare,
            commit,
        });

        await vi.runAllTimersAsync();
        const result = await resultP;

        expect(result).toBe("prepare_ok");
        expect(prepare).toHaveBeenCalledTimes(1);
        expect(commit).toHaveBeenCalledTimes(1);
        expect(getAdminV2NavigationTransitionSnapshot().phase).toBe("idle");
    });

    it("commits on timeout when prepare is slow", async () => {
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
            timeoutMs: 500,
        });

        await vi.advanceTimersByTimeAsync(500);
        const result = await resultP;

        expect(result).toBe("timeout");
        expect(commit).toHaveBeenCalledTimes(1);
        expect(getAdminV2NavigationTransitionSnapshot().phase).toBe("idle");
        resolvePrepare?.();
    });

    it("commits on prepare failure by default", async () => {
        const commit = vi.fn();
        const prepare = vi.fn(async () => {
            throw new Error("prefetch failed");
        });

        const result = await runAdminV2NavigationTransition({
            href: "/adminV2/workspace/dept/dept-1/work-unit/wu-1",
            clickedKey: "wu:wu-1",
            variant: "work_unit",
            prepare,
            commit,
        });

        expect(result).toBe("prepare_failed");
        expect(commit).toHaveBeenCalledTimes(1);
        expect(getAdminV2NavigationTransitionSnapshot().phase).toBe("idle");
    });

    it("aborts without commit when commitOnPrepareFailure is false", async () => {
        const commit = vi.fn();
        const prepare = vi.fn(async () => {
            throw new Error("prefetch failed");
        });

        const result = await runAdminV2NavigationTransition({
            href: "/adminV2/workspace/dept/dept-1",
            clickedKey: "dept:dept-1",
            variant: "department",
            prepare,
            commit,
            commitOnPrepareFailure: false,
        });

        expect(result).toBe("aborted");
        expect(commit).not.toHaveBeenCalled();
        expect(getAdminV2NavigationTransitionSnapshot().phase).toBe("idle");
    });

    it("tracks clicked key pending state and aria-busy props", async () => {
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
        });

        const snap = getAdminV2NavigationTransitionSnapshot();
        expect(snap.isTransitioning).toBe(true);
        expect(snap.clickedKey).toBe("dept:dept-1");
        expect(snap.ribbonLabel).toBe(ADMIN_V2_ROUTE_LOADING_VOCABULARY.department.ribbon);
        expect(isAdminV2NavigationItemPending("dept:dept-1")).toBe(true);
        expect(isAdminV2NavigationItemPending("dept:other")).toBe(false);
        expect(adminV2NavigationClickedItemProps("dept:dept-1")).toEqual({
            "aria-busy": true,
            "data-adminv2-nav-pending": "true",
        });

        resolvePrepare?.();
        await vi.runAllTimersAsync();
        await resultP;

        expect(isAdminV2NavigationItemPending("dept:dept-1")).toBe(false);
        expect(adminV2NavigationClickedItemProps("dept:dept-1")).toEqual({});
    });

    it("cleans up snapshot after commit", async () => {
        const commit = vi.fn();
        await runAdminV2NavigationTransition({
            href: "/adminV2/workspace",
            clickedKey: "workspace:root",
            variant: "workspace",
            commit,
        });

        expect(commit).toHaveBeenCalledTimes(1);
        expect(getAdminV2NavigationTransitionSnapshot()).toMatchObject({
            phase: "idle",
            isTransitioning: false,
            href: null,
            clickedKey: null,
        });
    });

    it("does not start a second transition while one is active", async () => {
        const commit = vi.fn();
        let resolvePrepare: (() => void) | undefined;
        const prepare = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    resolvePrepare = resolve;
                })
        );

        const firstP = runAdminV2NavigationTransition({
            href: "/adminV2/workspace/dept/a",
            clickedKey: "dept:a",
            variant: "department",
            prepare,
            commit,
        });

        const second = await runAdminV2NavigationTransition({
            href: "/adminV2/workspace/dept/b",
            clickedKey: "dept:b",
            variant: "department",
            prepare,
            commit,
        });

        expect(second).toBe("superseded");
        expect(commit).not.toHaveBeenCalled();

        resolvePrepare?.();
        await vi.runAllTimersAsync();
        await firstP;

        expect(commit).toHaveBeenCalledTimes(1);
    });

    it("uses default timeout constant", () => {
        expect(DEFAULT_ADMIN_V2_NAVIGATION_TRANSITION_TIMEOUT_MS).toBe(1500);
    });
});
