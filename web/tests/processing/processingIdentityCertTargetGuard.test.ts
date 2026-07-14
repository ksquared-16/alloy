import { describe, expect, it } from "vitest";

describe("processing cert target guard", () => {
    it("requires isolated stack port 55321 when cert enabled", () => {
        if (process.env.PROCESSING_LOCAL_CERT_ENABLED !== "true") return;
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
        expect(url).toContain("127.0.0.1:55321");
        expect(url).not.toContain(":54321");
        expect(url).not.toMatch(/supabase\.co/i);
    });

    it("requires cert database on port 55322", () => {
        if (process.env.PROCESSING_LOCAL_CERT_ENABLED !== "true") return;
        const db = process.env.PROCESSING_LOCAL_CERT_DATABASE_URL ?? "";
        expect(db).toMatch(/127\.0\.0\.1:55322\//);
        expect(db).not.toMatch(/127\.0\.0\.1:54322\//);
    });
});
