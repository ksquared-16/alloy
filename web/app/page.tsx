"use client";

import Link from "next/link";
import Image from "next/image";
import Section from "@/components/Section";
import PrimaryButton from "@/components/PrimaryButton";
import SecondaryButton from "@/components/SecondaryButton";
import ServiceCard from "@/components/ServiceCard";
import Accordion from "@/components/Accordion";
import BrandValueCard from "@/components/BrandValueCard";
import { SERVICES } from "@/lib/services";
import GetQuoteButton from "@/components/GetQuoteButton";
import HeroSpecs from "@/components/HeroSpecs";
import { HeroPerimeterSpecs } from "@/components/HomeAmbient";
import FirstFreeCampaignHomeFlow from "@/components/offers/FirstFreeCampaignHomeFlow";

export default function Home() {
  const howItWorksSteps = [
    {
      number: "1",
      title: "Tell us what you need — nothing more",
      description: "Share your home size and schedule. No endless back-and-forth — just enough detail for us to handle the rest.",
    },
    {
      number: "2",
      title: "Coordinated by people, backed by tech",
      description: "Real humans review every job. Technology speeds things up — people make the call and keep things on track.",
    },
    {
      number: "3",
      title: "Confirmed by text. Covered by Alloy.",
      description: "We text the details. You confirm. And we stay involved — if something's not right, we make it right.",
    },
  ];

  const whyAlloyIsDifferent = [
    {
      title: "Trust First",
      description: "Every pro is vetted, insured, and background-checked. We stand behind every job. If something's not right, we fix it.",
      accentColor: "juniper" as const,
    },
    {
      title: "Dead-Simple",
      description: "No apps. No endless forms. No confusing booking systems. Tell us what you need, confirm by text, and you're done.",
      accentColor: "juniper" as const,
    },
    {
      title: "Human + Smart",
      description: "Real people who know Bend and care about getting it right, supported by technology that makes coordination faster and more reliable.",
      accentColor: "juniper" as const,
    },
    {
      title: "We don't sell your information",
      description: "Your information stays with us. We coordinate directly with a pro we know and trust. No lead blasting, no spam calls, no middleman chaos.",
      accentColor: "juniper" as const,
    },
  ];

  const testimonials = [
    {
      quote:
        "Alloy Services is a new local home services company, and I've been impressed with how thoughtfully they're approaching things from the start. They're clearly focused on quality, reliability, and creating a professional experience for homeowners.",
      name: "Sarah M.",
      relation: "Early supporter",
      location: null,
    },
    {
      quote:
        "What stood out to me about Alloy Services is how intentional they are about handling everything end-to-end — from customer intake to service execution and follow-up. It feels like a modern, well-run operation.",
      name: "James R.",
      relation: "Early supporter",
      location: null,
    },
    {
      quote:
        "Alloy Services is building something really solid. I appreciate their focus on clear communication, consistency, and supporting the people doing the work.",
      name: "Emily T.",
      relation: "Early supporter",
      location: null,
    },
  ];

  const faqs = [
    {
      question: "How does Alloy work?",
      answer:
        "You tell us what you need, we coordinate with a vetted local pro, and you confirm by text. No apps, no complicated booking. We handle the rest.",
    },
    {
      question: "Are the professionals insured?",
      answer:
        "Yes. Every pro is insured, background-checked, and verified before they can accept jobs. We stand behind every job.",
    },
    {
      question: "What areas do you serve?",
      answer:
        "We're focused on Bend, Oregon right now. We'll expand to surrounding areas as we grow.",
    },
    {
      question: "How do I pay?",
      answer:
        "We save your payment information during booking and only charge you at the completion of the service, once you've confirmed the work was completed.",
    },
    {
      question: "Do I need to be home during the cleaning?",
      answer:
        "No. We'll coordinate access with you beforehand. We're flexible to your preference.",
    },
    {
      question: "What if I'm not satisfied with the cleaning?",
      answer:
        "We make it right. If something isn't up to your standards, let us know within 24 hours and we'll send the pro back to fix it at no extra charge.",
    },
  ];

  return (
    <div className="relative z-10 flex w-full max-w-full flex-1 flex-col self-stretch">
        <FirstFreeCampaignHomeFlow />
        {/* Hero — floating card embedded in atmosphere (width aligned with navbar max-w-screen-xl) */}
        <section className="relative mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 pt-8 md:pt-12 pb-12 md:pb-16">
          {/* Layered motion behind and around hero */}
          <div className="home-hero-ambient-zone">
            <div className="home-hero-ambient-gradient" />
            <div className="home-hero-ambient-blur home-hero-ambient-blur-1" />
            <div className="home-hero-ambient-blur home-hero-ambient-blur-2" />
            <div className="home-hero-ambient-blur home-hero-ambient-blur-3" />
          </div>
          <HeroPerimeterSpecs />
          <div className="relative z-10 home-hero-float-wrapper">
          <div className="relative min-h-[480px] md:min-h-[460px] lg:min-h-[520px] overflow-hidden home-hero-float">
            <Image
              src="/hero/cleaning-hero.jpeg"
              alt="Clean modern home interior"
              fill
              priority
              className="object-cover object-[70%_50%]"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 90vw, 1152px"
            />

            {/* Lighter overlay — readable text without heavy slab */}
            <div
              className="absolute inset-0 z-0"
              style={{
                background:
                  "linear-gradient(108deg, rgba(24,39,58,0.72) 0%, rgba(24,39,58,0.48) 35%, rgba(24,39,58,0.18) 60%, transparent 80%)",
              }}
            />

            {/* Soft blue/pine glow behind content */}
            <div
              className="absolute inset-0 z-[1] public-glow-ambient public-glow-ambient-breathe"
              style={{
                background:
                  "radial-gradient(ellipse 60% 70% at 24% 50%, rgba(0,69,140,0.22) 0%, rgba(39,63,82,0.08) 45%, transparent 70%)",
              }}
            />

            <HeroSpecs />

            <div className="relative z-10 flex min-h-[480px] md:min-h-[460px] lg:min-h-[520px] items-start py-8 md:py-10 px-5 md:px-12 lg:px-14">
              <div className="max-w-xl space-y-4 md:space-y-5 w-full">
                <p className="text-xs md:text-sm font-semibold text-white/95 uppercase tracking-widest px-4 py-2 rounded-full inline-block border border-white/25 bg-white/10 backdrop-blur-sm shrink-0">
                  Born in Bend. Built for trust.
                </p>
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.12] tracking-tight [text-shadow:0_2px_20px_rgba(0,0,0,0.35)]">
                  Trusted home services, without the runaround.
                </h1>
                <p className="text-base md:text-lg text-white/92 leading-relaxed max-w-lg [text-shadow:0_1px_6px_rgba(0,0,0,0.25)]">
                  Alloy handles everything from scheduling, confirmation, and follow-up, using trusted local professionals in Bend. One point of contact. Real accountability.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 pt-4 pb-8 md:pb-10">
                  <GetQuoteButton className="home-hero-cta home-quote-cta-pine public-btn-primary !text-white !shadow-lg !py-4 !px-7">
                    Get a quote
                  </GetQuoteButton>
                  <Link href="#how-it-works">
                    <SecondaryButton className="home-hero-cta home-hero-cta-secondary !bg-white/15 !border-white/40 !text-white hover:!bg-white/25 hover:!border-white/50 w-full sm:w-auto !py-4 !px-7 transition-all duration-200">
                      See how Alloy works
                    </SecondaryButton>
                  </Link>
                </div>
              </div>
            </div>
          </div>
          </div>
        </section>

      {/* How Alloy Makes It Easy — stone section, Bend Pine accent */}
      <Section id="how-it-works" className="home-section-transition home-section-stone">
        <div className="home-section-atmosphere home-section-glow-how rounded-2xl md:rounded-3xl py-4 md:py-5 px-4 md:px-8 relative">
          <h2 className="home-heading text-2xl md:text-3xl text-center mb-4 md:mb-6">
            How Alloy Makes It Easy
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto">
            {howItWorksSteps.map((step) => (
              <div
                key={step.number}
                className="home-card home-card-lift text-center p-4 md:p-6"
              >
                <div className="w-12 h-12 md:w-14 md:h-14 bg-alloy-pine text-white rounded-2xl flex items-center justify-center text-lg md:text-xl font-bold mx-auto mb-3 md:mb-4 shadow-lg shadow-alloy-pine/20">
                  {step.number}
                </div>
                <h3 className="text-lg md:text-xl font-semibold text-alloy-pine mb-2">
                  {step.title}
                </h3>
                <p className="text-sm md:text-base text-alloy-midnight/80 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
          <div className="max-w-3xl mx-auto mt-4 md:mt-6 text-center">
            <div className="home-card p-4 md:p-6">
              <p className="text-base md:text-lg text-alloy-midnight font-medium leading-relaxed">
                Alloy provides home cleaning in Bend & Central Oregon, without the runaround. We handle scheduling, confirmation, and follow-up, and we stay involved from start to finish. Our goal is to keep the process simple, offer a first class experience, and ensure you always have one point of contact.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Services we offer — light section */}
      <Section className="home-section-transition home-section-light">
        <div className="home-section-atmosphere home-section-glow-services relative">
        <h2 className="home-heading text-2xl md:text-3xl text-center mb-1">
          Services we offer
        </h2>
        <p className="text-center text-sm md:text-base text-alloy-midnight/75 mb-4 md:mb-5">
          Home cleaning is available now. More services coming soon.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {SERVICES.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
        </div>
      </Section>

      {/* Why Alloy Is Different — alt tint, Bend Pine life */}
      <Section className="home-section-transition home-section-alt">
        <div className="home-section-atmosphere home-section-glow-why relative">
        <h2 className="home-heading text-2xl md:text-3xl text-center mb-4 md:mb-5">
          Why Alloy Is Different
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 max-w-5xl mx-auto">
          {whyAlloyIsDifferent.map((value) => (
            <BrandValueCard
              key={value.title}
              title={value.title}
              description={value.description}
              accentColor={value.accentColor}
              icon={
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
          ))}
        </div>
        </div>
      </Section>

      {/* Testimonials — stone again for rhythm */}
      <Section className="home-section-transition home-section-stone">
        <div className="home-section-atmosphere home-section-glow-testimonials max-w-6xl mx-auto relative">
          <h2 className="home-heading text-2xl md:text-3xl text-center mb-1">
            What people are saying about Alloy
          </h2>
          <p className="text-sm md:text-base text-alloy-midnight/70 text-center mb-4 md:mb-5">
            Early supporters — customer reviews coming soon.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mb-4 md:mb-6">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="home-card home-card-lift rounded-2xl p-4 md:p-5"
              >
                <div className="flex gap-0.5 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className="w-4 h-4 text-alloy-juniper"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm md:text-base text-alloy-midnight/80 mb-4 leading-relaxed">
                  &quot;{testimonial.quote}&quot;
                </p>
                <div className="pt-4 border-t border-alloy-stone/30">
                  <p className="text-sm md:text-base font-semibold text-alloy-pine">
                    — {testimonial.name}
                  </p>
                  <p className="text-xs md:text-sm text-alloy-midnight/60 mt-1">
                    {testimonial.relation}
                    {testimonial.location && ` • ${testimonial.location}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center">
            <GetQuoteButton className="home-quote-cta-pine public-btn-primary w-full sm:w-auto !text-white">
              Get a quote
            </GetQuoteButton>
            <p className="text-sm text-alloy-midnight/60 mt-4">
              Had a great experience?{" "}
              <a
                href="https://www.google.com/search?sca_esv=7670df6d756a93b6&sxsrf=AE3TifNkBI028mC6V8lu01Pi7_VO0zSISw:1767651952450&si=AMgyJEtREmoPL4P1I5IDCfuA8gybfVI2d5Uj7QMwYCZHKDZ-E1vaBZPzHkn18HCW9v8UVy2cjwvDEtsPTjI29B5Ok2Wd7GZcsLRus5HtywFRGe9rcAgM3BMkhEoX69tYnzEXHihFmtQ-&q=Alloy+Services+Reviews&sa=X&ved=2ahUKEwjxmNnVuPWRAxU8JDQIHRExOEIQ0bkNegQILxAD#lrd=0x12915f0438ac783:0x94b6c943526afd86,3,,,,"
                target="_blank"
                rel="noopener noreferrer"
                className="text-alloy-juniper hover:text-alloy-pine underline transition-colors"
              >
                Leave us a Google review
              </a>
            </p>
          </div>
        </div>
      </Section>

      {/* FAQ — light */}
      <Section className="home-section-transition home-section-light">
        <div className="home-section-atmosphere home-section-glow-faq relative">
        <h2 className="home-heading text-2xl md:text-3xl text-center mb-4 md:mb-5">
          Frequently Asked Questions
        </h2>
        <div className="max-w-3xl mx-auto">
          {faqs.map((faq) => (
            <Accordion key={faq.question} title={faq.question}>
              <p>{faq.answer}</p>
            </Accordion>
          ))}
        </div>
        </div>
      </Section>

      {/* Final CTA — premium conversion block */}
      <Section className="py-4 md:py-5 lg:py-6">
        <div className="home-section-atmosphere home-section-glow-cta">
        <div className="home-cta-block p-5 md:p-6 lg:p-8 text-center relative">
          <h2 className="home-heading-inverse text-2xl md:text-3xl lg:text-4xl font-bold mb-2 md:mb-3">
            Ready to get started?
          </h2>
          <p className="text-base md:text-lg text-white/90 mb-4 md:mb-5 max-w-xl mx-auto">
            Select a service to get a quote.
          </p>
          <div className="flex justify-center">
            <GetQuoteButton className="home-quote-cta-pine public-btn-primary !text-white !shadow-lg hover:!shadow-xl !px-8 !py-3.5 !text-base">
              Get a Quote
            </GetQuoteButton>
          </div>
        </div>
        </div>
      </Section>
    </div>
  );
}
