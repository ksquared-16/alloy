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
    "w-full rounded-lg border border-alloy-forge/15 bg-white px-4 py-3 text-sm text-alloy-forge placeholder:text-alloy-forge/40 focus:border-alloy-juniper focus:outline-none focus:ring-2 focus:ring-alloy-juniper/20";

  return (
    <>
      <SectionShell className="!pt-12 md:!pt-16" innerClassName="max-w-xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-alloy-juniper">Contact</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-alloy-forge md:text-5xl">
          Request a Demo
        </h1>
        <p className="mt-6 text-lg text-alloy-forge/70">
          Tell us about your organization and we will reach out to schedule a walkthrough of Alloy.
        </p>

        {formState === "success" ? (
          <div
            className="mt-10 rounded-xl border border-alloy-juniper/25 bg-alloy-juniper/5 px-6 py-8"
            role="status"
          >
            <h2 className="text-lg font-semibold text-alloy-forge">Thank you — we received your request.</h2>
            <p className="mt-2 text-sm text-alloy-forge/70">
              Our team will be in touch shortly at the email you provided.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            {formState === "error" && errorMessage ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {errorMessage}
              </div>
            ) : null}

            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-alloy-forge/80">
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
                className="mb-1.5 block text-sm font-medium text-alloy-forge/80"
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
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-alloy-forge/80">
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
              <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-alloy-forge/80">
                Message
              </label>
              <textarea
                id="message"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`${inputClass} resize-y min-h-[120px]`}
                placeholder="Tell us about your centers, current tools, or what you are looking for."
              />
            </div>

            <CTAButton type="submit" disabled={formState === "submitting"} className="w-full sm:w-auto">
              {formState === "submitting" ? "Sending…" : "Request a Demo"}
            </CTAButton>
          </form>
        )}

        <p className="mt-8 text-sm text-alloy-forge/50">
          Prefer email?{" "}
          <a href="mailto:hello@workwithalloy.com" className="text-alloy-juniper hover:underline">
            hello@workwithalloy.com
          </a>
        </p>
      </SectionShell>
    </>
  );
}
