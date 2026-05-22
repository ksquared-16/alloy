import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    clearDeptOperNavClickAck,
    deptOperNavClickAckProps,
    deptOperNavClickedKey,
    isDeptOperNavClickPending,
    markDeptOperNavClickAck,
    resetDeptOperNavClickAckForTests,
} from "@/lib/adminV2/navigation/deptOperNavClickAck";

describe("deptOperNavClickAck", () => {
    beforeEach(() => {
        resetDeptOperNavClickAckForTests();
    });

    afterEach(() => {
        resetDeptOperNavClickAckForTests();
    });

    it("marks clicked key pending with aria-busy props", () => {
        const key = deptOperNavClickedKey("/adminV2/workspace/dept/a/work-unit/b");
        markDeptOperNavClickAck(key);
        expect(isDeptOperNavClickPending(key)).toBe(true);
        expect(deptOperNavClickAckProps(key)).toEqual({
            "aria-busy": true,
            "data-adminv2-nav-pending": "true",
        });
        expect(isDeptOperNavClickPending(deptOperNavClickedKey("/other"))).toBe(false);
    });

    it("clearDeptOperNavClickAck releases pending pointer-events lock", () => {
        const key = deptOperNavClickedKey("/adminV2/workspace/dept/a/work-unit/b?queue=new_inquiry");
        markDeptOperNavClickAck(key);
        clearDeptOperNavClickAck();
        expect(isDeptOperNavClickPending(key)).toBe(false);
        expect(deptOperNavClickAckProps(key)).toEqual({});
    });
});
