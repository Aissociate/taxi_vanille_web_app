import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initOTA } from './lib/ota';

window.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  console.warn('Unhandled promise rejection suppressed:', e.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Verifie et telecharge une mise a jour a distance (uniquement en app native).
initOTA();

// PWA : enregistre le service worker (rend l'app installable + ouverture
// hors-ligne). Silencieux si non supporte ou refuse.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
