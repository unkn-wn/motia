import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Home from './home.tsx'
import { AuthProvider } from '@/contexts/FirebaseAuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Home />
    </AuthProvider>
  </StrictMode>,
)
