import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { withErrorOverlay } from './components/with-error-overlay'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from './config/wagmi'

const AppWithErrorOverlay = withErrorOverlay(App)
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AppWithErrorOverlay />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
