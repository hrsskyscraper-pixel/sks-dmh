'use client'

import { createContext, useContext } from 'react'

const NotificationCountContext = createContext(0)

export function NotificationCountProvider({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <NotificationCountContext.Provider value={count}>
      {children}
    </NotificationCountContext.Provider>
  )
}

export function useNotificationCount() {
  return useContext(NotificationCountContext)
}
