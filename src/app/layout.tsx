import type { Metadata } from 'next'
import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display' })
const body    = Instrument_Sans({ subsets: ['latin'], variable: '--font-body' })
const mono    = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Ellie Dashboard',
  description: 'Your AI receptionist command centre',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="h-full">{children}</body>
    </html>
  )
}
