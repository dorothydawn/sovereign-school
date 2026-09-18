import type { ReactNode } from 'react'
import './globals.css'
import courseConfig from '../../course.config'

export const metadata = {
  title: courseConfig.site.name,
  description: courseConfig.site.tagline,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
