import { eventStartDay, type CalendarEvent } from './calendar.ts';

type MatchStatus = 'tentative' | 'cancelled' | null;
export type Fixture = { id: string; home: string; away: string; competition: string; kickOff: string; venue: string; postponed: MatchStatus };
export type FixtureSource = { items: Fixture[]; stale: boolean; checkedAt: string };
export type SavedFixture = { id: string; title: string; kickOff: string; tentative: boolean };

export const footballSourceId = 'hub-football';
export const footballSourceName = '담은 맨시티 경기';
export const clubFixturesUrl = 'https://www.mancity.com/fixtures/mens';
export const clubName = (name: string) => /^(?:manchester city|man city)(?: fc)?$/i.test(name) ? '맨시티' : name;
export const matchup = (match: Pick<Fixture, 'home' | 'away'>) => `${clubName(match.home)} vs ${clubName(match.away)}`;
export const matchStatusLabel = (status: MatchStatus) => status === 'cancelled' ? '경기 취소' : status === 'tentative' ? '시간 변경 가능' : '';

export function validateSavedFixtures(input: unknown): SavedFixture[] {
  const invalid = () => new Error('담은 맨시티 경기의 형식을 확인해주세요.');
  if (!Array.isArray(input) || input.length > 10000) throw invalid();
  const ids = new Set<string>();
  return input.map((fixture: SavedFixture) => {
    if (!fixture || typeof fixture.id !== 'string' || !fixture.id.trim() || fixture.id.length > 100 || ids.has(fixture.id) ||
        typeof fixture.title !== 'string' || !fixture.title.trim() || fixture.title.length > 274 ||
        typeof fixture.kickOff !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(fixture.kickOff) ||
        !Number.isFinite(Date.parse(fixture.kickOff)) || new Date(fixture.kickOff).toISOString().replace('.000Z', 'Z') !== fixture.kickOff ||
        typeof fixture.tentative !== 'boolean') throw invalid();
    ids.add(fixture.id);
    const { id, title, kickOff, tentative } = fixture;
    return { id, title, kickOff, tentative };
  });
}

export function saveFixture(match: Fixture): SavedFixture {
  return { id: match.id, title: matchup(match), kickOff: match.kickOff, tentative: match.postponed === 'tentative' };
}

export function fixtureCalendarHref(kickOff: string) {
  return `/calendar/?date=${eventStartDay({ allDay: false, start: kickOff })}`;
}

export function savedFixtureEvents(saved: SavedFixture[], source: FixtureSource | null | undefined, now: number, failed: boolean): CalendarEvent[] {
  const official = new Map(source?.items.map(match => [match.id, match]));
  return saved.map(fixture => {
    const current = official.get(fixture.id);
    const start = current?.kickOff ?? fixture.kickOff;
    const status = current ? current.postponed : fixture.tentative ? 'tentative' : null;
    const changed = !!current && start !== fixture.kickOff;
    const notice = [
      matchStatusLabel(status),
      changed ? '킥오프 변경' : '',
      current ? source?.stale || failed ? '마지막 조회 정보' : '' :
        source && !source.stale && !failed && Date.parse(start) >= now ? '공식 일정에서 확인되지 않음 · 저장 당시 시간' : '저장 당시 시간',
    ].filter(Boolean).join(' · ');
    return {
      id: fixture.id, sourceId: footballSourceId, title: current ? matchup(current) : fixture.title, url: clubFixturesUrl,
      allDay: false, start, end: start, note: notice, cancelled: status === 'cancelled',
    };
  });
}
