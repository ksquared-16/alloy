import { describe, expect, it } from "vitest";
import {
    isEmptyLaneNoAutoOpen,
    shouldAutoOpenFirstQueueRow,
} from "@/lib/workspace/focusPanelAutoOpen";

const base = {
    rowCount: 3,
    alreadyAutoOpened: false,
    hasRouteRecordId: false,
    hasOpenDrawerRecord: false,
    hasPendingRowOpen: false,
};

describe("shouldAutoOpenFirstQueueRow", () => {
    it("auto-opens the first row when rows exist and nothing else is selected", () => {
        expect(shouldAutoOpenFirstQueueRow(base)).toBe(true);
    });

    it("does NOT auto-open when the lane has zero rows", () => {
        expect(shouldAutoOpenFirstQueueRow({ ...base, rowCount: 0 })).toBe(false);
    });

    it("does NOT auto-open when a record is already selected via the deep-link route", () => {
        expect(shouldAutoOpenFirstQueueRow({ ...base, hasRouteRecordId: true })).toBe(false);
    });

    it("does NOT auto-open when a drawer record is already open", () => {
        expect(shouldAutoOpenFirstQueueRow({ ...base, hasOpenDrawerRecord: true })).toBe(false);
    });

    it("does NOT auto-open when a row open is already pending", () => {
        expect(shouldAutoOpenFirstQueueRow({ ...base, hasPendingRowOpen: true })).toBe(false);
    });

    it("does NOT auto-open a second time once the lane already auto-opened", () => {
        expect(shouldAutoOpenFirstQueueRow({ ...base, alreadyAutoOpened: true })).toBe(false);
    });
});

describe("isEmptyLaneNoAutoOpen", () => {
    it("is true for a settled empty lane with nothing else selected", () => {
        expect(isEmptyLaneNoAutoOpen({ ...base, rowCount: 0 })).toBe(true);
    });

    it("is false when rows exist", () => {
        expect(isEmptyLaneNoAutoOpen(base)).toBe(false);
    });

    it("is false when a deep-link record is selected (host owns that open)", () => {
        expect(isEmptyLaneNoAutoOpen({ ...base, rowCount: 0, hasRouteRecordId: true })).toBe(false);
    });
});
