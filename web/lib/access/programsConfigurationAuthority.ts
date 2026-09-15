/**
 * PROGRAMS ARE PUBLISHED ORGANIZATION CONFIGURATION, AND THEY ALREADY HAD AN OWNER.
 *
 * A Program in the current product is not an enrollment record and not a business process. It is a
 * configuration object with a publication lifecycle — draft, validate, publish, then distribute to
 * Locations — sharing the machinery in `lib/configPublication` and writing
 * `configuration_publications`, `configuration_distribution_runs` and
 * `configuration_distribution_targets`. The operator meets it at
 * `components/adminV2/settings/programs/`: Settings → Programs.
 *
 * So no capability was invented for it. `settings.manage` was already the declared owner of the
 * canonical publication route — the only enforcement site that key has — and this module simply
 * extends the same authority to the two surfaces that had none: program offerings and their
 * variants, and the location/program-category associations the publication service itself writes.
 *
 * WHAT IT IS NOT.
 *
 * NOT Financials. Program mutations reference commercial configuration and never write it: every
 * `commercial_products`, `commercial_policies` and `commercial_tuition_rates` access on this surface
 * is a `.select`, and the tuition-rate reads exist only to COUNT — a guard that refuses to retire an
 * offering whose rates are in use. Gating these on `fin.write` would put Financial authority inside
 * a configuration screen.
 *
 * NOT Business Process. Nothing here writes a process definition, a stage, or a lifecycle.
 *
 * READS ARE DELIBERATELY NOT GATED. Program offerings are consumed across Financials tuition plans,
 * the Commercial workspaces, Announcements audience rules and Business Process work-view conditions.
 * A reader assembling a tuition grid should not need authority to manage the organization's
 * settings, and this slice is about the mutations that had no authority at all.
 */
import { NextResponse } from "next/server";

/** Managing the organization's configuration, including its Programs. */
export const SETTINGS_MANAGE = "settings.manage" as const;

/** Pure: does this resolved context carry the capability? */
export function hasProgramsConfigurationCapability(
    ctx: { permissionKeys?: readonly string[] | null },
): boolean {
    return (ctx.permissionKeys ?? []).includes(SETTINGS_MANAGE);
}

/**
 * Refuse unless the caller may manage organization configuration, naming the key so a denial is
 * debuggable rather than merely forbidden.
 */
export function requireProgramsConfigurationCapability(
    ctx: { permissionKeys?: readonly string[] | null },
): NextResponse | null {
    if (hasProgramsConfigurationCapability(ctx)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: SETTINGS_MANAGE },
        { status: 403 },
    );
}
