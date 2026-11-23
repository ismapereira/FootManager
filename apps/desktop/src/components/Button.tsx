import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'club' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  club: 'bg-[var(--club-primary)] text-[var(--club-primary-fg)] hover:brightness-110 shadow-sm',
  secondary:
    'border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--club-accent-text)]',
  ghost: 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
  danger: 'border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20',
};

/**
 * Botão padronizado que respeita a cor primária do clube com contraste WCAG automático.
 */
export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
