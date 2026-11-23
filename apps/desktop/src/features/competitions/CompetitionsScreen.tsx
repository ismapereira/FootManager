import { useTranslation } from 'react-i18next';
import { RoadmapPlaceholder } from '@/components';

/**
 * Tela de Competições (Fase 0: placeholder estruturado para tabelas, mata-mata e calendário da Fase 1).
 */
export function CompetitionsScreen() {
  const { t } = useTranslation();
  return (
    <RoadmapPlaceholder
      title={t('nav.competitions')}
      phaseLabel={t('roadmap.phase1Title')}
      description={t('roadmap.competitionsDesc')}
    />
  );
}
