import { describe, expect, it } from "vitest";

import { isCertApiUrl, isCertDbUrl } from "./cert/processingCertTarget";

describe("processing cert target guard", () => {
    it("accepts the shared certification stack and the retired isolated one — nothing else", () => {
        expect(isCertApiUrl("http://127.0.0.1:54421")).toBe(true);
        expect(isCertApiUrl("http://127.0.0.1:55321")).toBe(true);
        expect(isCertApiUrl("http://127.0.0.1:54321")).toBe(false);
        expect(isCertApiUrl("https://abc.supabase.co")).toBe(false);
        expect(isCertDbUrl("postgresql://postgres:postgres@127.0.0.1:54422/postgres")).toBe(true);
        expect(isCertDbUrl("postgresql://postgres:postgres@127.0.0.1:55322/postgres")).toBe(true);
        expect(isCertDbUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(false);
        expect(isCertDbUrl("postgresql://postgres:x@db.abc.supabase.co:5432/postgres")).toBe(false);
    });

    it("when certification is enabled, the configured targets are certification targets", () => {
        if (process.env.PROCESSING_LOCAL_CERT_ENABLED !== "true") return;
        expect(isCertApiUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)).toBe(true);
        expect(isCertDbUrl(process.env.PROCESSING_LOCAL_CERT_DATABASE_URL)).toBe(true);
    });
});
