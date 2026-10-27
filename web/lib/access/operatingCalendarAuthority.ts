import { NextResponse } from "next/server";

/**
 * Who may author the Operating Calendar (holidays, closures, modified hours). An entry changes
 * when a location operates — for Attendance, Tours and every later consumer — so it is
 * organization settings authority, `settings.manage`, not Tours or Attendance authority. Scope is
 * enforced on top of it in `prepareCalendarAct`: an organization default needs unrestricted site
 * scope, a location entry needs that site in the caller's scope.
 */
export const OPERATING_CALENDAR_CAPABILITY = "settings.manage" as const;

export function hasOperatingCalendarCapability(ctx: { permissionKeys?: readonly string[] | null }): boolean {
    return (ctx.permissionKeys ?? []).includes(OPERATING_CALENDAR_CAPABILITY);
}

export function requireOperatingCalendarCapability(ctx: { permissionKeys?: readonly string[] | null }): NextResponse | null {
    if ((ctx.permissionKeys ?? []).includes(OPERATING_CALENDAR_CAPABILITY)) return null;
    return NextResponse.json(
        { error: "Forbidden", required_permission: OPERATING_CALENDAR_CAPABILITY },
        { status: 403 },
    );
}
