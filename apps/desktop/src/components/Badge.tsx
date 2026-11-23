import type { ReactNode } from 'react';

type BadgeVariant = 'neutral' | 'club' | 'success' | 'warning';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
  club: 'border-transparent bg-[var(--club-accent-soft)] text-[var(--club-accent-text)]',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
};

/**
 * Selo enxuto para posições, fases do calendário e status do sistema.
 */
export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
