/**
 * W7-F002 — A CAPABILITY THAT CAN MOVE MONEY IS GRANTED ONLY TO A NAMED HUMAN.
 *
 * The rule lives in the database, at grant time (`20261122140000`): the assignment ceiling refuses a
 * membership change that newly confers one of these capabilities on a user with no active link to a
 * named Person, and a guard refuses newly allowing one on a role with unlinked holders. This module is
 * the application's copy of the capability set and the one sentence an operator reads when the rule
 * refuses — so all four grant writers answer it the same way, as authorization (403), not as a fault.
 */

/** Mirrors `public.money_capable_capability_keys()`. `fin.post` is retired but still judged. */
export const MONEY_CAPABLE_CAPABILITY_KEYS = [
    "fin.write",
    "fin.adjust",
    "fin.responsibility",
    "fin.subsidy",
    "fin.provider",
    "fin.post",
] as const;

export function isMoneyCapableCapability(key: string): boolean {
    return (MONEY_CAPABLE_CAPABILITY_KEYS as readonly string[]).includes(key);
}

/** The operator's sentence for a `money_capable_grant_requires_person_link` refusal, or null. */
export function moneyCapableGrantRefusal(message: string | null | undefined): string | null {
    const match = (message ?? "").match(/money_capable_grant_requires_person_link:([^\s"(]+)/);
    if (!match) return null;
    const keys = match[1].split(",").filter(Boolean).join(", ");
    return (
        `Financial access (${keys}) can only be given to someone linked to a named person, so every `
        + "financial act can say who did it. Link this user to their person record under Users › Account first."
    );
}
