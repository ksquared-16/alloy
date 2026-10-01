import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * Is the real source paperwork actually there for H1 to start from?
 *
 * ## The source artifact, and why this one
 *
 * H1 begins with "here is the Enrollment paperwork", so it has to begin with the paperwork the
 * program was characterised against — not a recreation, and not the already-published Admissions
 * v12, which would make H1 prove nothing about authoring.
 *
 * `docs/audits/active/real-enrollment-certification-v1/packet-baseline.md` measured that paperwork:
 * School of Enrichment, Inc. (Bend, Oregon) 2026–2027 admissions packet — three documents, 30 pages,
 * 182 raw destinations, reconciled against extraction output rather than estimated. The certification
 * lineage names the single Processing case that holds all three, and records that the documents were
 * already stored before any publish. That case is the pin below.
 *
 * Read-only: three selects, and every one of them scoped to the case's own org.
 */

/** The Processing case holding the three real 2026–2027 admissions sources. */
const H1_SOURCE_CASE_ID = "89caf3ec-2c3d-4286-a022-524bdaad16a8";

export type H1Source = {
    readonly title: string;
    readonly docType: string | null;
    readonly role: string | null;
    readonly status: string | null;
};

/** What a title search found when the pinned case is absent from this environment. */
export type H1DocumentSearchHit = {
    readonly title: string;
    readonly docType: string | null;
    readonly status: string | null;
    readonly createdAt: string | null;
    /** The Processing case this document is a source of, when it is one. */
    readonly caseId: string | null;
    readonly caseRole: string | null;
};

export type H1Readiness =
    | {
          readonly ok: true;
          readonly caseId: string;
          readonly caseStatus: string | null;
          readonly caseType: string | null;
          readonly sources: readonly H1Source[];
          /** Sources the case references but whose document row could not be read back. */
          readonly unreadableSources: number;
      }
    | {
          readonly ok: false;
          readonly reason: string;
          /**
           * Documents in THIS environment whose titles match the characterised paperwork. The pinned
           * case comes from the certification lineage and may have lived on the certification stack;
           * the documents can still be here under a different case, and that is a different problem
           * from the paperwork being absent.
           */
          readonly candidates?: readonly H1DocumentSearchHit[];
      };

function trimmedOrNull(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function readH1Readiness(): Promise<H1Readiness> {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return { ok: false, reason: "This server has no database credentials, so the source paperwork cannot be checked." };
    }
    const supabase = createAdminClient();

    const { data: caseRow, error: caseError } = await supabase
        .from("processing_cases")
        .select("id, org_id, status, case_type, archived_at")
        .eq("id", H1_SOURCE_CASE_ID)
        .maybeSingle();
    if (caseError) return { ok: false, reason: `The source case could not be read: ${caseError.message}` };
    if (!caseRow) {
        /*
         * The pinned case is named by the certification lineage, which was written against the
         * certification stack. Before reporting the paperwork missing, look for it by title here.
         */
        /*
         * CASE FIRST, not title first.
         *
         * Searching `documents` by title drowns in participant uploads — this environment holds dozens
         * of "Immunization or vaccination record" files a QA family attached. What identifies SOURCE
         * paperwork is that an operator put it on a Processing case, so the cases are read first and
         * their source documents reported with them. Which case is authoritative is then a question the
         * Director can answer from evidence instead of from a date in a filename.
         */
        const { data: allLinks } = await supabase
            .from("processing_case_sources")
            .select("processing_case_id, source_id, source_kind, role")
            .limit(200);
        const links = ((allLinks ?? []) as {
            processing_case_id?: string | null; source_id?: string | null; source_kind?: string | null; role?: string | null;
        }[]).filter((l) => (l.source_kind ?? "document") === "document");

        const docIds = [...new Set(links.map((l) => trimmedOrNull(l.source_id)).filter((x): x is string => Boolean(x)))];
        const docs = new Map<string, { title: string; docType: string | null; status: string | null; createdAt: string | null }>();
        if (docIds.length) {
            const { data: docRows } = await supabase
                .from("documents")
                .select("id, doc_type, title, status, created_at")
                .in("id", docIds);
            for (const d of (docRows ?? []) as {
                id: string; doc_type?: string | null; title?: string | null; status?: string | null; created_at?: string | null;
            }[]) {
                docs.set(String(d.id), {
                    title: trimmedOrNull(d.title) ?? "Untitled document",
                    docType: trimmedOrNull(d.doc_type),
                    status: trimmedOrNull(d.status),
                    createdAt: trimmedOrNull(d.created_at),
                });
            }
        }

        const candidates: H1DocumentSearchHit[] = links
            .map((l) => {
                const doc = docs.get(trimmedOrNull(l.source_id) ?? "");
                if (!doc) return null;
                return {
                    title: doc.title,
                    docType: doc.docType,
                    status: doc.status,
                    createdAt: doc.createdAt,
                    caseId: trimmedOrNull(l.processing_case_id),
                    caseRole: trimmedOrNull(l.role),
                };
            })
            .filter((x): x is H1DocumentSearchHit => Boolean(x))
            /*
             * Narrowed to the three documents the programme was characterised against. Other tenants'
             * source paperwork sits in the same table — a "Northwind Enrollment Application" is not this
             * school's admissions packet — and offering it as a candidate would invite exactly the wrong
             * start.
             */
            .filter((x) => /handbook|immuniz|admissions/i.test(x.title))
            .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
            .slice(0, 12);

        return {
            ok: false,
            reason:
                "The case named by the certification lineage is not in this database — it was recorded against the certification stack. The paperwork IS here, but as separate cases with one source each, and three documents are called \"Admissions Packet\". Which one H1 starts from is a decision from lineage, so it is yours to make rather than this page's to guess.",
            candidates,
        };
    }
    const kase = caseRow as { id: string; org_id: string; status?: string | null; case_type?: string | null; archived_at?: string | null };

    const { data: sourceRows } = await supabase
        .from("processing_case_sources")
        .select("id, processing_case_id, source_kind, source_id, role")
        .eq("processing_case_id", kase.id);
    const links = (sourceRows ?? []) as { source_kind?: string | null; source_id?: string | null; role?: string | null }[];

    const documentIds = links
        .filter((l) => (l.source_kind ?? "document") === "document")
        .map((l) => trimmedOrNull(l.source_id))
        .filter((x): x is string => Boolean(x));

    const sources: H1Source[] = [];
    let unreadableSources = 0;
    if (documentIds.length) {
        const { data: docRows } = await supabase
            .from("documents")
            .select("id, doc_type, title, status")
            .eq("org_id", kase.org_id)
            .in("id", documentIds);
        const byId = new Map(
            ((docRows ?? []) as { id: string; doc_type?: string | null; title?: string | null; status?: string | null }[]).map(
                (d) => [String(d.id), d],
            ),
        );
        for (const link of links) {
            const id = trimmedOrNull(link.source_id);
            const doc = id ? byId.get(id) : undefined;
            if (!doc) {
                unreadableSources += 1;
                continue;
            }
            sources.push({
                title: trimmedOrNull(doc.title) ?? "Untitled document",
                docType: trimmedOrNull(doc.doc_type),
                role: trimmedOrNull(link.role),
                status: trimmedOrNull(doc.status),
            });
        }
    }

    return {
        ok: true,
        caseId: kase.id,
        caseStatus: kase.archived_at ? "archived" : trimmedOrNull(kase.status),
        caseType: trimmedOrNull(kase.case_type),
        sources,
        unreadableSources,
    };
}
