import Link from 'next/link'
import Image from 'next/image'

export const metadata = { title: 'Privacy Policy — Ellie' }

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen" style={{ background: '#F6F4EE' }}>
      <div className="max-w-[720px] mx-auto px-6 py-12">
        <Link href="/login" className="inline-flex items-center gap-2 mb-10">
          <Image src="/favicon.png" alt="Ellie" width={32} height={32} className="rounded-lg" />
          <span className="font-extrabold text-lg" style={{ color: '#211A31' }}>Ellie</span>
        </Link>

        <h1 className="text-2xl font-extrabold mb-1" style={{ color: '#211A31' }}>Privacy Policy</h1>
        <p className="text-sm mb-10" style={{ color: '#8B85A0' }}>Last updated: 10 July 2026</p>

        <div className="flex flex-col gap-6 text-sm leading-relaxed" style={{ color: '#5C5570' }}>
          <p>
            Ellie (&quot;Ellie&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is an AI receptionist service operated by
            Anupama Dilshan Withanage, a sole trader based in South Australia, Australia
            (ABN 11 685 248 475). This policy explains what information we collect, how we
            use it, and the choices you have — both if you&apos;re a business using Ellie
            (&quot;account holder&quot;, &quot;you&quot;) and if you&apos;re someone calling a business that uses
            Ellie (&quot;caller&quot;).
          </p>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>1. What Ellie does</h2>
            <p>
              Ellie answers phone calls on behalf of a business, using AI voice technology to
              handle enquiries and book, reschedule or transfer appointments. Account holders
              configure Ellie&apos;s behaviour (business hours, services, FAQs) through a web
              dashboard. Ellie then answers real calls from that business&apos;s own customers.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>2. Information we collect</h2>
            <p className="font-semibold mt-2" style={{ color: '#211A31' }}>From account holders (businesses using Ellie):</p>
            <ul className="list-disc pl-5 mt-1 flex flex-col gap-1">
              <li>Name, email address, and login credentials</li>
              <li>Business details you provide (business name, description, address, hours, services, pricing, FAQs)</li>
              <li>Phone numbers used to route calls and send SMS</li>
              <li>If connected, Google Calendar access tokens (stored encrypted) used to check availability and create events</li>
            </ul>
            <p className="font-semibold mt-3" style={{ color: '#211A31' }}>From callers (a business&apos;s own customers, calling Ellie):</p>
            <ul className="list-disc pl-5 mt-1 flex flex-col gap-1">
              <li>Phone number, and name if given during the call</li>
              <li>Call audio recordings and text transcripts</li>
              <li>Anything volunteered during the call needed to complete a booking — service requested, appointment time, and any notes the caller shares (e.g. a preference or accessibility need)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>3. Important notice about call recording</h2>
            <p>
              Calls answered by Ellie are recorded and transcribed so the business can review
              them and so Ellie can function. Recording phone calls has legal consent
              requirements that vary by Australian state and territory. <strong>It is the
              account holder&apos;s (business&apos;s) responsibility</strong> to ensure callers are
              properly notified that calls may be recorded, in line with applicable law —
              not Ellie&apos;s.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>4. How we use information</h2>
            <p>We use the information above to:</p>
            <ul className="list-disc pl-5 mt-1 flex flex-col gap-1">
              <li>Operate the AI receptionist — answering calls, checking availability, and booking, rescheduling or transferring appointments</li>
              <li>Send booking confirmations and updates by SMS</li>
              <li>Show account holders their own call history, recordings, transcripts, appointments, and usage analytics</li>
              <li>Maintain and improve the reliability of the service</li>
              <li>Meet our own legal and accounting obligations</li>
            </ul>
            <p className="mt-2">We do not sell personal information to third parties.</p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>5. Third-party service providers</h2>
            <p>We rely on the following providers to deliver Ellie. Each processes data on our behalf under their own terms:</p>
            <ul className="list-disc pl-5 mt-1 flex flex-col gap-1">
              <li><strong>Vapi</strong> — voice AI platform that answers calls, generates recordings, transcripts and call summaries</li>
              <li><strong>Twilio</strong> — telephony and SMS delivery</li>
              <li><strong>Google</strong> — Calendar access (only if an account holder chooses to connect it), used to check real-time availability and create events</li>
              <li><strong>Supabase</strong> — database hosting and account authentication</li>
            </ul>
            <p className="mt-2">
              These providers may store or process data outside Australia. By using Ellie,
              you acknowledge information may be transferred internationally as a result.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>6. Data security</h2>
            <p>
              We take reasonable technical measures to protect information, including
              encrypting stored Google access tokens. No method of electronic storage or
              transmission is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>7. Data retention</h2>
            <p>
              We retain account and call data for as long as an account remains active, plus
              a reasonable period afterwards for legal, accounting, or dispute-resolution
              purposes. Call recordings and transcripts are also subject to the retention
              policies of our voice AI provider, Vapi.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>8. Your rights</h2>
            <p>
              Under the Australian Privacy Principles, you may request access to, correction
              of, or deletion of personal information we hold about you, subject to legal
              exceptions. Contact us using the details below to make a request.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>9. Cookies</h2>
            <p>
              The Ellie dashboard uses essential cookies to keep account holders signed in
              securely. We don&apos;t use advertising or third-party tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>10. Children&apos;s privacy</h2>
            <p>
              Ellie is a business tool and isn&apos;t directed at children. We don&apos;t knowingly
              collect personal information from children beyond what an adult caller may
              incidentally mention during a call.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>11. Changes to this policy</h2>
            <p>
              We may update this policy from time to time. Material changes will be reflected
              by updating the date at the top of this page.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-base mb-2" style={{ color: '#211A31' }}>12. Contact us</h2>
            <p>
              For privacy questions or requests, contact: Anupama Dilshan Withanage, ABN 11 685 248 475, South Australia, Australia.
            </p>
          </section>

          <p className="text-xs italic pt-4" style={{ color: '#8B85A0' }}>
            This policy is provided for general information and does not constitute legal
            advice. If you rely on Ellie to handle real customer calls, we recommend having
            this policy reviewed by a qualified professional to confirm it meets your
            obligations under the Privacy Act 1988 (Cth) and any state-based call-recording
            laws that apply to your business.
          </p>
        </div>
      </div>
    </div>
  )
}
