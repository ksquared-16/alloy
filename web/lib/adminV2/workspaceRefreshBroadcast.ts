/**
 * "Something canonical changed — every derived surface should re-read."
 *
 * A surface-neutral entry point onto the refresh signal the workspace already has. The underlying
 * event keeps its legacy name (`adminv2:opportunity-updated`) because every listener is wired to it
 * and renaming it would be a large, risky change for a cosmetic gain — but the NAME is wrong for
 * what it does. It is the workspace's mutation bus; opportunities were merely its first subject.
 *
 * ## Why this module exists rather than a direct import
 *
 * Records/Operations surfaces are guarded — proven by test — not to resolve households,
 * opportunities, work units or routes of their own. That guard is right: a child surface reasoning
 * about acquisition records is exactly the coupling it prevents. Announcing that a mutation happened
 * is not resolving anything, but a surface importing `dispatchOpportunityQueueUpdatedBroadcast`
 * would still have to NAME an opportunity to say it, and the guard cannot tell the two apart.
 *
 * So the signal gets a name that describes the signal. Nothing else changes.
 *
 * ## When to use the broadcast rather than the targeted dispatch
 *
 * When the mutation's subject is not an opportunity — a durable child, a staff record, a journey.
 * There is no row id the listeners could match, so every listener re-reads. That is the honest
 * signal: a child mutation can move counts on surfaces that are not showing the child at all.
 */

import { dispatchOpportunityQueueUpdatedBroadcast } from "@/lib/admin/opportunityQueueRefreshEvent";

/**
 * Tell every mounted derived surface to re-read after a successful canonical mutation.
 *
 * `actionKey` must be registered as membership-changing in the refresh-event module, or listeners
 * will patch rows they can see instead of refetching the counts they cannot.
 */
export function broadcastWorkspaceMutation(actionKey: string): void {
    dispatchOpportunityQueueUpdatedBroadcast(actionKey);
}
