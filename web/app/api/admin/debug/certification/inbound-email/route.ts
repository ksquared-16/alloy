import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { ingestResendInboundEmail } from "@/lib/communications/email/inboundEmailIngestion";
import { normalizeResendReceivedEvent } from "@/lib/communications/email/inboundEmailNormalization";

/**
 * Certification-only injection of a received email.
 *
 * Inbound email cannot be exercised locally: certification holds no provider
 * credentials by design, and Resend cannot deliver to a laptop. This is the
 * narrowest harness that still certifies the REAL path — it hands a fixture
 * `email.received` payload and a fixture retrieval response to the same
 * `ingestResendInboundEmail` the webhook calls, so ownership, correlation,
 * exactly-once, persistence and Activity are all the production code.
 *
 * What it deliberately does NOT stand in for: Svix signature verification and
 * the live provider round-trip. Those are proven separately — the signature by
 * the webhook route it shares with outbound delivery events, and the provider
 * behaviour by the controlled live test that gates the production-ready claim.
 *
 * Gated on ALLOY_CERTIFICATION, which is set only by `alloy-certify` against the
 * local stack. In every other environment this route does not exist.
 */

function certificationOnly(): boolean {
    return (process.env.ALLOY_CERTIFICATION ?? "").trim() === "1";
}

export async function POST(request: Request) {
    if (!certificationOnly()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const event = normalizeResendReceivedEvent(body.event, {
        receivedAtFallback: new Date().toISOString(),
    });
    if (!event) {
        return NextResponse.json({ error: "event did not normalize", status: "unusable" }, { status: 400 });
    }

    // The fixture stands in for `GET /emails/receiving/{id}` only. `retrieval` may
    // be omitted to exercise the transient-failure path the webhook answers 503 to.
    const retrieval = body.retrieval;
    const failMode = typeof body.retrieval_failure === "string" ? body.retrieval_failure : null;

    const outcome = await ingestResendInboundEmail(event, {
        supabase: createAdminClient(),
        retrieve: async () => {
            if (failMode === "retryable") return { ok: false, retryable: true, reason: "fixture_transient" };
            if (failMode === "permanent") return { ok: false, retryable: false, reason: "fixture_permanent" };
            return { ok: true, payload: retrieval ?? {} };
        },
    });

    return NextResponse.json({ ok: true, outcome });
}
