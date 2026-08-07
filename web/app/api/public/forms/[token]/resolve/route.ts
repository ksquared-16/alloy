import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { buildPublicFormResolvePayload } from "@/lib/public/forms/buildPublicFormResolvePayload";
import { requestEmbedOrigin } from "@/lib/public/forms/embedOrigin";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** GET /api/public/forms/[token]/resolve — bootstrap schema + version for embed/mobile. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return publicErr("Server misconfiguration", 500);
    }

    const { token: rawToken } = await params;
    const token = plaintextToken(rawToken ?? "");

    const result = await buildPublicFormResolvePayload(
        createServiceRoleClient(),
        token,
        requestEmbedOrigin(request)
    );

    if (!result.ok) {
        return publicErr(result.message, result.status, {
            ...(result.code ? { code: result.code } : {}),
            ...(result.validation_errors ? { validation_errors: result.validation_errors } : {}),
        });
    }
    return publicOk(result.data);
}
