"use client";

import { FormEvent, useState } from "react";
import CTAButton from "@/components/marketing/CTAButton";
import SectionShell from "@/components/marketing/SectionShell";

type FormState = "idle" | "submitting" | "success" | "error";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormState("submitting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/marketing/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, organization, email, message }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setFormState("error");
        setErrorMessage(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setFormState("success");
      setName("");
      setOrganization("");
      setEmail("");
      setMessage("");
    } catch {
      setFormState("error");
      setErrorMessage("Could not send your request. Please email hello@workwithalloy.com directly.");
    }
  };

  const inputClass =
    "w-full rounded-xl border border-alloy-midnight-forge/12 bg-white px-4 py-3.5 text-[0.9375rem] text-alloy-midnight-forge placeholder:text-alloy-midnight-forge/35 focus:border-alloy-bend-pine focus:outline-none focus:ring-2 focus:ring-alloy-bend-pine/15";

  return (
    <>
      <SectionShell density="compact" className="!pt-10 md:!pt-14" innerClassName="max-w-lg">
        <p className="marketing-eyebrow">Contact</p>
        <h1 className="marketing-page-headline mt-3">Request a Demo</h1>
        <p className="marketing-body-lg mt-4">
          Tell us about your organization. We will schedule a walkthrough of how Alloy moves work
          forward.
        </p>

        {formState === "success" ? (
          <div
            className="mt-8 rounded-2xl border border-alloy-bend-pine/20 bg-alloy-bend-pine/[0.04] px-6 py-7"
            role="status"
          >
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-alloy-midnight-forge">
              Thank you — we received your request.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-alloy-midnight-forge/65">
              Our team will be in touch shortly at the email you provided.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {formState === "error" && errorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800">
                {errorMessage}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-[0.8125rem] font-medium text-alloy-midnight-forge/70"
              >
                Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                autoComplete="name"
              />
            </div>

            <div>
              <label
                htmlFor="organization"
                className="mb-1.5 block text-[0.8125rem] font-medium text-alloy-midnight-forge/70"
              >
                Organization
              </label>
              <input
                id="organization"
                type="text"
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className={inputClass}
                autoComplete="organization"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[0.8125rem] font-medium text-alloy-midnight-forge/70"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="message"
                className="mb-1.5 block text-[0.8125rem] font-medium text-alloy-midnight-forge/70"
              >
                Message
              </label>
              <textarea
                id="message"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`${inputClass} min-h-[112px] resize-y`}
                placeholder="Tell us about your operations, current tools, or what you are looking for."
              />
            </div>

            <div className="pt-0.5">
              <CTAButton type="submit" disabled={formState === "submitting"} className="w-full sm:w-auto">
                {formState === "submitting" ? "Sending…" : "Request a Demo"}
              </CTAButton>
            </div>
          </form>
        )}

        <p className="mt-8 text-sm text-alloy-midnight-forge/45">
          Prefer email?{" "}
          <a
            href="mailto:hello@workwithalloy.com"
            className="font-semibold text-alloy-bend-pine hover:underline"
          >
            hello@workwithalloy.com
          </a>
        </p>
      </SectionShell>
    </>
  );
}
