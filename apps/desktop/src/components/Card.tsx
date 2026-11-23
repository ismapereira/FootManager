import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Cartão minimalista reutilizável baseado nos tokens de superfície do tema ativo.
 */
export function Card({ title, subtitle, headerRight, children, className = '' }: CardProps) {
  return (
    <section
      className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs ${className}`}
    >
      {(title || headerRight) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
