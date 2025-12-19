"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Section from "@/components/Section";
import PrimaryButton from "@/components/PrimaryButton";
import Accordion from "@/components/Accordion";
import CleaningQuoteForm from "@/components/cleaning/CleaningQuoteForm";

export default function CleaningPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const cleaningOptions = [
    {
      type: "Standard Cleaning (+ Recurring Options)",
      description:
        "Regular maintenance cleaning to keep your home fresh and tidy.",
    },
    {
      type: "Deep",
      description:
        "Thorough cleaning including baseboards, inside appliances, and detailed scrubbing.",
    },
    {
      type: "Move-out",
      description:
        "Comprehensive cleaning to prepare your home for the next residents.",
    },
  ];

  const frequencies = [
    { label: "One-time", description: "Perfect for special occasions or trying us out.", discount: null },
    { label: "Weekly", description: "Keep your home consistently clean every week.", discount: "15% Off" },
    { label: "Bi-Weekly", description: "Every other week for regular maintenance.", discount: "10% Off" },
    { label: "Monthly", description: "Monthly clean to keep things fresh.", discount: "5% Off" },
  ];

  const whatsIncluded = {
    kitchen: [
      "Clean and sanitize countertops",
      "Wipe down appliances",
      "Clean inside microwave",
      "Sweep and mop floors",
      "Take out trash",
    ],
    bathrooms: [
      "Clean and sanitize toilets",
      "Scrub showers and tubs",
      "Clean mirrors and fixtures",
      "Wipe down surfaces",
      "Sweep and mop floors",
    ],
    living: [
      "Dust all surfaces",
      "Vacuum carpets and rugs",
      "Mop hard floors",
      "Clean windowsills",
      "Organize and tidy",
    ],
    bedrooms: [
      "Make beds",
      "Dust furniture",
      "Vacuum floors",
      "Empty trash",
      "Tidy surfaces",
    ],
  };

  const cleaningFaqs = [
    {
      question: "What's included in a standard cleaning?",
      answer:
        "Standard cleaning covers the basics: dusting, vacuuming, mopping, bathroom and kitchen cleaning, making beds, and taking out trash. See the 'What's Included' section above for the full list.",
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
    {
      question: "How do I pay?",
      answer:
        "We save your payment information during booking and only charge you at the completion of the service, once you've confirmed the work was completed.",
    },
    {
      question: "Are cleaning supplies included?",
      answer:
        "Yes. Pros bring all necessary supplies and equipment. You don't need to provide anything unless you have specific product preferences.",
    },
  ];

  const handleToggle = () => {
    if (!isOpen) {
      setIsOpen(true);
      setHasRendered(true);
      // Smooth scroll to form after a brief delay
      setTimeout(() => {
        formRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    } else {
      setIsOpen(false);
      // Smooth scroll back to hero
      setTimeout(() => {
        heroRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    }
  };

  const scrollToQuoteForm = () => {
    if (!isOpen) {
      setIsOpen(true);
      setHasRendered(true);
    }
    setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  };

  // Reusable CTA component for sections
  const GetQuoteCTA = () => (
    <div className="flex justify-center mt-8">
      <button onClick={scrollToQuoteForm} className="w-full md:w-auto">
        <PrimaryButton className="w-full md:w-auto">Get a Quote</PrimaryButton>
      </button>
    </div>
  );

  // Handle hash-based expansion and ?open=1 param from CTA
  useEffect(() => {
    const checkHash = () => {
      if (isOpen) return;

      const { hash, search } = window.location;
      const params = new URLSearchParams(search);
      const shouldOpen =
        hash === "#quote-form" || params.get("open") === "1";

      if (!shouldOpen) return;

      setIsOpen(true);
      setHasRendered(true);
      setTimeout(() => {
        formRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 100);
    };

    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, [isOpen]);

  return (
    <div>
      {/* Hero */}
      <Section ref={heroRef} className="py-10 md:py-14">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-alloy-midnight mb-4">
            Home Cleaning You Can Actually Rely On
          </h1>
          <p className="text-lg text-alloy-midnight/80 mb-6">
            Alloy provides home cleaning in Bend & Central Oregon, without the runaround. We handle scheduling, confirmation, and follow-up, and we stay involved from start to finish. Our goal is to keep the process simple, offer a first class experience, and ensure you always have one point of contact.
          </p>
          <div className="flex justify-center">
            <button
              onClick={handleToggle}
              aria-expanded={isOpen}
              aria-controls="quote-form-content"
              aria-label={isOpen ? "Hide form" : "Get a quote"}
              className="w-full md:w-auto"
            >
              <PrimaryButton className="w-full md:w-auto">
                {isOpen ? "Hide form" : "Get a quote"}
              </PrimaryButton>
            </button>
          </div>
        </div>
      </Section>

      {/* Quote Form (custom Alloy form, replaces embedded GHL form) */}
      {isOpen && (
        <Section id="quote-form" ref={formRef} className="pt-6 pb-0 bg-white">
          <div className="max-w-2xl md:max-w-4xl mx-auto">
            <div className="rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm bg-white">
              <div className="flex items-center justify-between p-4 md:p-6 border-b border-alloy-stone/20">
                <h2 className="text-xl font-bold text-alloy-midnight">
                  Get a quote
                </h2>
                <button
                  onClick={handleToggle}
                  className="text-sm text-alloy-juniper hover:text-alloy-juniper/80 font-medium transition-colors"
                  aria-label="Hide form"
                  aria-expanded="true"
                  aria-controls="quote-form-content"
                >
                  Hide form
                </button>
              </div>
              <div id="quote-form-content" className="p-4 md:p-6">
                {hasRendered && <CleaningQuoteForm />}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* What Makes Alloy Different */}
      <Section className="py-12 md:py-16">
        <h2 className="text-3xl font-bold text-alloy-midnight mb-8 text-center">
          What Makes Alloy Different
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {[
            {
              title: "We don't sell your information",
              description:
                "Your information stays with us. We coordinate directly with a pro we know and trust. No lead blasting, no spam calls, no middleman chaos.",
            },
            {
              title: "We stay involved",
              description:
                "Alloy doesn't disappear after booking. We coordinate scheduling, handle communication, and make sure everything goes smoothly. If something's not right, we fix it.",
            },
            {
              title: "Fair pricing, transparent costs",
              description:
                "You pay fair prices. Pros get fair pay. No hidden fees, no surprise charges. We're transparent about costs because trust requires honesty.",
            },
            {
              title: "Local pros, backed by Alloy",
              description:
                "Every cleaner is local to Bend, vetted, insured, and background-checked. We know them personally. When you book through Alloy, you're covered by Alloy.",
            },
          ].map((point) => (
            <div
              key={point.title}
              className="bg-white rounded-lg p-6 border border-gray-200"
            >
              <h3 className="text-xl font-semibold text-alloy-blue mb-2">
                {point.title}
              </h3>
              <p className="text-gray-600">{point.description}</p>
            </div>
          ))}
        </div>
        <GetQuoteCTA />
      </Section>

      {/* Cleaning Options */}
      <Section className="py-16 bg-white">
        <h2 className="text-3xl font-bold text-alloy-midnight mb-8 text-center">
          Cleaning Options
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {cleaningOptions.map((option) => {
            const isMoveOut = option.type === "Move-out";
            const content = (
              <div className="bg-alloy-stone rounded-lg p-6 border border-gray-200">
                <h3 className="text-xl font-semibold text-alloy-midnight mb-2">
                  {option.type} Cleaning
                </h3>
                <p className="text-gray-600">{option.description}</p>
              </div>
            );
            return isMoveOut ? (
              <Link key={option.type} href="/services/cleaning/move-out">
                {content}
              </Link>
            ) : (
              <div key={option.type}>{content}</div>
            );
          })}
        </div>

        <h3 className="text-2xl font-bold text-alloy-midnight mb-6 text-center">
          Cleaning Frequencies
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {frequencies.map((freq) => (
            <div
              key={freq.label}
              className="bg-white rounded-lg p-4 border border-gray-200 text-center"
            >
              <h4 className="font-semibold text-alloy-blue mb-1">
                {freq.label}
                {freq.discount && (
                  <span className="block text-xs text-alloy-juniper font-normal mt-0.5">
                    ({freq.discount})
                  </span>
                )}
              </h4>
              <p className="text-sm text-gray-600">{freq.description}</p>
            </div>
          ))}
        </div>
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-alloy-midnight/80">
            Recurring service discounts: Weekly and bi-weekly cleanings qualify for preferred pricing. The more consistent your schedule, the better the rate. Monthly cleanings are priced individually based on your home size.
          </p>
        </div>
        <GetQuoteCTA />
      </Section>

      {/* What's Included - 2 Column Comparison */}
      <Section className="py-16">
        <h2 className="text-3xl font-bold text-alloy-midnight mb-8 text-center">
          What's Included
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Standard Cleaning */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-xl font-semibold text-alloy-midnight mb-4">
              Standard Cleaning
            </h3>
            <ul className="space-y-2.5">
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Clean and sanitize all countertops and surfaces</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Wipe down appliances (exterior)</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Clean inside microwave</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Sweep and mop all floors</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Vacuum carpets and rugs</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Clean and sanitize toilets</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Scrub showers and tubs</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Clean mirrors and fixtures</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Dust all surfaces and furniture</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Make beds</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Empty trash and replace liners</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Clean windowsills</span>
              </li>
            </ul>
          </div>

          {/* Deep Clean */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-xl font-semibold text-alloy-midnight mb-4">
              Deep Clean (Top-To-Bottom Deluxe)
            </h3>
            <ul className="space-y-2.5">
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Everything in Standard Cleaning, plus:</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Clean inside oven and refrigerator</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Deep scrub baseboards and trim</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Clean inside cabinets (exterior and interior)</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Wash windows (interior)</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Clean blinds and window tracks</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Deep clean light fixtures and ceiling fans</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Detailed scrubbing of grout and tile</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Clean behind and under furniture</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Wipe down doors and door frames</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Clean vents and air registers</span>
              </li>
              <li className="text-sm text-gray-700 flex items-start">
                <span className="text-alloy-juniper mr-2 mt-0.5">•</span>
                <span>Detailed dusting of high and low areas</span>
              </li>
            </ul>
          </div>
        </div>
        <GetQuoteCTA />
      </Section>

      {/* FAQ */}
      <Section className="py-16 bg-white">
        <h2 className="text-3xl font-bold text-alloy-midnight mb-8 text-center">
          Frequently Asked Questions
        </h2>
        <div className="max-w-3xl mx-auto">
          {cleaningFaqs.map((faq) => (
            <Accordion key={faq.question} title={faq.question}>
              <p>{faq.answer}</p>
            </Accordion>
          ))}
        </div>
        <GetQuoteCTA />
      </Section>

      {/* Secondary CTA */}
      <Section className="py-16">
        <div className="bg-alloy-pine rounded-lg p-8 md:p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-lg mb-6 opacity-90">
            Submit your quote request above. We'll text you shortly to confirm details.
          </p>
          <div className="flex justify-center">
            <button
              onClick={() => {
                if (!isOpen) {
                  handleToggle();
                } else {
                  formRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }
              }}
            >
              <PrimaryButton className="bg-white text-alloy-midnight hover:bg-alloy-stone hover:text-alloy-midnight">
                Start my quote
              </PrimaryButton>
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}

