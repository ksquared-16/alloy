/**
 * Service-role Tour template cert — no Next.js (Slot 5 memory pressure).
 * Proves: provision → edit/version → prepare draft uses library → confirmation render
 * uses library + friendly anchors → optional live enqueue with unique generation token.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const outDir =
  "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-tour-comms-templates";
const OPP = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const MARKER = `CERT_TOUR_TMPL_${Date.now()}`;
const ACTOR = "b2562c99-24dd-404b-b692-a0c4676d5bdf";

fs.mkdirSync(outDir, { recursive: true });
const log = [];
function push(entry) {
  log.push({ t: new Date().toISOString(), ...entry });
  fs.writeFileSync(path.join(outDir, "service-qa-tour-comms-templates.json"), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(entry));
}

function loadEnv() {
  const p = "/Users/Kelly/Alloy/web/.env.local";
  const env = fs.readFileSync(p, "utf8");
  const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), key: get("SUPABASE_SERVICE_ROLE_KEY") };
}

const env = loadEnv();
process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
process.env.SUPABASE_URL = env.url;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.key;
const supabase = createClient(env.url, env.key, { auth: { persistSession: false } });

const {
  ensureOrgTourCommunicationTemplates,
  loadTourCommsLibraryOverrides,
  validateTourSystemTemplateRequiredPlaceholders,
  TOUR_SYSTEM_TEMPLATE_KEYS,
} = await import("../lib/tours/comms/tourSystemTemplates.ts");
const { resolveTourCommsConfigWithLibrary } = await import("../lib/tours/comms/resolveTourCommsConfigWithLibrary.ts");
const { renderTourCommsTemplate, polishTourCommsPlainEmailToHtml } = await import(
  "../lib/tours/comms/tourCommsTemplates.ts"
);
const { sendTourInvitation } = await import("../lib/tours/invitation/sendTourInvitation.ts");
const { orchestrateTourCommsForBooking } = await import("../lib/tours/comms/tourCommsOrchestrator.ts");

push({ step: "start", marker: MARKER });

// --- Provision ---
const provisioned = await ensureOrgTourCommunicationTemplates({
  supabase,
  orgId: ORG,
  actorUserId: ACTOR,
});
push({ step: "provision", ...provisioned });

const { data: dbTour, error: listErr } = await supabase
  .from("communication_templates")
  .select("id, name, system_key, status, current_version_id, channel")
  .eq("org_id", ORG)
  .like("system_key", "tour_%");
if (listErr) throw new Error(listErr.message);

const keys = (dbTour || []).map((r) => r.system_key).sort();
const expected = [];
for (const k of TOUR_SYSTEM_TEMPLATE_KEYS) {
  expected.push(`${k}:email`, `${k}:sms`);
}
const missing = expected.filter((k) => !keys.includes(k));
push({ step: "inventory", keys, missing });

const invEmail = (dbTour || []).find((t) => t.system_key === "tour_invitation:email");
const confEmail = (dbTour || []).find((t) => t.system_key === "tour_confirmation:email");
if (!invEmail || !confEmail) {
  push({ step: "FAIL", reason: "missing_templates" });
  process.exit(3);
}

async function appendVersion(template, { subject, body }) {
  const { data: maxRow } = await supabase
    .from("communication_template_versions")
    .select("version_number")
    .eq("org_id", ORG)
    .eq("template_id", template.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const next = Number(maxRow?.version_number || 0) + 1;
  const { data: version, error } = await supabase
    .from("communication_template_versions")
    .insert({
      org_id: ORG,
      template_id: template.id,
      version: next,
      version_number: next,
      subject,
      body,
      body_format: template.channel === "email" ? "html" : "text",
      token_paths: [],
      metadata: { source: "service_cert", marker: MARKER },
      created_by: ACTOR,
    })
    .select("id, version_number")
    .single();
  if (error) throw new Error(error.message);
  await supabase
    .from("communication_templates")
    .update({ current_version_id: version.id, updated_at: new Date().toISOString(), updated_by: ACTOR })
    .eq("id", template.id)
    .eq("org_id", ORG);
  return version;
}

const { data: invVer } = await supabase
  .from("communication_template_versions")
  .select("subject, body")
  .eq("id", invEmail.current_version_id)
  .maybeSingle();
let invBody = String(invVer?.body || "");
if (!invBody.includes("{{invitation_action_url}}")) {
  invBody =
    "Hello {{parent_name}},\n\nChoose a tour time:\n{{invitation_action_url}}\n\nWarmly,\n{{org_name}}\n";
}
if (!invBody.includes(MARKER)) {
  invBody = invBody.includes("We look forward to meeting you.")
    ? invBody.replace("We look forward to meeting you.", `We look forward to meeting you.\n\n[${MARKER} invitation]`)
    : `${invBody}\n\n[${MARKER} invitation]`;
}
const invCheck = validateTourSystemTemplateRequiredPlaceholders({
  systemKey: invEmail.system_key,
  subject: invVer?.subject,
  body: invBody,
});
const invBad = validateTourSystemTemplateRequiredPlaceholders({
  systemKey: invEmail.system_key,
  subject: "x",
  body: "no link here",
});
push({ step: "required-placeholder", ok: invCheck, blocked: invBad });
const invVersion = await appendVersion(invEmail, { subject: invVer?.subject || "Come visit", body: invBody });
push({ step: "edit-invitation", version: invVersion });

const { data: confVer } = await supabase
  .from("communication_template_versions")
  .select("subject, body")
  .eq("id", confEmail.current_version_id)
  .maybeSingle();
let confBody = String(confVer?.body || "");
if (!confBody.includes("Add to calendar")) {
  confBody = [
    "Hello {{parent_name}},",
    "",
    "Your tour is confirmed for {{tour_display_label}}.",
    "",
    "Add to calendar: {{add_to_calendar_url}}",
    "Need to reschedule? {{reschedule_url}}",
    "Manage or cancel your tour: {{cancel_url}}",
    "",
    "Warmly,",
    "{{org_name}}",
  ].join("\n");
}
if (!confBody.includes(MARKER)) {
  confBody = confBody.includes("We look forward to meeting you.")
    ? confBody.replace("We look forward to meeting you.", `We look forward to meeting you.\n\n[${MARKER} confirmation]`)
    : `${confBody}\n\n[${MARKER} confirmation]`;
}
const confSubject = `${confVer?.subject || "Your tour is scheduled"} · ${MARKER}`;
const confVersion = await appendVersion(confEmail, { subject: confSubject, body: confBody });
push({ step: "edit-confirmation", version: confVersion });

// --- Library resolve ---
const { config } = await resolveTourCommsConfigWithLibrary(supabase, {
  orgId: ORG,
  actorUserId: ACTOR,
});
const libInv = config.templates?.tour_invitation?.email?.body_text || "";
const libConf = config.templates?.tour_confirmation?.email?.body_text || "";
push({
  step: "library-resolve",
  invHasMarker: libInv.includes(MARKER),
  confHasMarker: libConf.includes(MARKER),
  confSubject: config.templates?.tour_confirmation?.email?.subject,
});

// --- Friendly link render (unit-style with long URLs) ---
const longCal =
  "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Tour&dates=20260820T170000Z%2F20260820T173000Z&details=VeryLongTokenABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const longResched = "http://localhost:3015/tour-booking/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP";
const longManage = "http://localhost:3015/tour-booking/zyxwvutsrqponmlkjihgfedcba9876543210MANAGETOKENHERE";
const longInvite = "http://localhost:3015/a/AbCdEfGhIjKlMnOp";

const renderedConf = renderTourCommsTemplate({
  eventKey: "tour_confirmation",
  channel: "email",
  templateOverrides: config.templates,
  context: {
    orgName: "Firefly",
    locationName: "Main",
    parentName: "Alex",
    tourDisplayLabel: "Thursday, August 20 at 10:00 AM",
    addToCalendarUrl: longCal,
    rescheduleUrl: longResched,
    cancelUrl: longManage,
  },
});
const html = renderedConf?.channel === "email" ? renderedConf.bodyHtml || "" : "";
const sms = renderTourCommsTemplate({
  eventKey: "tour_confirmation",
  channel: "sms",
  templateOverrides: config.templates,
  context: {
    orgName: "Firefly",
    parentName: "Alex",
    tourDisplayLabel: "Thursday, August 20 at 10:00 AM",
    addToCalendarUrl: longCal,
    rescheduleUrl: longResched,
    cancelUrl: longManage,
  },
});
const anchors = [...html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi)].map((m) => ({
  hrefLen: m[1].length,
  hrefStarts: m[1].slice(0, 40),
  text: m[2],
}));
push({
  step: "friendly-render",
  hasMarker: (renderedConf?.channel === "email" ? renderedConf.bodyText : "").includes(MARKER),
  subjectHasMarker: (renderedConf?.channel === "email" ? renderedConf.subject : "").includes(MARKER),
  anchors,
  rawUrlAsVisibleText: /Add to calendar:\s*https?:\/\//i.test(html),
  smsKeepsUrl: sms?.channel === "sms" && /https?:\/\//.test(sms.body),
  smsBodySlice: sms?.channel === "sms" ? sms.body.slice(0, 280) : null,
  htmlSlice: html.slice(0, 600),
});

const inviteRendered = renderTourCommsTemplate({
  eventKey: "tour_invitation",
  channel: "email",
  templateOverrides: config.templates,
  context: {
    orgName: "Firefly",
    locationName: "Main",
    parentName: "Alex",
    invitationActionUrl: longInvite,
  },
});
const invHtml = inviteRendered?.channel === "email" ? inviteRendered.bodyHtml || "" : "";
push({
  step: "invitation-friendly",
  hasMarker: (inviteRendered?.channel === "email" ? inviteRendered.bodyText : "").includes(MARKER),
  chooseAnchor: [...invHtml.matchAll(/<a[^>]+>([^<]*)<\/a>/gi)].map((m) => m[1]),
  hrefPreserved: invHtml.includes(longInvite),
});

// Plain→HTML polish (family-send / python fallback path)
const polished = polishTourCommsPlainEmailToHtml(
  `Add to calendar: ${longCal}\nNeed to reschedule? ${longResched}\nManage or cancel your tour: ${longManage}`,
);
push({
  step: "polish-plain",
  hasAdd: />Add to calendar</.test(polished),
  hasResched: />Reschedule tour</.test(polished),
  hasManage: />Manage or cancel tour</.test(polished),
  fullHref:
    polished.includes("calendar.google.com/calendar/render") && polished.includes(longResched),
});

// --- Prepare invitation (live mint) ---
const prep = await sendTourInvitation({
  supabase,
  orgId: ORG,
  opportunityId: OPP,
  actorUserId: ACTOR,
  baseUrl: "http://localhost:3015",
  mode: "prepare",
  idempotencyKey: `send_tour_invitation:prepare:${OPP}:${Date.now()}:service-tmpl`,
});
push({
  step: "prepare",
  ok: prep.ok,
  code: prep.ok ? undefined : prep.code,
  message: prep.ok ? undefined : prep.message,
  invitationId: prep.ok ? prep.invitationId : null,
  bodyHasMarker: prep.ok ? Boolean(prep.draft?.emailBody?.includes(MARKER)) : false,
  bodyHasChoose: prep.ok ? /Choose a tour time/i.test(prep.draft?.emailBody || "") : false,
  hasUrl: prep.ok ? Boolean(prep.draft?.invitationActionUrl) : false,
  emailBodySlice: prep.ok ? String(prep.draft?.emailBody || "").slice(0, 400) : null,
});

// --- Live confirmation enqueue with unique generation (avoids dedupe) ---
const { data: booking } = await supabase
  .from("tour_bookings")
  .select("*")
  .eq("org_id", ORG)
  .eq("opportunity_id", OPP)
  .eq("status_key", "confirmed")
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();

let enqueueResult = null;
let captured = [];
if (booking) {
  enqueueResult = await orchestrateTourCommsForBooking({
    supabase,
    orgId: ORG,
    booking,
    actorUserId: ACTOR,
    immediateEventKey: "tour_confirmation",
    immediateGenerationToken: `cert:${MARKER}`,
    lifecycleAction: "confirm",
    reminderAction: "none",
    actionModel: {
      rescheduleUrl: longResched,
      manageUrl: longManage,
      confirmUrl: null,
    },
    deps: {
      enqueueImmediate: async (args) => {
        captured.push({
          channel: args.channelRaw,
          bodyIsHtml: args.bodyIsHtml,
          subject: args.emailSubjectRaw,
          bodySlice: String(args.bodyRaw || "").slice(0, 500),
          hasMarker: String(args.bodyRaw || "").includes(MARKER) || String(args.emailSubjectRaw || "").includes(MARKER),
          hasAddAnchor: /Add to calendar<\/a>/i.test(String(args.bodyRaw || "")),
          hasReschedAnchor: /Reschedule tour<\/a>/i.test(String(args.bodyRaw || "")),
          hasManageAnchor: /Manage or cancel tour<\/a>/i.test(String(args.bodyRaw || "")),
          rawUrlLabel: /Add to calendar:\s*https?:\/\//i.test(String(args.bodyRaw || "")),
        });
        return {
          communicationMessageId: `cert-msg-${MARKER}`,
          threadId: `cert-thread-${MARKER}`,
          skippedReason: null,
        };
      },
      triggerQueue: async () => ({}),
      hasExistingImmediateSend: async () => false,
    },
  });
  push({
    step: "orchestrate-confirmation",
    bookingId: booking.id,
    immediate: enqueueResult.immediate,
    captured,
  });
} else {
  push({ step: "orchestrate-skipped", reason: "no_booking" });
}

const pass = {
  templatesProvisioned: missing.length === 0,
  invitationLibraryMarker: libInv.includes(MARKER),
  confirmationLibraryMarker: libConf.includes(MARKER),
  requiredPlaceholderEnforced: invBad.ok === false,
  friendlyEmailAnchors:
    anchors.some((a) => a.text === "Add to calendar") &&
    anchors.some((a) => a.text === "Reschedule tour") &&
    anchors.some((a) => a.text === "Manage or cancel tour") &&
    anchors.every((a) => a.hrefLen > 40),
  smsKeepsUrl: Boolean(sms?.channel === "sms" && /https?:\/\//.test(sms.body)),
  prepareUsesLibrary: Boolean(prep.ok && prep.draft?.emailBody?.includes(MARKER)),
  orchestrateUsesLibraryHtml: Boolean(
    enqueueResult?.immediate?.some((r) => r.status === "sent") &&
      captured.some(
        (c) => c.hasMarker && c.bodyIsHtml && c.hasAddAnchor && c.hasReschedAnchor && c.hasManageAnchor && !c.rawUrlLabel,
      ),
  ),
};

push({ step: "RESULT", pass, marker: MARKER });
const ok = Object.values(pass).every(Boolean);
process.exit(ok ? 0 : 1);
