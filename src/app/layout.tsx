import type { Metadata } from 'next'
import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import './globals.css'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display' })
const body    = Instrument_Sans({ subsets: ['latin'], variable: '--font-body' })
const mono    = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Ellie Dashboard',
  description: 'Your AI receptionist command centre',
  icons: {
    icon: '/favicon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="h-full">
        <NextTopLoader color="#6D4AFF" height={3} showSpinner={false} shadow="0 0 10px #6D4AFF,0 0 5px #6D4AFF" />
        {children}
      </body>
    </html>
  )
}
