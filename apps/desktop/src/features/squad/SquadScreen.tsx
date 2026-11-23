import { useTranslation } from 'react-i18next';
import { calculateAgeAtWeek, calculateEffectiveStrength } from '@footmanager/engine';
import type { AdvanceWeekResult } from '@footmanager/schemas';
import type { TFunction } from 'i18next';
import { Star } from 'lucide-react';
import { Badge, Card, DataTable, type TableColumn } from '@/components';
import {
  DEMO_CLUBS,
  useAppStore,
  type DemoClubProfile,
  type PreviewPlayer,
} from '@/store/useAppStore';

/**
 * Renderiza o nome do atleta com selo clássico de Estrela (★) quando aplicável.
 */
function PlayerNameCell({ player, starLabel }: { player: PreviewPlayer; starLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      {player.name}
      {player.isStar && (
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label={starLabel} />
      )}
    </span>
  );
}

/**
 * Colunas de identidade do atleta (posição, nome + estrela e idade calculada por semana).
 */
function buildIdentityColumns(
  t: TFunction,
  currentYear: number,
  currentWeek: number,
): readonly TableColumn<PreviewPlayer>[] {
  const starLabel = t('squad.starAriaLabel');
  return [
    {
      key: 'pos',
      header: t('squad.columns.pos'),
      render: (player) => <Badge variant="club">{player.primaryPosition}</Badge>,
    },
    {
      key: 'player',
      header: t('squad.columns.player'),
      render: (player) => <PlayerNameCell player={player} starLabel={starLabel} />,
    },
    {
      key: 'age',
      header: t('squad.columns.age'),
      align: 'right',
      tabular: true,
      render: (player) => calculateAgeAtWeek(player.birthDate, currentYear, currentWeek),
    },
  ];
}

/**
 * Colunas técnicas e físicas do atleta (força, efetiva do motor, energia, moral e traits).
 */
function buildPerformanceColumns(t: TFunction): readonly TableColumn<PreviewPlayer>[] {
  return [
    {
      key: 'overall',
      header: t('squad.columns.overall'),
      align: 'right',
      tabular: true,
      render: (player) => <span className="font-semibold">{player.overall}</span>,
    },
    {
      key: 'effective',
      header: t('squad.columns.effective'),
      align: 'right',
      tabular: true,
      render: (player) => (
        <span className="font-semibold text-[var(--club-accent-text)]">
          {calculateEffectiveStrength({ player, assignedSlot: player.primaryPosition }).toFixed(1)}
        </span>
      ),
    },
    {
      key: 'energy',
      header: t('squad.columns.energy'),
      align: 'right',
      tabular: true,
      render: (player) => `${player.energy}%`,
    },
    {
      key: 'morale',
      header: t('squad.columns.morale'),
      align: 'center',
      tabular: true,
      render: (player) => `${player.morale}/5`,
    },
    {
      key: 'traits',
      header: t('squad.columns.traits'),
      render: (player) => (
        <div className="flex flex-wrap gap-1">
          {player.traits.map((trait) => (
            <Badge key={trait}>{trait}</Badge>
          ))}
        </div>
      ),
    },
  ];
}

/**
 * Monta as colunas completas da tabela de elenco via composição modular.
 */
function buildSquadColumns(
  t: TFunction,
  currentYear: number,
  currentWeek: number,
): readonly TableColumn<PreviewPlayer>[] {
  return [...buildIdentityColumns(t, currentYear, currentWeek), ...buildPerformanceColumns(t)];
}

/**
 * Grade de indicadores principais do clube atual (estádio, modelo de governança e caixa).
 */
function ClubMetricsGrid({ club, locale }: { club: DemoClubProfile; locale: string }) {
  const { t } = useTranslation();
  const formattedCapacity = club.stadiumCapacity.toLocaleString(locale);

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
        <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          {t('squad.stadiumLabel')}
        </p>
        <p className="mt-1 text-sm font-semibold">{club.stadiumName}</p>
        <p className="font-mono-tabular text-xs text-[var(--text-secondary)]">
          {t('squad.stadiumSeats', { capacity: formattedCapacity })}
        </p>
      </div>
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
        <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          {t('squad.governanceLabel')}
        </p>
        <p className="mt-1 text-sm font-semibold">
          {club.governance === 'saf'
            ? t('squad.governanceSaf', { tier: club.investorTier })
            : t('squad.governanceAssociative')}
        </p>
      </div>
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
        <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
          {t('squad.cashLabel')}
        </p>
        <p className="font-mono-tabular mt-1 text-sm font-semibold">{club.cashBalanceLabel}</p>
      </div>
    </div>
  );
}

/**
 * Seletor rápido de clube demonstrativo para validar o tema dinâmico e contraste WCAG em tempo real.
 */
function ClubSwitcherBar({
  activeClubId,
  onSelectClub,
}: {
  activeClubId: string;
  onSelectClub: (clubId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
        {t('squad.clubSwitcherLabel')}
      </p>
      <div className="flex flex-wrap gap-2">
        {DEMO_CLUBS.map((club) => {
          const isSelected = club.id === activeClubId;
          return (
            <button
              key={club.id}
              type="button"
              onClick={() => onSelectClub(club.id)}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                isSelected
                  ? 'border-[var(--club-primary)] bg-[var(--club-accent-soft)] text-[var(--club-accent-text)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span
                className="h-3 w-3 rounded-full border border-white/20"
                style={{ backgroundColor: club.primaryColor }}
              />
              {club.shortName} · {club.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Cartão com telemetria do último tick semanal (latência do motor, seed PRNG e eventos de calendário).
 */
function LastTickCard({ result }: { result: AdvanceWeekResult | null }) {
  const { t } = useTranslation();

  return (
    <Card title={t('squad.lastTickCard')}>
      {result ? (
        <dl className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-[var(--text-muted)]">{t('squad.latencyLabel')}</dt>
            <dd className="font-mono-tabular font-semibold text-emerald-500">
              {result.durationMs.toFixed(3)} ms
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-[var(--text-muted)]">{t('squad.seedLabel')}</dt>
            <dd className="font-mono-tabular">{result.nextSeed}</dd>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {result.isFifaDate && <Badge variant="warning">{t('app.fifaDateBadge')}</Badge>}
            {result.isSplitYearRollover && (
              <Badge variant="club">{t('app.splitRolloverBadge')}</Badge>
            )}
            {result.isCalendarYearRollover && (
              <Badge variant="success">{t('app.calendarRolloverBadge')}</Badge>
            )}
          </div>
        </dl>
      ) : (
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">{t('squad.lastTickEmpty')}</p>
      )}
    </Card>
  );
}

/**
 * Tela principal "Elenco & Tática" da Fase 0 (Seção 10.1).
 * Demonstra números tabulares, cor dinâmica do clube com contraste WCAG e cálculos reais do @footmanager/engine.
 */
export function SquadScreen() {
  const { t, i18n } = useTranslation();
  const activeClub = useAppStore((s) => s.activeClub);
  const themeTokens = useAppStore((s) => s.themeTokens);
  const currentYear = useAppStore((s) => s.currentYear);
  const currentWeek = useAppStore((s) => s.currentWeek);
  const lastAdvanceResult = useAppStore((s) => s.lastAdvanceResult);
  const selectClub = useAppStore((s) => s.selectClub);

  const columns = buildSquadColumns(t, currentYear, currentWeek);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title={t('squad.activeClubCard')}
          subtitle={activeClub.name}
          className="lg:col-span-2"
          headerRight={
            <Badge variant="club">
              {t('squad.wcagContrastLabel')}: {themeTokens.contrastRatioOnPrimary.toFixed(1)}:1
            </Badge>
          }
        >
          <ClubMetricsGrid club={activeClub} locale={i18n.language} />
          <ClubSwitcherBar activeClubId={activeClub.id} onSelectClub={selectClub} />
        </Card>

        <LastTickCard result={lastAdvanceResult} />
      </div>

      <Card title={t('squad.title')} subtitle={t('squad.description')}>
        <DataTable columns={columns} rows={activeClub.squad} rowKey={(player) => player.id} />
      </Card>
    </div>
  );
}
