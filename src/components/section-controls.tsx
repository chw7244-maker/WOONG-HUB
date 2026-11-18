import type { ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

export function SectionFilters({ active = 0, children }: { active?: number; children: ReactNode }) {
  return <details className="section-filters">
    <summary><SlidersHorizontal size={16} aria-hidden="true"/>필터{active > 0 && <span className="section-filter-count">{active}</span>}<ChevronDown size={15} className="section-chevron" aria-hidden="true"/></summary>
    <div className="section-filter-fields">{children}</div>
  </details>;
}

export function SectionStats({ label, children }: { label: string; children: ReactNode }) {
  return <details className="section-stats">
    <summary>{label}<ChevronDown size={15} className="section-chevron" aria-hidden="true"/></summary>
    {children}
  </details>;
}
