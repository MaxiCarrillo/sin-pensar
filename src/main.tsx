import { ConfigProvider } from 'antd'
import esES from 'antd/locale/es_ES'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'

import { appTheme } from '@/core/theme/theme'

import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={esES} theme={appTheme} drawer={{ mask: { blur: true } }}>
      <Toaster position="top-center" richColors />
      <App />
    </ConfigProvider>
  </StrictMode>,
)
