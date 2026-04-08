import type { RecordSurface } from "@/lib/rrs/types";

const SURFACES: RecordSurface[] = ["drawer", "overview", "full"];

export function parseRecordSurface(raw: string | null | undefined): RecordSurface | null {
    if (raw == null || String(raw).trim() === "") return null;
    const s = String(raw).trim().toLowerCase();
    return SURFACES.includes(s as RecordSurface) ? (s as RecordSurface) : null;
}

export function resolveRecordSurfaceParam(raw: string | null | undefined, fallback: RecordSurface): RecordSurface {
    return parseRecordSurface(raw) ?? fallback;
}
