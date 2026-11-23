import { useTranslation } from 'react-i18next';
import { RoadmapPlaceholder } from '@/components';

/**
 * Tela de Carreira & Histórico (Fase 0: placeholder estruturado para galeria de troféus e ranking da Fase 3).
 */
export function HistoryScreen() {
  const { t } = useTranslation();
  return (
    <RoadmapPlaceholder
      title={t('nav.history')}
      phaseLabel={t('roadmap.phase3Title')}
      description={t('roadmap.historyDesc')}
    />
  );
}
