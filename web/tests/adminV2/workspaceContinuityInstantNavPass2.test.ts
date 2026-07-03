import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    readWorkspaceRootCache,
    writeWorkspaceRootCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";
import {
    resetAdminV2NavigationTransitionForTests,
    runAdminV2NavigationTransition,
} from "@/lib/adminV2/navigation/adminV2NavigationTransition";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

const SAMPLE_CARD: OperatorLifecycleLandingCard = {
    id: "lc-1",
    departmentId: "dept-1",
    processKey: "enrollment",
    label: "Enrollment",
    description: "Enrollment lifecycle",
    entryHref: "/workspace/work-unit/new-leads",
    workQueues: [],
    stageCount: 3,
    activeRecordCount: 12,
    needsAttentionCount: 2,
};

let store: Record<string, string> = {};

beforeEach(() => {
    store = {};
    Object.defineProperty(globalThis, "sessionStorage", {
        value: {
            getItem: (key: string) => store[key] ?? null,
            setItem: (key: string, value: string) => {
                store[key] = value;
            },
            removeItem: (key: string) => {
                delete store[key];
            },
            clear: () => {
                store = {};
            },
            get length() {
                return Object.keys(store).length;
            },
            key: (index: number) => Object.keys(store)[index] ?? null,
        },
        writable: true,
        configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
        value: {
            ...globalThis,
            dispatchEvent: () => true,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        },
        writable: true,
        configurable: true,
    });
    resetAdminV2NavigationTransitionForTests();
});

afterEach(() => {
    resetAdminV2NavigationTransitionForTests();
});
