import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { buildPublicFormResolvePayload } from "@/lib/public/forms/buildPublicFormResolvePayload";
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
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const h = await headers();
            const result = await buildPublicFormResolvePayload(
                createServiceRoleClient(),
                plaintextToken(raw),
                embedOriginFromHeaders((name) => h.get(name))
            );
            if (result.ok) initialResolve = result.data;
        } catch {
            /* fall back to the client fetch — never block first paint on this */
        }
    }

    return (
        <FormEmbedClient
            token={raw}
            showPreviewBanner={showPreviewBanner}
            initialResolve={initialResolve}
        />
    );
}
