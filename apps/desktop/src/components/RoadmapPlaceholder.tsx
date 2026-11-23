import { Badge, Card } from '@/components';

interface RoadmapPlaceholderProps {
  title: string;
  phaseLabel: string;
  description: string;
}

/**
 * Painel minimalista para módulos estruturados na Fase 0 que serão populados nas Fases 1–4.
 */
export function RoadmapPlaceholder({ title, phaseLabel, description }: RoadmapPlaceholderProps) {
  return (
    <Card title={title} headerRight={<Badge variant="club">{phaseLabel}</Badge>}>
      <p className="max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
        {description}
      </p>
    </Card>
  );
}
