/**
 * Mint an absolute unsubscribe URL for an outbound email.
 *
 * The token itself is the authority (see unsubscribeToken.ts). This helper only
 * chooses the public origin and the path the recipient opens — nothing about
 * which preference changes is decided here.
 */

import { getPublicAppOrigin } from "@/lib/publicAppUrl";
import {
    issueUnsubscribeToken,
    type UnsubscribableCategory,
} from "@/lib/communications/preferences/unsubscribeToken";

export function buildUnsubscribeUrl(input: {
    personId: string;
    orgId: string;
    category: UnsubscribableCategory;
    /** Absolute origin override (tests). Defaults to the configured public app origin. */
    origin?: string | null;
    nowMs?: number;
    env?: NodeJS.ProcessEnv;
}): string | null {
    const origin = String(input.origin ?? "").trim() || getPublicAppOrigin(input.env as never);
    if (!origin) return null;
    const token = issueUnsubscribeToken({
        personId: input.personId,
        orgId: input.orgId,
        category: input.category,
        nowMs: input.nowMs,
        env: input.env,
    });
    const base = origin.replace(/\/$/, "");
    return `${base}/api/communications/unsubscribe?t=${encodeURIComponent(token)}`;
}
