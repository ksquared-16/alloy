/**
 * POST .../packet-preview/advance — QA ONLY. Answer the remaining needs so a person can reach the
 * next obligation without typing sixty-five specimen answers by hand.
 *
 * ## What makes this safe to exist
 *
 * It is not a shortcut through the runtime — it is a caller OF the runtime. Each iteration reads the
 * current turn, invents a valid specimen answer for THAT turn, and hands it to
 * `handleParticipantTurn`: the same function the browser's composer reaches, the same normalization,
 * the same authored validation, the same plausibility and conflict checks, the same write. If a
 * specimen is invalid the runtime refuses it exactly as it would refuse a parent, and the loop stops
 * rather than forcing it through.
 *
 * It therefore CANNOT do the things that would make it a lie: it does not mark a step complete, does
 * not touch session-item status, does not skip validation, and contains no progression logic of its
 * own — progression happens because the runtime decided the step was satisfied.
 *
 * ## Why it is not in the family-facing runtime
 *
 * It lives under the admin packet-preview namespace, behind admin authentication, and operates only
 * on an ephemeral preview registered in this process. There is no participant path to it, and it
 * writes through the same fail-closed client as the rest of preview.
 */

import { NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { startParticipantTiming } from "@/lib/perf/participantServerTiming";
import { handleParticipantTurn } from "@/lib/public/forms/handleParticipantTurn";
import { handleParticipantObjective } from "@/lib/public/forms/handleParticipantObjective";
import { getPreview } from "@/lib/enrollment/participantPreview/previewSessionRegistry";
import { previewAccessFor } from "@/lib/enrollment/participantPreview/previewAccess";
import { specimenAnswerForTurn } from "@/lib/enrollment/participantPreview/specimenAnswer";

export const dynamic = "force-dynamic";

const MAX_TURNS = 200;

export async function POST(request: Request) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: { preview_id?: unknown; until_step_changes?: unknown; max_turns?: unknown } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        body = {};
    }
    const previewId = typeof body.preview_id === "string" ? body.preview_id : "";
    const boot = previewId ? getPreview(previewId, ctx.orgId) : null;
    if (!boot) {
        return NextResponse.json(
            { ok: false, error: "This preview has ended. Open Preview experience again.", code: "PREVIEW_EXPIRED" },
            { status: 409 },
        );
    }

    const cap = Math.min(Number(body.max_turns) || MAX_TURNS, MAX_TURNS);

    /*
     * RESOLVED FRESH EVERY TURN, and this is not a detail.
     *
     * The access value carries the session ROW, which the runtime uses as its preloaded session.
     * The ephemeral client replaces that row object on each write — so an access value captured
     * once and reused goes stale immediately, and every subsequent turn is applied against the
     * world as it was before the loop started. Measured: 200 turns settled exactly one field,
     * because all 200 re-answered the same need.
     *
     * A per-request route never meets this, because each request builds its own. A loop has to say
     * so out loud.
     */
    const accessNow = () => previewAccessFor(boot);

    const readObjective = async () => {
        const res = await handleParticipantObjective(boot.db, accessNow(), startParticipantTiming());
        const json = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown> };
        return json.data ?? null;
    };

    let objective = await readObjective();
    const startedSequence = (objective as { progress?: { satisfied?: number } } | null)?.progress?.satisfied ?? 0;
    let turns = 0;
    let refusals = 0;
    const log: string[] = [];

    while (objective && turns < cap) {
        const next = (objective as { next_turn?: Record<string, unknown>; complete?: boolean }).next_turn;
        if (!next || (objective as { complete?: boolean }).complete) break;
        // The obligation changed — the caller asked to stop here, at a real runtime transition.
        const satisfied = (objective as { progress?: { satisfied?: number } }).progress?.satisfied ?? 0;
        if (body.until_step_changes && satisfied > startedSequence) break;
        // Anything that is not a value the conversation is waiting for is where a person takes over:
        // acknowledgment, signature, upload and completion are interactions, not answers.
        const kind = String(next.kind ?? "");
        if (kind !== "collect_missing_value" && kind !== "confirm_known_value") {
            log.push(`stopped at ${kind}`);
            break;
        }

        const specimen = specimenAnswerForTurn(next);
        if (specimen === null) {
            log.push(`no specimen for ${String(next.label ?? kind)}`);
            break;
        }

        const res = await handleParticipantTurn(boot.db, accessNow(), { value: specimen }, startParticipantTiming());
        const json = (await res.json().catch(() => ({}))) as {
            data?: { outcome?: string; objective?: Record<string, unknown> };
        };
        turns += 1;
        const outcome = json.data?.outcome ?? "unknown";
        if (outcome !== "write_shared_value" && outcome !== "confirm_known_value" && outcome !== "write_value") {
            refusals += 1;
            // The runtime refused this specimen. That is the runtime working; do not force it.
            if (refusals > 3) {
                log.push(`stopped after repeated refusals (last outcome ${outcome})`);
                break;
            }
        }
        objective = json.data?.objective ?? (await readObjective());
    }

    return NextResponse.json({
        ok: true,
        turns,
        refusals,
        log,
        objective,
    });
}
