import { entityDataMatchesDrawer } from "@/lib/admin/drawer/entityDataMatchesDrawer";
import type {
    ComposedPersonDrawerPayloadContext,
} from "@/lib/admin/drawer/composedDrawerPayload/types";
import {
    evaluateComposedPersonDrawerPayload,
} from "@/lib/admin/drawer/composedDrawerPayload/evaluateComposedDrawerPayload";
import { peekDrawerEntitySnapshot, putDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";
import {
    __getPersonDrawerPrefetchInflightForTests,
    isPersonDrawerSnapshotWarm,
    prefetchPersonDrawerSnapshot,
    type PersonPrefetchSource,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";
import type { PersonDrawerOpenSeed } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { unwrapEntityRecord } from "@/lib/api/unwrapEntityRecord";

export type ComposedPersonDrawerPayloadLoadContext = Omit<
    ComposedPersonDrawerPayloadContext,
    "record" | "bodyHydrated"
>;

function payloadReady(record: Record<string, unknown>, ctx: ComposedPersonDrawerPayloadLoadContext): boolean {
    return evaluateComposedPersonDrawerPayload({
        ...ctx,
        record,
        bodyHydrated: true,
    }).ready;
}

/** True when cached entity satisfies configured visible above-fold payload. */
export function isComposedPersonDrawerPayloadWarm(
    personId: string,
    ctx: ComposedPersonDrawerPayloadLoadContext
): boolean {
    const id = personId.trim();
    if (!id) return false;
    const cached = peekDrawerEntitySnapshot("persons", id);
    if (!cached || !entityDataMatchesDrawer(cached, id, "persons")) return false;
    return payloadReady(cached, ctx);
}

/** Wait for in-flight prefetch or fetch composed person payload before reveal. */
export async function waitForComposedPersonDrawerPayload(
    personId: string,
    ctx: ComposedPersonDrawerPayloadLoadContext,
    opts?: { source?: PersonPrefetchSource; openSeed?: PersonDrawerOpenSeed | null; timeoutMs?: number }
): Promise<Record<string, unknown> | null> {
    const id = personId.trim();
    if (!id) return null;

    const cached = peekDrawerEntitySnapshot("persons", id);
    if (cached && entityDataMatchesDrawer(cached, id, "persons") && payloadReady(cached, ctx)) {
        return cached;
    }

    prefetchPersonDrawerSnapshot(id, { source: opts?.source ?? "click", openSeed: opts?.openSeed ?? undefined });

    const inflight = __getPersonDrawerPrefetchInflightForTests().get(id);
    const timeoutMs = opts?.timeoutMs ?? 12_000;
    const waitFor = inflight ?? fetchComposedPersonDrawerPayload(id, ctx, opts?.openSeed ?? undefined);
    await Promise.race([
        waitFor,
        new Promise<void>((resolve) => {
            setTimeout(resolve, timeoutMs);
        }),
    ]);

    const next = peekDrawerEntitySnapshot("persons", id);
    if (next && entityDataMatchesDrawer(next, id, "persons") && payloadReady(next, ctx)) {
        return next;
    }
    return null;
}

async function fetchComposedPersonDrawerPayload(
    personId: string,
    ctx: ComposedPersonDrawerPayloadLoadContext,
    openSeed?: PersonDrawerOpenSeed
): Promise<void> {
    const id = personId.trim();
    if (!id) return;
    try {
        const res = await fetch(`/api/admin/entity/persons/${encodeURIComponent(id)}`);
        if (!res.ok) return;
        // API contract: { ok, data: { entity }, correlation_id }.
        const json = unwrapEntityRecord(await res.json().catch(() => null));
        if (!json || !entityDataMatchesDrawer(json, id, "persons")) return;
        putDrawerEntitySnapshot("persons", id, json);
        if (payloadReady(json, ctx)) return;
        if (openSeed) {
            prefetchPersonDrawerSnapshot(id, { source: "click", openSeed });
        }
    } catch {
        /* non-blocking */
    }
}

/** @deprecated Prefer isComposedPersonDrawerPayloadWarm — kept for transitional cache checks. */
export function isPersonDrawerComposedCacheHit(personId: string): boolean {
    return isPersonDrawerSnapshotWarm(personId);
}
