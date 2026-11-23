import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from './locales/pt-BR.json';

/**
 * Inicializa o sistema de internacionalização (DEC-012) com Português-BR como idioma base,
 * estruturado para adição futura de `en-US` e `es-ES` sem refatoração dos componentes.
 */
void i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': {
      translation: ptBR,
    },
  },
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  initAsync: false,
  interpolation: {
    escapeValue: false, // React já faz escape contra XSS por padrão
  },
});

export default i18n;
