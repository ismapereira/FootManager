import { useTranslation } from 'react-i18next';
import { RoadmapPlaceholder } from '@/components';

/**
 * Tela de Seleções Nacionais (Fase 0: placeholder estruturado para convocações, Datas FIFA e Copa de 48 da Fase 2).
 */
export function NationalScreen() {
  const { t } = useTranslation();
  return (
    <RoadmapPlaceholder
      title={t('nav.national')}
      phaseLabel={t('roadmap.phase2Title')}
      description={t('roadmap.nationalDesc')}
    />
  );
}
