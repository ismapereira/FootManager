import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/i18n';
import '@/styles/globals.css';
import { App } from '@/app/App';

/**
 * Ponto de entrada do Renderer Process (React 19) inicializando i18n, estilos globais e shell principal.
 */
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento raiz #root não encontrado em index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
