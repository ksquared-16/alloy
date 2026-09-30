import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { launchFkStampFromCrmSnapshotRecord } from "@/lib/forms/packets/formPacketService";
import { readHouseholdCanonicalAddress } from "@/lib/forms/prefill/addressBindingPrefill";

/**
 * The live journey the human QA pass is run against, read in the operator's language.
 *
 * ## Why a read and not a launcher
 *
 * The previous version of this page had a button that POSTed to the operator launch endpoint and
 * minted a fresh packet session on every click. That was written when the QA child sat at a stage
 * where `Send enrollment packet` was unreachable, so a link had to be conjured. It is now actively
 * wrong: there is ONE real launched journey, it carries the state that item 6 is being judged on,
 * and a button that quietly starts a second one would destroy the thing it was meant to open.
 *
 * So this module only reads. Every query below is a `.select()`. Nothing here creates a session,
 * a link, a submission or a record, and nothing mutates the journey the Director is about to walk.
 *
 * ## Why the session id is pinned here
 *
 * A token cannot be recovered from the database — `form_public_links` stores only `token_hash` — so
 * the journey has to be named by something. It is named by its packet session, the one identifier
 * that cannot drift onto a different family, and everything a human should see (who the child is,
 * which household, which stage, how far the paperwork got) is derived from it. The operator never
 * types or copies an identifier.
 */

/** The launched Enrollment journey under human QA. One disposable QA family, named deliberately. */
const QA_PACKET_SESSION_ID = "0ff15f57-527f-407c-b5f9-feef427ff479";

export type QaJourneyStep = {
    readonly sequenceIndex: number;
    readonly name: string;
    readonly status: string;
    readonly current: boolean;
};

export type QaJourney = {
    readonly childName: string;
    readonly householdName: string | null;
    readonly stageLabel: string | null;
    readonly packetName: string | null;
    readonly packetStatus: string;
    readonly currentStepNumber: number;
    readonly totalSteps: number;
    readonly steps: readonly QaJourneyStep[];
    /** Same-origin path, so the QA reader opens the participant surface on the host they are on. */
    readonly participantPath: string | null;
    /** Needed only so the page can read the participant's OWN financial view. Never displayed. */
    readonly participantToken: string | null;
    readonly linkActive: boolean;
    /**
     * The canonical household address the Admissions Home-address group is answered from, or null
     * when the household has none. Shown because "does it ask me for what Alloy already knows?" is
     * a question the Director cannot judge without seeing what Alloy holds.
     */
    readonly householdAddress: string | null;
};

export type QaJourneyResult =
    | { readonly ok: true; readonly journey: QaJourney }
    | { readonly ok: false; readonly reason: string };

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function trimmedOrNull(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** `/forms/embed/<token>` — the plaintext link the launch recorded on the link row. */
function tokenFromEmbedPath(path: string | null): string | null {
    if (!path) return null;
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    return last && segments.includes("embed") ? last : null;
}

export async function readRealEnrollmentQaJourney(): Promise<QaJourneyResult> {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return { ok: false, reason: "This server has no database credentials, so the journey cannot be read." };
    }
    const supabase = createServiceRoleClient();

    const { data: sessionRow, error: sessionError } = await supabase
        .from("form_packet_sessions")
        .select("id, org_id, status, current_sequence_index, started_via_public_link_id, crm_snapshot, packet_definition_id")
        .eq("id", QA_PACKET_SESSION_ID)
        .maybeSingle();
    if (sessionError) return { ok: false, reason: `The QA journey could not be read: ${sessionError.message}` };
    if (!sessionRow) {
        return { ok: false, reason: "The pinned QA journey is not in this database. It may belong to another environment." };
    }
    const session = sessionRow as {
        id: string;
        org_id: string;
        status: string | null;
        current_sequence_index: number | null;
        started_via_public_link_id: string | null;
        crm_snapshot: unknown;
        packet_definition_id: string | null;
    };

    const fks = launchFkStampFromCrmSnapshotRecord(asRecord(session.crm_snapshot));

    // Who the family sees themselves as. Same two reads the launch preview does.
    let childName = "the enrolling child";
    let householdName: string | null = null;
    if (fks.customer_member_id) {
        const { data: childRow } = await supabase
            .from("customer_members")
            .select("id, display_name, first_name, last_name, customer_id")
            .eq("org_id", session.org_id)
            .eq("id", fks.customer_member_id)
            .maybeSingle();
        const child = childRow as {
            display_name?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            customer_id?: string | null;
        } | null;
        if (child) {
            childName =
                trimmedOrNull(child.display_name)
                || [child.first_name, child.last_name].map((x) => (x ?? "").trim()).filter(Boolean).join(" ")
                || childName;
            const customerId = trimmedOrNull(child.customer_id) ?? fks.customer_id;
            if (customerId) {
                const { data: household } = await supabase
                    .from("customers")
                    .select("name")
                    .eq("org_id", session.org_id)
                    .eq("id", customerId)
                    .maybeSingle();
                householdName = trimmedOrNull((household as { name?: string | null } | null)?.name);
            }
        }
    }

    // The link carries the participant path and the stage the launch was made from.
    let participantPath: string | null = null;
    let stageLabel: string | null = null;
    let linkActive = false;
    if (session.started_via_public_link_id) {
        const { data: linkRow } = await supabase
            .from("form_public_links")
            .select("id, is_active, metadata")
            .eq("id", session.started_via_public_link_id)
            .maybeSingle();
        const link = linkRow as { is_active?: boolean | null; metadata?: unknown } | null;
        if (link) {
            linkActive = link.is_active !== false;
            const meta = asRecord(link.metadata);
            participantPath = trimmedOrNull(meta.share_embed_path);
            stageLabel = trimmedOrNull(meta.label) ?? trimmedOrNull(meta.stage_key);
        }
    }

    // How far the paperwork actually got, and what each step is called.
    const packetName = session.packet_definition_id
        ? await (async () => {
              const { data } = await supabase
                  .from("form_packet_definitions")
                  .select("name")
                  .eq("org_id", session.org_id)
                  .eq("id", session.packet_definition_id)
                  .maybeSingle();
              return trimmedOrNull((data as { name?: string | null } | null)?.name);
          })()
        : null;

    const { data: itemRows } = await supabase
        .from("form_packet_session_items")
        .select("id, packet_item_id, sequence_index, status")
        .eq("packet_session_id", session.id)
        .order("sequence_index", { ascending: true });
    const items = (itemRows ?? []) as { packet_item_id: string | null; sequence_index: number; status: string | null }[];

    // Step names come from the packet's own items, so they read as the family's steps.
    const nameBySequence = new Map<number, string>();
    if (session.packet_definition_id) {
        const { data: packetItems } = await supabase
            .from("form_packet_items")
            .select("id, sequence_index, form_definition_id")
            .eq("org_id", session.org_id)
            .eq("packet_definition_id", session.packet_definition_id)
            .order("sequence_index", { ascending: true });
        const defItems = (packetItems ?? []) as { sequence_index: number; form_definition_id: string | null }[];
        const formIds = defItems.map((x) => x.form_definition_id).filter((x): x is string => Boolean(x));
        if (formIds.length) {
            const { data: forms } = await supabase
                .from("form_definitions")
                .select("id, name")
                .eq("org_id", session.org_id)
                .in("id", formIds);
            const byId = new Map(
                ((forms ?? []) as { id: string; name: string | null }[]).map((f) => [f.id, trimmedOrNull(f.name)]),
            );
            for (const it of defItems) {
                const name = it.form_definition_id ? byId.get(it.form_definition_id) : null;
                if (name) nameBySequence.set(it.sequence_index, name);
            }
        }
    }

    const address = fks.customer_id
        ? await readHouseholdCanonicalAddress(supabase, session.org_id, fks.customer_id)
        : null;
    const householdAddress = address
        ? [address.address_line1, address.address_line2, address.city, address.state, address.postal_code]
              .filter(Boolean)
              .join(", ") || null
        : null;

    const currentIndex = typeof session.current_sequence_index === "number" ? session.current_sequence_index : 0;
    const steps: QaJourneyStep[] = items.map((it) => ({
        sequenceIndex: it.sequence_index,
        name: nameBySequence.get(it.sequence_index) ?? `Step ${it.sequence_index + 1}`,
        status: trimmedOrNull(it.status) ?? "not started",
        current: it.sequence_index === currentIndex,
    }));

    return {
        ok: true,
        journey: {
            childName,
            householdName,
            stageLabel,
            packetName,
            packetStatus: trimmedOrNull(session.status) ?? "unknown",
            currentStepNumber: currentIndex + 1,
            totalSteps: steps.length,
            steps,
            participantPath,
            participantToken: tokenFromEmbedPath(participantPath),
            linkActive,
            householdAddress,
        },
    };
}
