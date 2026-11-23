import { useTranslation } from 'react-i18next';
import { RoadmapPlaceholder } from '@/components';

/**
 * Tela da Base / Juniores (Fase 0: placeholder estruturado para promoção de talentos e evolução DEC-008 da Fase 3).
 */
export function YouthScreen() {
  const { t } = useTranslation();
  return (
    <RoadmapPlaceholder
      title={t('nav.youth')}
      phaseLabel={t('roadmap.phase3Title')}
      description={t('roadmap.youthDesc')}
    />
  );
}
