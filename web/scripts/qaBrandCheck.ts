/** READ-ONLY: is the theme resolver actually consuming the tenant's authored branding? */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveParticipantBrand, PARTICIPANT_DEFAULT_ACCENT } from "@/lib/public/forms/participantBrandTheme";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const text = readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
const env = Object.fromEntries(text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v]; }));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
    const { data } = await supabase
        .from("form_definitions")
        .select("id, name, metadata")
        .eq("org_id", ORG)
        .eq("id", "ee75732b-036d-4b3d-8f33-a87c21b78105")
        .maybeSingle();
    const meta = (data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
    const brand = resolveParticipantBrand(meta);
    console.log("authored :", JSON.stringify({ accent_color: meta.accent_color, brand_name: meta.brand_name, logo_url: meta.logo_url }));
    console.log("resolved :", JSON.stringify(brand));
    console.log("consuming authored accent:", brand.accentColor !== PARTICIPANT_DEFAULT_ACCENT);
    console.log("brand name authored      :", brand.brandName !== null);
    console.log("logo authored            :", brand.logoUrl !== null);
}
void main();
