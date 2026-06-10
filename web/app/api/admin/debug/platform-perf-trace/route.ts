import { NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";

type PlatformPerfRelayEvent = {
    ts?: number;
    iso?: string;
    surface?: string;
    phase?: string;
    path?: string;
    payload?: Record<string, unknown>;
};

function platformPerfServerLogEnabled(): boolean {
    return (
        process.env.ADMIN_PERF_TRACE === "1" ||
        process.env.PLATFORM_PERF_SERVER_LOG === "1"
    );
}

/** Relay client platform perf events into server logs (visible in Vercel). */
export async function POST(req: Request) {
    if (!platformPerfServerLogEnabled()) {
        return NextResponse.json({ ok: false, skipped: "server_log_disabled" }, { status: 204 });
    }

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: { events?: PlatformPerfRelayEvent[] };
    try {
        body = (await req.json()) as { events?: PlatformPerfRelayEvent[] };
    } catch {
        return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const events = Array.isArray(body.events) ? body.events : [];
    for (const event of events.slice(0, 50)) {
        const phase = String(event.phase ?? "unknown");
        const surface = String(event.surface ?? "unknown");
        const path = String(event.path ?? "");
        const payload = event.payload ?? {};
        const parts = [
            `org_id=${ctx.orgId}`,
            `user_id=${ctx.userId}`,
            `surface=${surface}`,
            `phase=${phase}`,
            path ? `path=${path}` : null,
            event.iso ? `iso=${event.iso}` : null,
        ].filter(Boolean);
        for (const [key, value] of Object.entries(payload)) {
            if (value == null || value === "") continue;
            if (typeof value === "object") continue;
            parts.push(`${key}=${String(value)}`);
        }
        console.info(`[PLATFORM_PERF] ${parts.join(" ")}`);
    }

    return NextResponse.json({ ok: true, received: events.length });
}
