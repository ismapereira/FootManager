import type { ReactNode } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  tabular?: boolean;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
}

/**
 * Resolve a classe utilitária de alinhamento horizontal da coluna.
 */
function getAlignClass(align?: 'left' | 'right' | 'center'): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

/**
 * Tabela minimalista com suporte a números tabulares alinhados (`tabular-nums`).
 */
export function DataTable<T>({ columns, rows, rowKey }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {columns.map((col) => (
              <th key={col.key} className={`px-3 py-2.5 ${getAlignClass(col.align)}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="transition-colors hover:bg-[var(--bg-elevated)]/60"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2.5 text-[var(--text-primary)] ${
                    col.tabular ? 'font-mono-tabular' : ''
                  } ${getAlignClass(col.align)}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
