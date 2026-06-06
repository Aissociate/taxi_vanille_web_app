import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PorscheDesignSystemProvider } from '@porsche-design-system/components-react';
import App from './App';
import { initNative } from './lib/native';
import './index.css';

initNative();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PorscheDesignSystemProvider theme="light">
      <App />
    </PorscheDesignSystemProvider>
  </StrictMode>
);
