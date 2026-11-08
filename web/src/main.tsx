import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/cormorant-garamond/600.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { registerServiceWorker } from './model/offline';

// Keeps the app shell so it still opens (with the start link) while the server is off.
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
