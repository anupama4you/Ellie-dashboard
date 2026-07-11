import Link from 'next/link'
import Image from 'next/image'

export const metadata = { title: 'Terms of Service — Ellie' }

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen" style={{ background: '#F6F4EE' }}>
      <div className="max-w-[720px] mx-auto px-6 py-12">
        <Link href="/login" className="inline-flex items-center gap-2 mb-10">
          <Image src="/favicon.png" alt="Ellie" width={32} height={32} className="rounded-lg" />
          <span className="font-extrabold text-lg" style={{ color: '#211A31' }}>Ellie</span>
        </Link>

        <h1 className="text-2xl font-extrabold mb-1" style={{ color: '#211A31' }}>Terms of Service</h1>
        <p className="text-sm mb-10" style={{ color: '#8B85A0' }}>Last updated: 10 July 2026</p>

        <div className="flex flex-col gap-6 text-sm leading-relaxed" style={{ color: '#5C5570' }}>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern access to and use of Ellie, an AI
            receptionist service operated by Anupama Dilshan Withanage, a sole trader based
            in South Australia, Australia (ABN 11 685 248 475) (&quot;Ellie&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
            By creating an account or using Ellie, you agree to these Terms.
          </p>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>1. The service</h2>
            <p>
              Ellie provides an AI voice assistant that answers phone calls on behalf of a
              business, handles enquiries, and can book, reschedule or transfer appointments,
              alongside a web dashboard for managing the business&apos;s information and reviewing
              call activity.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>2. Accounts</h2>
            <p>
              You must provide accurate information when setting up your account and keep
              your login credentials secure. You&apos;re responsible for all activity that occurs
              under your account. Accounts are currently created and managed by our team on
              your behalf.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>3. Your responsibilities</h2>
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>Ensure the business information you provide (hours, services, pricing, policies) is accurate — Ellie only knows what you tell her</li>
              <li>Ensure your callers are notified, where required by law, that calls may be recorded and processed by an AI system — this is your responsibility as the business answering the call, not ours</li>
              <li>Use Ellie only for lawful business purposes</li>
              <li>Not attempt to interfere with, reverse-engineer, or disrupt the service</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>4. Plans and billing</h2>
            <p>
              Plans, pricing, and billing are arranged directly between you and us outside
              this application. In-app usage figures (e.g. calls used this month) are shown
              for your visibility only — using more than your plan&apos;s typical allowance will
              never cause Ellie to stop answering calls; we&apos;ll simply be in touch about
              adjusting your plan.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>5. Third-party services</h2>
            <p>
              Ellie is built on top of third-party providers, including Vapi (voice AI),
              Twilio (telephony/SMS), Google (Calendar, if you connect it), and Supabase
              (hosting). Your use of features depending on these providers is also subject to
              their own terms, and we aren&apos;t responsible for outages or issues originating
              from them.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>6. AI limitations</h2>
            <p>
              Ellie is an AI system and, like any AI, can occasionally misunderstand a caller,
              mishear details, or make a mistake. We work to make Ellie as accurate and
              reliable as possible, but we don&apos;t guarantee every call will be handled
              perfectly, and you remain responsible for reviewing bookings and following up
              with customers where needed.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>7. Data and privacy</h2>
            <p>
              Our collection and use of information is described in our{' '}
              <Link href="/privacy" className="underline" style={{ color: '#6D4AFF' }}>Privacy Policy</Link>,
              which forms part of these Terms.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>8. Intellectual property</h2>
            <p>
              We retain all rights in the Ellie platform, software, and branding. You retain
              ownership of your own business information and data.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>9. Availability and disclaimers</h2>
            <p>
              We aim to keep Ellie available and reliable but don&apos;t guarantee uninterrupted
              service. Ellie is provided &quot;as is&quot; without warranties of any kind, to the
              maximum extent permitted by law, including the Australian Consumer Law where
              applicable.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>10. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, we are not liable for indirect,
              incidental, or consequential loss arising from your use of Ellie, including
              lost bookings, lost revenue, or missed calls, except where such liability
              cannot be excluded under the Australian Consumer Law.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>11. Termination</h2>
            <p>
              Either party may end the arrangement at any time by mutual agreement or as set
              out in your specific plan arrangement. We may suspend or terminate access if
              these Terms are breached.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>12. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be reflected
              by updating the date at the top of this page.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>13. Governing law</h2>
            <p>
              These Terms are governed by the laws of South Australia, Australia, and the
              parties submit to the non-exclusive jurisdiction of its courts.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>14. Contact us</h2>
            <p>
              Anupama Dilshan Withanage, ABN 11 685 248 475, South Australia, Australia.
            </p>
          </section>

          <p className="text-xs italic pt-4" style={{ color: '#8B85A0' }}>
            These Terms are provided for general information and do not constitute legal
            advice. We recommend having them reviewed by a qualified professional before
            relying on them for real customer agreements.
          </p>
        </div>
      </div>
    </div>
  )
}
