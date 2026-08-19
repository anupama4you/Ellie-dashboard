'use client'

import { createContext, useContext, useState } from 'react'

type NavigationBlockerContextType = {
  isBlocked: boolean
  setIsBlocked: (isBlocked: boolean) => void
}

const NavigationBlockerContext = createContext<NavigationBlockerContextType>({
  isBlocked: false,
  setIsBlocked: () => {},
})

/** Wraps the dashboard shell so any page can flag unsaved changes and any nav link (see BlockableLink) can respect it. */
export function NavigationBlockerProvider({ children }: { children: React.ReactNode }) {
  const [isBlocked, setIsBlocked] = useState(false)
  return (
    <NavigationBlockerContext.Provider value={{ isBlocked, setIsBlocked }}>
      {children}
    </NavigationBlockerContext.Provider>
  )
}

export function useNavigationBlocker() {
  return useContext(NavigationBlockerContext)
}
