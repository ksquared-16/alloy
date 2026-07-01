import { NextRequest, NextResponse } from "next/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_INBOX = process.env.MARKETING_DEMO_INBOX ?? "hello@workwithalloy.com";

interface DemoRequestBody {
  name?: string;
  organization?: string;
  email?: string;
  message?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DemoRequestBody;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const organization = typeof body.organization === "string" ? body.organization.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!name || !organization || !email) {
      return NextResponse.json(
        { ok: false, error: "Name, organization, and email are required." },
        { status: 400 }
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
    }

    const payload = {
      name,
      organization,
      email,
      message: message || "(no message)",
      submittedAt: new Date().toISOString(),
    };

    console.info("[marketing/demo-request]", payload);

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.MARKETING_DEMO_FROM ?? "Alloy <onboarding@resend.dev>",
          to: [DEMO_INBOX],
          reply_to: email,
          subject: `Demo request — ${organization}`,
          text: [
            `Name: ${name}`,
            `Organization: ${organization}`,
            `Email: ${email}`,
            "",
            message || "(no message)",
          ].join("\n"),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[marketing/demo-request] Resend failed", errText);
        return NextResponse.json(
          { ok: false, error: "Could not send your request. Please try again or email us directly." },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[marketing/demo-request] unexpected error", err);
    return NextResponse.json({ ok: false, error: "Unexpected error." }, { status: 500 });
  }
}
