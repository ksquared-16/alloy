"use client";

import Section from "@/components/Section";
import GhlEmbed from "@/components/GhlEmbed";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function JoinPage() {
  const [ghlFormUrl, setGhlFormUrl] = useState<string>("");

  useEffect(() => {
    // Use window.location.origin to ensure staging stays on staging domain
    if (typeof window !== "undefined") {
      const redirectUrl = `${window.location.origin}/join-thank-you`;
      const formUrl = `https://api.leadconnectorhq.com/widget/form/S4ajOQFaanzumo8eyadC?redirectUrl=${encodeURIComponent(redirectUrl)}`;
      setGhlFormUrl(formUrl);
    }
  }, []);
  const benefits = [
    "Pick your own jobs and set your schedule",
    "We handle the busywork, so you can focus on what you're best at",
    "Get paid promptly",
    "Real humans behind Alloy, not a faceless platform",
  ];

  const expectations = [
    "Valid insurance and background check",
    "Professional, reliable service",
    "Responsive to job opportunities",
    "Commitment to quality work",
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-alloy-stone">
        <div className="mx-auto max-w-6xl px-4 md:px-8 py-6 md:py-10">
          <div className="relative min-h-[420px] md:h-[400px] lg:h-[460px] overflow-hidden rounded-xl shadow-lg">
            {/* Background Image */}
            <Image
              src="/hero/join_our_team_hero.jpeg"
              alt="Join our team"
              fill
              priority
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 90vw, 1152px"
            />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-alloy-midnight/60 via-alloy-midnight/25 to-transparent" />

            {/* Content Overlay */}
            <div className="relative z-10 flex min-h-[420px] md:h-full items-center py-8 md:py-0 px-4 md:px-10 lg:px-12">
              <div className="max-w-xl space-y-3 md:space-y-6 w-full">
                <h1 className="text-3xl md:text-5xl lg:text-5xl font-bold text-white leading-tight">
                  Join Our Team
                </h1>
                <p className="text-base md:text-lg text-white/90">
                  We help you get quality jobs. We handle the busywork, so you can focus on what you're best at.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <Section className="py-16 bg-white">
        <h2 className="text-3xl font-bold text-alloy-midnight mb-8 text-center">
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            {
              step: "1",
              title: "Apply",
              description:
                "Tell us about your experience. Simple application, no lengthy forms.",
            },
            {
              step: "2",
              title: "Get verified",
              description:
                "We verify your insurance, background, and credentials. Real humans review every application.",
            },
            {
              step: "3",
              title: "Accept jobs",
              description:
                "We text you when jobs match your schedule. You pick the ones that work for you.",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="w-16 h-16 bg-alloy-juniper text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-md">
                {item.step}
              </div>
              <h3 className="text-xl font-semibold text-alloy-midnight mb-2">
                {item.title}
              </h3>
              <p className="text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Benefits */}
      <Section className="py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto">
          <div>
            <h2 className="text-2xl font-bold text-alloy-midnight mb-6">
              Benefits
            </h2>
            <ul className="space-y-4">
              {benefits.map((benefit, i) => (
                <li key={i} className="flex items-start">
                  <span className="text-alloy-juniper mr-3 text-xl">✓</span>
                  <span className="text-gray-700">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-alloy-midnight mb-6">
              Expectations
            </h2>
            <ul className="space-y-4">
              {expectations.map((expectation, i) => (
                <li key={i} className="flex items-start">
                  <span className="text-alloy-blue mr-3 text-xl">•</span>
                  <span className="text-gray-700">{expectation}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Application Form */}
      <Section className="py-16 bg-white">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-alloy-midnight mb-4 text-center">
            Apply to work with Alloy
          </h2>
          <p className="text-center text-alloy-midnight/80 mb-8">
            Fill out the form below. We'll review your application and be in touch soon.
          </p>
          {ghlFormUrl && (
            <GhlEmbed
              src={ghlFormUrl}
              title="Subcontractor Onboarding"
              height={1845}
            />
          )}
        </div>
      </Section>
    </div>
  );
}

