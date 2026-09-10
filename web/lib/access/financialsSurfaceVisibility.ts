/**
 * Whether the Financials surface is OFFERED to this principal.
 *
 * ── THIS IS NOT A SECURITY BOUNDARY, AND SAYING SO IS PART OF THE DESIGN ──
 *
 * `fin.read` is enforced by `assertFinancialsReadAllowed` on every Financials read route, and the
 * financial mutations are enforced by their own actions. Those refusals hold for a direct API call
 * that never rendered a screen, and they would hold if this module did not exist. What this decides
 * is a different question — *should the product put this in front of the operator* — and the two
 * must not be confused, because a navigation gate that is mistaken for a security gate is how a
 * server-side check stops being written.
 *
 * ── AND IT FAILS OPEN, ALSO ON PURPOSE ──
 *
 * `permissionKeys` is `null` when the shell that mounted the client context did not supply it. There
 * are several such mounts, and a missed one must not hide Financials from an operator who holds
 * `fin.read` — that would reproduce the exact operator report this work began with ("I am an
 * administrator and Financials tells me I have no access"), only with a nav item that has vanished
 * instead of a message that explains itself. So an UNKNOWN answer offers the surface and lets the
 * server give the real answer, and only a KNOWN-and-absent grant hides it.
 *
 * The direction is safe precisely because the server is authoritative: the worst case of failing
 * open here is an operator who opens Financials and is told, in words, that they cannot view it.
 * The worst case of failing closed is an operator who cannot find their own money.
 */

import { FINANCIALS_READ_PERMISSION_KEY } from "@/lib/financials/financialsPermissions";

/**
 * @param permissionKeys the principal's resolved grants, or `null` when the shell did not supply them.
 */
export function offersFinancialsSurface(permissionKeys: readonly string[] | null | undefined): boolean {
    if (permissionKeys == null) return true;
    return permissionKeys.includes(FINANCIALS_READ_PERMISSION_KEY);
}
