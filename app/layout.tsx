import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import NavBar from './NavBar'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Sandav Internet System',
  description: 'Client management for Sandav Internet',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-gray-50 min-h-screen`}>
        <NavBar />
        <main className="max-w-5xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  )
}
