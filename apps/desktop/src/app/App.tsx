import { useEffect, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import {
  ArrowLeftRight,
  Award,
  FastForward,
  Flag,
  Landmark,
  Settings,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { Badge, Button } from '@/components';
import { useAppStore, type NavSectionId } from '@/store/useAppStore';
import { SquadScreen } from '@/features/squad/SquadScreen';
import { CompetitionsScreen } from '@/features/competitions/CompetitionsScreen';
import { TransfersScreen } from '@/features/transfers/TransfersScreen';
import { FinanceScreen } from '@/features/finance/FinanceScreen';
import { YouthScreen } from '@/features/youth/YouthScreen';
import { NationalScreen } from '@/features/national/NationalScreen';
import { HistoryScreen } from '@/features/history/HistoryScreen';
import { SystemScreen } from '@/features/menu/SystemScreen';

interface SidebarNavItem {
  id: NavSectionId;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
}

/**
 * Menu lateral fixo e enxuto com os exatos 8 itens especificados na Seção 10.1.
 */
const SIDEBAR_ITEMS: readonly SidebarNavItem[] = [
  { id: 'squad', labelKey: 'nav.squad', icon: Users },
  { id: 'competitions', labelKey: 'nav.competitions', icon: Trophy },
  { id: 'transfers', labelKey: 'nav.transfers', icon: ArrowLeftRight },
  { id: 'finance', labelKey: 'nav.finance', icon: Landmark },
  { id: 'youth', labelKey: 'nav.youth', icon: Sparkles },
  { id: 'national', labelKey: 'nav.national', icon: Flag },
  { id: 'history', labelKey: 'nav.history', icon: Award },
  { id: 'system', labelKey: 'nav.system', icon: Settings },
];

/**
 * Verifica se o foco está em campo interativo antes de disparar o atalho global `Enter`.
 */
export function isInteractiveElementFocused(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const candidate = target as { tagName?: unknown; isContentEditable?: unknown };
  if (candidate.isContentEditable === true) return true;
  if (typeof candidate.tagName !== 'string') return false;
  const tag = candidate.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    tag === 'button' ||
    tag === 'a'
  );
}

/**
 * Decide se um evento de teclado deve acionar o atalho global `Enter` de avanço semanal.
 */
export function shouldTriggerGlobalAdvanceShortcut(event: {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  target: unknown;
}): boolean {
  if (event.key !== 'Enter' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }
  return !isInteractiveElementFocused(event.target);
}

/**
 * Resolve o componente de tela correspondente à seção ativa do menu lateral.
 */
function ActiveSectionView({ section }: { section: NavSectionId }) {
  switch (section) {
    case 'squad':
      return <SquadScreen />;
    case 'competitions':
      return <CompetitionsScreen />;
    case 'transfers':
      return <TransfersScreen />;
    case 'finance':
      return <FinanceScreen />;
    case 'youth':
      return <YouthScreen />;
    case 'national':
      return <NationalScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'system':
      return <SystemScreen />;
  }
}

interface SidebarProps {
  activeSection: NavSectionId;
  clubShortName: string;
  clubName: string;
  currentYear: number;
  currentWeek: number;
  onSelectSection: (section: NavSectionId) => void;
}

/**
 * Botão individual de seção do menu lateral fixo.
 */
function SidebarNavButton({
  item,
  isActive,
  onSelect,
}: {
  item: SidebarNavItem;
  isActive: boolean;
  onSelect: (id: NavSectionId) => void;
}) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left text-xs font-medium transition-colors ${
        isActive
          ? 'border-[var(--club-primary)] bg-[var(--club-accent-soft)] text-[var(--club-accent-text)]'
          : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{t(item.labelKey)}</span>
    </button>
  );
}

/**
 * Menu lateral fixo de 8 itens com destaque dinâmico na cor do clube treinado.
 */
function AppSidebar({
  activeSection,
  clubShortName,
  clubName,
  currentYear,
  currentWeek,
  onSelectSection,
}: SidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)]">
      <div className="flex h-14 items-center gap-3 border-b border-[var(--border-subtle)] px-4">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold tracking-tight"
          style={{ backgroundColor: 'var(--club-primary)', color: 'var(--club-primary-fg)' }}
        >
          {clubShortName}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{t('app.name')}</p>
          <p className="truncate text-[11px] text-[var(--text-muted)]">{t('app.phaseBadge')}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label={t('nav.mainAriaLabel')}>
        {SIDEBAR_ITEMS.map((item) => (
          <SidebarNavButton
            key={item.id}
            item={item}
            isActive={activeSection === item.id}
            onSelect={onSelectSection}
          />
        ))}
      </nav>

      <div className="border-t border-[var(--border-subtle)] px-4 py-3 text-[11px] text-[var(--text-muted)]">
        <p className="truncate font-medium text-[var(--text-secondary)]">{clubName}</p>
        <p className="font-mono-tabular mt-0.5">
          {t('app.yearLabel', { year: currentYear })} · {t('app.weekLabel', { week: currentWeek })}
        </p>
      </div>
    </aside>
  );
}

interface TopBarProps {
  clubName: string;
  currentYear: number;
  currentWeek: number;
  isAdvancing: boolean;
  onAdvanceWeek: () => void;
}

/**
 * Barra superior minimalista com faixa na cor do clube e botão fixo de avanço semanal (Seção 10.1).
 */
function AppTopBar({ clubName, currentYear, currentWeek, isAdvancing, onAdvanceWeek }: TopBarProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="h-1 w-full shrink-0" style={{ backgroundColor: 'var(--club-primary)' }} />
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-sm font-semibold">{clubName}</h1>
          <Badge variant="neutral" className="font-mono-tabular">
            {t('app.yearLabel', { year: currentYear })} · {t('app.weekLabel', { week: currentWeek })}
          </Badge>
        </div>

        <Button variant="club" disabled={isAdvancing} onClick={onAdvanceWeek}>
          <FastForward className="h-3.5 w-3.5" />
          <span>{t('app.advanceWeekCta')}</span>
          <kbd className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px]">
            {t('app.advanceShortcutHint')}
          </kbd>
        </Button>
      </header>
    </>
  );
}

/**
 * Registra o atalho global `Enter` para avançar semana sem interferir em controles focados (Seção 10.1).
 */
function useGlobalAdvanceShortcut(advanceWeek: () => Promise<void>): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldTriggerGlobalAdvanceShortcut(event)) return;
      event.preventDefault();
      void advanceWeek();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [advanceWeek]);
}

/**
 * Rodapé discreto de telemetria e mensagens de status operacional.
 */
function StatusFooter({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-2 text-[11px] text-[var(--text-muted)]">
      <span className="font-mono-tabular">{message}</span>
    </footer>
  );
}

/**
 * Seleciona de forma granular apenas os campos necessários para o shell principal, evitando re-renders extras.
 */
function useAppShellState() {
  return useAppStore(
    useShallow((s) => ({
      activeSection: s.activeSection,
      activeClub: s.activeClub,
      currentYear: s.currentYear,
      currentWeek: s.currentWeek,
      isAdvancing: s.isAdvancing,
      statusMessage: s.statusMessage,
      initialize: s.initialize,
      setActiveSection: s.setActiveSection,
      advanceWeek: s.advanceWeek,
    })),
  );
}

/**
 * Shell principal minimalista do FootManager com barra superior na cor do clube e atalho Enter.
 */
export function App() {
  const {
    activeSection,
    activeClub,
    currentYear,
    currentWeek,
    isAdvancing,
    statusMessage,
    initialize,
    setActiveSection,
    advanceWeek,
  } = useAppShellState();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useGlobalAdvanceShortcut(advanceWeek);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
      <AppSidebar
        activeSection={activeSection}
        clubShortName={activeClub.shortName}
        clubName={activeClub.name}
        currentYear={currentYear}
        currentWeek={currentWeek}
        onSelectSection={setActiveSection}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopBar
          clubName={activeClub.name}
          currentYear={currentYear}
          currentWeek={currentWeek}
          isAdvancing={isAdvancing}
          onAdvanceWeek={() => void advanceWeek()}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl">
            <ActiveSectionView section={activeSection} />
          </div>
        </main>
        <StatusFooter message={statusMessage} />
      </div>
    </div>
  );
}
