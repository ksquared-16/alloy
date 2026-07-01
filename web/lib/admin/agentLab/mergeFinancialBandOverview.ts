/**
 * Toggle `financial` band enabled on job overview layout config (strict v1 shape).
 */

import {
    getOverviewLayoutConfigStoredVersion,
    parseOverviewLayoutConfigStrict,
} from "@/lib/rrs/overview/overviewLayoutConfigStrict";

export type MergeFinancialBandResult =
    | {
          ok: true;
          config: Record<string, unknown>;
          expected_config_version: number;
      }
    | { ok: false; error: string };

export function mergeFinancialBandEnabled(configRaw: unknown, enabled: boolean): MergeFinancialBandResult {
    if (configRaw == null || typeof configRaw !== "object" || Array.isArray(configRaw)) {
        return { ok: false, error: "Layout config is missing." };
    }
    const base = structuredClone(configRaw) as Record<string, unknown>;
    const bandsIn = base.bands;
    if (!Array.isArray(bandsIn)) {
        return { ok: false, error: "Layout config has no bands array." };
    }
    const bands = bandsIn.map((b) =>
        b != null && typeof b === "object" && !Array.isArray(b) ? { ...(b as Record<string, unknown>) } : b
    );
    const idx = bands.findIndex(
        (b) => b != null && typeof b === "object" && !Array.isArray(b) && (b as { band_key?: string }).band_key === "financial"
    );
    if (idx < 0) {
        return { ok: false, error: "No “financial” band in current overview config." };
    }
    const band = bands[idx] as Record<string, unknown>;
    band.enabled = enabled;
    bands[idx] = band;
    base.bands = bands;

    const stored = getOverviewLayoutConfigStoredVersion(base);
    const nextVersion = stored <= 0 ? 1 : stored + 1;
    base.version = nextVersion;

    const strict = parseOverviewLayoutConfigStrict(base);
    if (!strict.ok) {
        return { ok: false, error: `Invalid config after edit: ${strict.error}` };
    }

    return {
        ok: true,
        config: strict.value,
        expected_config_version: stored,
    };
}
