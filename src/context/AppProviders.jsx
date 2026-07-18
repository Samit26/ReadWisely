import { ToastProvider } from './ToastContext.jsx'
import { SettingsProvider } from './SettingsContext.jsx'
import { LibraryProvider } from './LibraryContext.jsx'

// ToastProvider is outermost so Library/Settings can surface errors through it.
export function AppProviders({ children }) {
  return (
    <ToastProvider>
      <SettingsProvider>
        <LibraryProvider>{children}</LibraryProvider>
      </SettingsProvider>
    </ToastProvider>
  )
}
