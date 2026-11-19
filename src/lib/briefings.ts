export const briefingEditions = {
  games: { label: '게임', sections: {
    headline: '핵심 뉴스', 'pc-console': 'PC·콘솔', korea: '국내 게임사', mobile: '모바일', deals: '할인·무료 배포', calendar: '앞으로 7일',
  } },
  audio: { label: '오디오·음악', sections: {
    headline: '핵심 뉴스', 'local-audio': '국내 오디오', 'global-audio': '글로벌 오디오·기술', releases: '음악·신보', calendar: '앞으로 7일',
  } },
} as const;

export type BriefingEdition = keyof typeof briefingEditions;
export const editionIds = Object.keys(briefingEditions) as BriefingEdition[];
export const briefingSources = { official: '공식', reported: '보도', rumor: '루머' } as const;
export type BriefingItem = {
  section: string;
  title: string;
  summary: string;
  why: string;
  source: string;
  url: string;
  status: keyof typeof briefingSources;
  sourceDate?: string;
};
export type BriefingDraft = {
  date: string;
  edition: BriefingEdition;
  overview: string;
  items: BriefingItem[];
  markdown?: string;
  chatUrl?: string;
};
export type BriefingIssue = BriefingDraft & { publishedAt: string };
export type BriefingReadout = { date: string; today: string; dates: string[]; issues: BriefingIssue[] };

export function isBriefingEdition(value: string): value is BriefingEdition {
  return Object.hasOwn(briefingEditions, value);
}

export function briefingSection(edition: BriefingEdition, section: string) {
  const sections: Readonly<Record<string, string>> = briefingEditions[edition].sections;
  return Object.hasOwn(sections, section) ? sections[section] : undefined;
}

export function isBriefingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function adjacentBriefingDate(day: string, step: -1 | 1) {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + step);
  const value = next.toISOString().split('T')[0];
  return isBriefingDate(value) ? value : undefined;
}
