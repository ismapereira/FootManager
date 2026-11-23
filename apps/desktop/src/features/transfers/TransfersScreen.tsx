import { useTranslation } from 'react-i18next';
import { RoadmapPlaceholder } from '@/components';

/**
 * Tela de Mercado de Transferências (Fase 0: placeholder estruturado para busca virtualizada e negociações da Fase 1).
 */
export function TransfersScreen() {
  const { t } = useTranslation();
  return (
    <RoadmapPlaceholder
      title={t('nav.transfers')}
      phaseLabel={t('roadmap.phase1Title')}
      description={t('roadmap.transfersDesc')}
    />
  );
}
