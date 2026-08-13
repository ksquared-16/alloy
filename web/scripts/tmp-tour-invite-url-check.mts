import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync("/Users/Kelly/Alloy/web/.env.local", "utf8");
const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
process.env.NEXT_PUBLIC_SUPABASE_URL = get("NEXT_PUBLIC_SUPABASE_URL")!;
process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const mod = await import("../lib/tours/invitation/sendTourInvitation.ts");
const sendTourInvitation = (mod as { sendTourInvitation: Function }).sendTourInvitation;
const prep = await sendTourInvitation({
  supabase,
  orgId: "93667019-bd28-49b5-a688-acc9bb1e0a19",
  opportunityId: "d097e1a8-c3c0-4c51-a113-2275b009b9a9",
  actorUserId: "b2562c99-24dd-404b-b692-a0c4676d5bdf",
  baseUrl: "http://localhost:3015",
  mode: "prepare",
  idempotencyKey: `send_tour_invitation:prepare:urlcheck:${Date.now()}`,
});
const url = prep.ok ? prep.draft?.invitationActionUrl : null;
const body = prep.ok ? prep.draft?.emailBody : "";
console.log(
  JSON.stringify(
    {
      ok: prep.ok,
      keys: Object.keys(mod),
      url,
      absolute: /^https?:\/\//i.test(String(url || "")),
      relativeLeak: /(?:^|\n)\/a\//.test(String(body || "")),
      bodyLine: String(body || "")
        .split("\n")
        .find((l) => l.includes("/a/") || l.includes("tour-booking")),
    },
    null,
    2,
  ),
);
