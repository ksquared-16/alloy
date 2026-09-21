import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { buildPublicFormResolvePayload } from "@/lib/public/forms/buildPublicFormResolvePayload";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { handleParticipantObjective } from "@/lib/public/forms/handleParticipantObjective";
import { startParticipantTiming } from "@/lib/perf/participantServerTiming";
import { embedOriginFromHeaders } from "@/lib/public/forms/embedOrigin";
import { FormEmbedClient } from "./FormEmbedClient";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/**
 * Resolve the form on the SERVER so the iframe's first paint already contains it.
 *
 * This page used to render an empty shell that hydrated and only then fetched
 * `/api/public/forms/[token]/resolve`, so an embedded form was blank for a full hydrate + network
 * round trip. That is the delay embedders see.
 *
 * The origin allowlist is enforced here by the same rule the API applies — an iframe document
 * navigation carries no Origin header but does carry Referer, which `embedOriginFromHeaders`
 * already handles. Server data is passed ONLY when that check passes; anything else (a resolve
 * error, a disallowed origin, a missing service role key) falls through to the client's existing
 * fetch, which reports the error exactly as before. This can never grant access the API would deny.
 *
 * ## WHICH PRESENTATION IS ALSO RESOLVED HERE, AND THAT IS THE WHOLE POINT
 *
 * The Form's data was resolved on the server and the Enrollment OBJECTIVE was resolved on the
 * client, in an effect, after hydration. That asymmetry is not a detail — it decides what a parent
 * sees first, and it produced exactly the sequence this page must never produce:
 *
 *     request -> Form paints -> hydrate -> objective arrives -> conversation replaces the Form
 *
 * A family opening their enrolment link met eighty form fields for as long as that round trip took,
 * and then watched them vanish. Both readings are now resolved in the same place, before first
 * paint, so the first thing rendered is already the right presentation. The conversation is not
 * "revealed" — the Form is never rendered for a journey that has one.
 *
 * This resolves through the SAME functions the objective route calls. A second server-side
 * assembly of the objective would be a second opinion about what a parent still owes, which is the
 * one thing this surface must not have.
 */
export default async function PublicFormEmbedPage({
    params,
    searchParams,
}: {
    params: Promise<{ token: string }>;
    searchParams: Promise<{ preview?: string }>;
}) {
    const { token } = await params;
    const sp = await searchParams;
    const raw = token ?? "";
    const showPreviewBanner = sp.preview === "1";

    let initialResolve: Record<string, unknown> | null = null;
    let initialObjective: Record<string, unknown> | null = null;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createServiceRoleClient();
        const h = await headers();
        /*
         * One wave. The two reads answer different questions — what this Form is, and what this
         * journey still needs — and neither depends on the other, so a parent waits for the slower
         * of them rather than for their sum.
         */
        const [resolved, objective] = await Promise.all([
            (async () => {
                try {
                    const result = await buildPublicFormResolvePayload(
                        supabase,
                        plaintextToken(raw),
                        embedOriginFromHeaders((name) => h.get(name)),
                    );
                    return result.ok ? result.data : null;
                } catch {
                    /* fall back to the client fetch — never block first paint on this */
                    return null;
                }
            })(),
            (async () => {
                try {
                    const access = await resolveParticipantEnrollmentFromToken(supabase, plaintextToken(raw));
                    // An ordinary public Form link has no journey. That is not an error; it is the
                    // answer, and it leaves the packet flow exactly as it was.
                    if (!access.ok) return null;
                    const response = await handleParticipantObjective(supabase, access.value, startParticipantTiming());
                    const body = (await response.json()) as { ok?: boolean; data?: Record<string, unknown> };
                    return body?.ok && body.data ? body.data : null;
                } catch {
                    /* The client effect still runs; the worst case is the behaviour that shipped. */
                    return null;
                }
            })(),
        ]);
        initialResolve = resolved;
        initialObjective = objective;
    }

    return (
        <FormEmbedClient
            token={raw}
            showPreviewBanner={showPreviewBanner}
            initialResolve={initialResolve}
            initialObjective={initialObjective}
        />
    );
}
