import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerServiceWorker } from './utils/push'

// 웹푸시 수신용 서비스워커 (캐시 없음 — public/sw.js)
registerServiceWorker()

// 안드로이드 PWA 설치 프롬프트 보관 (InstallCard에서 사용)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__deferredInstallPrompt = e
  window.dispatchEvent(new Event('install:prompt-ready'))
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
