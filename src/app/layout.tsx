import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/context/theme'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Ellie Dashboard',
  description: 'Your AI receptionist command centre',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${inter.className}`}>
      <body className="h-full">
        {/* Anti-flash: set data-theme before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('ellie-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light')})()` }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
