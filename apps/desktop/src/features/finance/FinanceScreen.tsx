import { useTranslation } from 'react-i18next';
import { RoadmapPlaceholder } from '@/components';

/**
 * Tela de Finanças & Estádio (Fase 0: placeholder estruturado para bilheteria, caixa e gestão SAF da Fase 3).
 */
export function FinanceScreen() {
  const { t } = useTranslation();
  return (
    <RoadmapPlaceholder
      title={t('nav.finance')}
      phaseLabel={t('roadmap.phase3Title')}
      description={t('roadmap.financeDesc')}
    />
  );
}
