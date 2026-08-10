import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";

export default async function ActionLinkPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    if (!token) redirect("/");

    const supabase = createServiceRoleClient();
    const sel = "token, short_code, action_type, entity_type, entity_id, consumed_at, expires_at, metadata" as const;
    let row: Record<string, unknown> | null = null;
    const byToken = await supabase.from("action_links").select(sel).eq("token", token).maybeSingle();
    if (byToken.data && !byToken.error) {
        row = byToken.data as Record<string, unknown>;
    } else {
        const byShort = await supabase.from("action_links").select(sel).eq("short_code", token).maybeSingle();
        if (byShort.data && !byShort.error) {
            row = byShort.data as Record<string, unknown>;
        }
    }

    if (!row) redirect("/");
    if ((row as { consumed_at: string | null }).consumed_at) redirect("/a/used");
    const expiresAt = new Date((row as { expires_at: string }).expires_at);
    if (expiresAt <= new Date()) redirect("/a/expired");

    const resolvedToken = String((row as { token: string }).token ?? "");
    const actionType = (row as { action_type: string }).action_type;

    // Tour booking aliases: short code → same-origin /tour-booking path (no /action hop).
    if (actionType === "tour_booking_redirect") {
        const meta = (row as { metadata?: unknown }).metadata;
        const redirectPath =
            meta && typeof meta === "object" && !Array.isArray(meta)
                ? String((meta as Record<string, unknown>).redirect_path ?? "").trim()
                : "";
        if (
            redirectPath.startsWith("/tour-booking/")
            && !redirectPath.includes("://")
            && !redirectPath.includes("//")
            && !redirectPath.includes("\\")
        ) {
            redirect(redirectPath);
        }
        redirect("/");
    }

    const matchedShort = String((row as { short_code?: string | null }).short_code ?? "") === token;
    if (matchedShort && resolvedToken) {
        redirect(`/action/${encodeURIComponent(resolvedToken)}`);
    }

    const entityType = (row as { entity_type: string }).entity_type;

    if (actionType === "vendor_accept_job" && entityType === "job") {
        redirect(`/action/${encodeURIComponent(resolvedToken)}`);
    }
    if (actionType === "customer_reschedule" || actionType === "reschedule_schedule") {
        redirect(`/book-v2?reschedule_token=${encodeURIComponent(resolvedToken)}`);
    }
    if (actionType === "customer_cancel") {
        redirect(`/action/${encodeURIComponent(resolvedToken)}`);
    }

    redirect("/");
}
