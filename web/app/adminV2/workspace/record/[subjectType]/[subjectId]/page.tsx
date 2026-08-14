import { notFound, redirect } from "next/navigation";

import DurableRecordSurface from "@/components/presentation/durableRecord/DurableRecordSurface";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { isDurableSubjectType } from "@/lib/runtime/focus/durableRecordRoute";

export const dynamic = "force-dynamic";

type PageProps = {
    params: Promise<{ subjectType: string; subjectId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/**
 * `/workspace/record/{person|child}/{id}` — the durable record surface.
 *
 * The segment validates the GRAIN and the session, and nothing else. Composition happens behind
 * `/api/admin/durable-record`, which re-resolves access on its own: navigation is not authorization,
 * so the surface must not be the thing that decides a record is reachable.
 *
 * An unknown grain is a 404 rather than a redirect to a default — guessing which record the operator
 * meant is how a surface ends up answering a question it was not asked.
 */
export default async function DurableRecordPage({ params, searchParams }: PageProps) {
    const [{ subjectType, subjectId }, sp] = await Promise.all([params, searchParams]);

    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        redirect(ctx.status === 401 ? "/login" : "/unauthorized");
    }

    if (!isDurableSubjectType(subjectType) || !subjectId.trim()) {
        notFound();
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-durable-record-page={subjectType}>
            <DurableRecordSurface
                subjectType={subjectType}
                subjectId={subjectId.trim()}
                cardKey={one(sp.card)}
            />
        </div>
    );
}
