import { ChevronDown, ChevronUp } from 'lucide-react';

export const widgetLabels: Record<string, string> = {
  weather: '날씨', calendar: '캘린더', todos: '오늘의 할 일', bookmarks: '즐겨찾기', news: '관심 뉴스',
  interests: '오디오 이어서 하기', note: '빠른 메모와 최근 기록', spotify: 'Spotify 음악', steam: 'Steam 최근 플레이',
  football: '맨시티 다음 경기', watch: '보던 작품 이어서 보기',
};

const sectionLabels: Record<string, string> = { resume: '이어서 하기', recent: '최근 기록', links: '즐겨찾기', news: '관심 뉴스와 다음 경기' };

export default function HomeWidgetControls({ order, visible, onToggle, onOrder }: {
  order: string[]; visible: (id: string) => boolean; onToggle: (id: string, enabled: boolean) => void; onOrder: (order: string[]) => void;
}) {
  function move(index: number, offset: number) {
    const reordered = [...order], target = index + offset;
    if (target < 0 || target >= order.length) return;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    onOrder(reordered);
  }

  return <div className="home-widget-controls">
    <div className="widget-toggles">{Object.entries(widgetLabels).map(([id, label]) => <label key={id} className="toggle-row">
      <span>{label}</span><input type="checkbox" checked={visible(id)} onChange={event => onToggle(id, event.target.checked)}/><span className="toggle-switch"/>
    </label>)}</div>
    <section aria-label="하단 위젯 순서">
      <h3>하단 위젯 순서</h3>
      <ol className="home-widget-order">{order.map((id, index) => <li key={id}>
        <span>{sectionLabels[id]}</span><button type="button" className="icon-button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`${sectionLabels[id]} 위로`}><ChevronUp size={16}/></button>
        <button type="button" className="icon-button" disabled={index === order.length - 1} onClick={() => move(index, 1)} aria-label={`${sectionLabels[id]} 아래로`}><ChevronDown size={16}/></button>
      </li>)}</ol>
    </section>
  </div>;
}
