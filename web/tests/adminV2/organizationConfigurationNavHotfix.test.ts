/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    readConfigurationModeLastSurface,
    writeConfigurationModeLastSurface,
} from "@/lib/adminV2/configurationModeLastSurface";
import { configurationModeNavItemActive } from "@/lib/adminV2/configurationModeNav";

describe("configurationModeLastSurface — Organization product paths", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("persists and reads /organization/* surfaces", () => {
        writeConfigurationModeLastSurface("/organization/processes");
        expect(readConfigurationModeLastSurface()).toBe("/organization/processes");

        writeConfigurationModeLastSurface("/organization/surfaces");
        expect(readConfigurationModeLastSurface()).toBe("/organization/surfaces");
    });

    it("migrates legacy /settings/processes bookmarks to /organization/processes", () => {
        window.localStorage.setItem("alloy:configuration-mode-last-surface", "/settings/processes");
        expect(readConfigurationModeLastSurface()).toBe("/organization/processes");
    });

    it("ignores bare Organization landing writes", () => {
        writeConfigurationModeLastSurface("/organization/processes");
        writeConfigurationModeLastSurface("/organization");
        expect(readConfigurationModeLastSurface()).toBe("/organization/processes");
    });
});

describe("configurationModeNavItemActive — Organization product paths", () => {
    it("highlights Processes on /organization/processes", () => {
        expect(
            configurationModeNavItemActive("/organization/processes", "/organization/processes"),
        ).toBe(true);
        expect(
            configurationModeNavItemActive("/organization/processes", "/organization/surfaces"),
        ).toBe(false);
    });

    it("highlights Surfaces on /organization/surfaces", () => {
        expect(
            configurationModeNavItemActive("/organization/surfaces", "/organization/surfaces"),
        ).toBe(true);
    });

    it("highlights Access on /organization/access", () => {
        expect(configurationModeNavItemActive("/organization/access", "/organization/access")).toBe(
            true,
        );
    });
});
