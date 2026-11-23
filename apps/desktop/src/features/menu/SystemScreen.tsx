import { useTranslation } from 'react-i18next';
import {
  Cpu,
  Database,
  FolderOpen,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { SaveSlotSummary } from '@footmanager/schemas';
import { Badge, Button, Card } from '@/components';
import { soundManager, type SoundEffectName } from '@/audio/soundManager';
import type { ThemeMode } from '@/app/theme';
import { useAppStore } from '@/store/useAppStore';

const SOUND_EFFECTS: readonly SoundEffectName[] = ['click', 'whistle', 'goal', 'card'];

/**
 * Cartão de seleção de tema claro/escuro e visualização do idioma ativo (`i18next`).
 */
function AppearanceCard({
  theme,
  onSelectTheme,
}: {
  theme: ThemeMode;
  onSelectTheme: (mode: ThemeMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card title={t('system.appearanceTitle')}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={theme === 'dark' ? 'club' : 'secondary'}
          onClick={() => onSelectTheme('dark')}
        >
          <Moon className="h-3.5 w-3.5" />
          {t('system.themeDark')}
        </Button>
        <Button
          variant={theme === 'light' ? 'club' : 'secondary'}
          onClick={() => onSelectTheme('light')}
        >
          <Sun className="h-3.5 w-3.5" />
          {t('system.themeLight')}
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-xs">
        <span className="text-[var(--text-muted)]">{t('system.localeLabel')}</span>
        <Badge variant="club">{t('system.localeValue')}</Badge>
      </div>
    </Card>
  );
}

/**
 * Cartão de controle de mudo, volume e teste rápido de efeitos sonoros Web Audio API.
 */
function AudioCard({
  audioEnabled,
  audioVolume,
  onChangeAudio,
}: {
  audioEnabled: boolean;
  audioVolume: number;
  onChangeAudio: (enabled: boolean, volume: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card title={t('system.audioTitle')}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant={audioEnabled ? 'club' : 'secondary'}
            onClick={() => onChangeAudio(!audioEnabled, audioVolume)}
          >
            {audioEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            {audioEnabled ? t('system.audioActive') : t('system.audioMute')}
          </Button>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span>{t('system.audioVolume')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(audioVolume * 100)}
              onChange={(e) => onChangeAudio(audioEnabled, Number(e.target.value) / 100)}
              className="w-28 accent-[var(--club-primary)]"
            />
            <span className="font-mono-tabular w-9 text-right">
              {Math.round(audioVolume * 100)}%
            </span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {SOUND_EFFECTS.map((effect) => (
            <Button key={effect} variant="secondary" onClick={() => soundManager.play(effect)}>
              {t(`system.testSounds.${effect}`)}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
}

/**
 * Cartão de status e diagnóstico de latência da Worker Thread de simulação.
 */
function WorkerStatusCard({
  runtimeMode,
  workerLatencyMs,
  onPingWorker,
}: {
  runtimeMode: 'desktop' | 'browser-preview';
  workerLatencyMs: number | null;
  onPingWorker: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card
      title={t('system.workerTitle')}
      headerRight={
        <Badge variant={workerLatencyMs !== null ? 'success' : 'neutral'}>
          <Cpu className="h-3 w-3" />
          {workerLatencyMs !== null
            ? t('system.workerStatusOk', { ms: workerLatencyMs })
            : t('system.workerStatusIdle')}
        </Badge>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-secondary)]">
          {runtimeMode === 'desktop' ? t('app.runtimeDesktop') : t('app.runtimeBrowser')}
        </p>
        <Button variant="secondary" disabled={runtimeMode !== 'desktop'} onClick={onPingWorker}>
          {t('system.pingWorker')}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Linha individual de um slot de save com selos de integridade SQLite e ações de gestão.
 */
export function SaveSlotRow({
  slot,
  isActive,
  onLoad,
  onVerify,
  onDelete,
}: {
  slot: SaveSlotSummary;
  isActive: boolean;
  onLoad: (saveId: string) => void;
  onVerify: (saveId: string) => void;
  onDelete: (saveId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
      <div>
        <p className="font-semibold text-[var(--text-primary)]">{slot.saveName}</p>
        <p className="font-mono-tabular mt-0.5 text-[11px] text-[var(--text-muted)]">
          {t('system.saveSlotMeta', {
            saveId: slot.saveId,
            year: slot.currentYear,
            week: slot.currentWeek,
            sizeKb: (slot.fileSizeBytes / 1024).toFixed(1),
          })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isActive && <Badge variant="club">{t('system.saveActiveBadge')}</Badge>}
        <Badge variant={slot.integrityOk ? 'success' : 'warning'}>
          {slot.integrityOk ? t('system.saveIntegrityOk') : t('system.saveIntegrityCheck')}
        </Badge>
        {slot.hasBackup && <Badge variant="neutral">{t('system.saveBackupBadge')}</Badge>}
        <Button variant="secondary" onClick={() => onLoad(slot.saveId)}>
          <FolderOpen className="h-3.5 w-3.5" />
          {t('system.loadSave')}
        </Button>
        <Button variant="secondary" onClick={() => onVerify(slot.saveId)}>
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('system.verifySave')}
        </Button>
        <Button variant="danger" onClick={() => onDelete(slot.saveId)}>
          <Trash2 className="h-3.5 w-3.5" />
          {t('system.deleteSave')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Barra de ações de cabeçalho do cartão de persistência (Auto-save, atualizar e novo slot).
 */
function StorageHeaderActions({
  autoSave,
  onToggleAutoSave,
  onRefresh,
  onCreateDemo,
}: {
  autoSave: boolean;
  onToggleAutoSave: () => void;
  onRefresh: () => void;
  onCreateDemo: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={autoSave ? 'club' : 'secondary'} onClick={onToggleAutoSave}>
        {autoSave ? t('system.autoSaveOn') : t('system.autoSaveOff')}
      </Button>
      <Button variant="secondary" onClick={onRefresh}>
        <RefreshCw className="h-3.5 w-3.5" />
        {t('system.refreshSaves')}
      </Button>
      <Button variant="club" onClick={onCreateDemo}>
        <Database className="h-3.5 w-3.5" />
        {t('system.createDemoSave')}
      </Button>
    </div>
  );
}

/**
 * Cartão de persistência SQLite WAL com controle de Auto-save e lista de slots em disco.
 */
function StorageCard() {
  const { t } = useTranslation();
  const runtimeMode = useAppStore((s) => s.runtimeMode);
  const autoSave = useAppStore((s) => s.autoSave);
  const saves = useAppStore((s) => s.saves);
  const activeSaveId = useAppStore((s) => s.activeSaveId);
  const setAutoSave = useAppStore((s) => s.setAutoSave);
  const refreshSaves = useAppStore((s) => s.refreshSaves);
  const createDemoSave = useAppStore((s) => s.createDemoSave);
  const loadSave = useAppStore((s) => s.loadSave);
  const verifySave = useAppStore((s) => s.verifySave);
  const deleteSave = useAppStore((s) => s.deleteSave);

  const headerRight =
    runtimeMode === 'desktop' ? (
      <StorageHeaderActions
        autoSave={autoSave}
        onToggleAutoSave={() => void setAutoSave(!autoSave)}
        onRefresh={() => void refreshSaves()}
        onCreateDemo={() => void createDemoSave()}
      />
    ) : undefined;

  return (
    <Card title={t('system.storageTitle')} headerRight={headerRight}>
      {runtimeMode !== 'desktop' ? (
        <p className="text-xs text-[var(--text-muted)]">{t('system.browserStorageNotice')}</p>
      ) : saves.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{t('system.noSaves')}</p>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)]">
          {saves.map((slot) => (
            <SaveSlotRow
              key={slot.saveId}
              slot={slot}
              isActive={activeSaveId === slot.saveId}
              onLoad={(id) => void loadSave(id)}
              onVerify={(id) => void verifySave(id)}
              onDelete={(id) => void deleteSave(id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * Tela de Sistema & Diagnóstico da Fase 0:
 * valida tema claro/escuro, Web Audio API, persistência SQLite WAL + `.bak` e Worker Thread.
 */
export function SystemScreen() {
  const theme = useAppStore((s) => s.theme);
  const audioEnabled = useAppStore((s) => s.audioEnabled);
  const audioVolume = useAppStore((s) => s.audioVolume);
  const runtimeMode = useAppStore((s) => s.runtimeMode);
  const workerLatencyMs = useAppStore((s) => s.workerLatencyMs);
  const setTheme = useAppStore((s) => s.setTheme);
  const setAudioConfig = useAppStore((s) => s.setAudioConfig);
  const pingWorker = useAppStore((s) => s.pingWorker);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AppearanceCard theme={theme} onSelectTheme={(mode) => void setTheme(mode)} />
        <AudioCard
          audioEnabled={audioEnabled}
          audioVolume={audioVolume}
          onChangeAudio={(enabled, volume) => void setAudioConfig(enabled, volume)}
        />
      </div>

      <WorkerStatusCard
        runtimeMode={runtimeMode}
        workerLatencyMs={workerLatencyMs}
        onPingWorker={() => void pingWorker()}
      />

      <StorageCard />
    </div>
  );
}
