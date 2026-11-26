'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import type { WatchEntry } from '@/lib/watch';
import { webtoonPlatform, type WebtoonCoverCandidate } from '@/lib/webtoon';
import Dialog from './dialog';

type ResultRow = { entry: WatchEntry; items: WebtoonCoverCandidate[]; selected: number | null };
const sourceUrl = 'https://www.kmas.or.kr/guide/openapi';
const batchSize = 20;

function CandidateImage({ candidate }: { candidate: WebtoonCoverCandidate }) {
  const [failed, setFailed] = useState(false);
  return <span className="webtoon-preview-image" aria-hidden="true">{failed
    ? <BookOpen size={18}/>
    : <img src={candidate.cover.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>}
  </span>;
}

export default function WebtoonCovers({ entries, onClose, onSave }: {
  entries: WatchEntry[];
  onClose: () => void;
  onSave: (entries: WatchEntry[], message: string) => boolean;
}) {
  const [queue] = useState(() => entries.filter(entry => entry.watch.type === 'webtoon' && !entry.watch.webtoonCover));
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function lookup() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage('');
    try {
      for (const entry of queue.slice(rows.length, rows.length + batchSize)) {
        const params = new URLSearchParams({ q: entry.title, platform: webtoonPlatform(entry.url) });
        const response = await fetch(`/api/watch/webtoons?${params}`, { signal: controller.signal });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (result.error === 'catalog_not_connected') {
            setConnected(false);
            setMessage('만화규장각 API 키를 Sites 시크릿에 연결하면 표지를 찾을 수 있어요.');
          } else {
            setMessage(result.error === 'catalog_limited' ? '조회 한도에 도달했어요. 잠시 뒤 다시 시도해주세요.' : '표지 검색이 중단됐어요. 남은 작품부터 다시 조회할 수 있어요.');
          }
          return;
        }
        setRows(current => [...current, { entry, items: result.items, selected: result.recommended }]);
      }
    } catch {
      if (!controller.signal.aborted) setMessage('연결이 끊겼어요. 남은 작품부터 다시 조회할 수 있어요.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      request.current = null;
    }
  }

  const remaining = queue.length - rows.length;
  const selectedCount = rows.filter(row => row.selected !== null).length;
  function choose(id: string, selected: number | null) {
    setRows(current => current.map(row => row.entry.id === id ? { ...row, selected } : row));
  }
  function apply() {
    const latest = new Map(entries.map(entry => [entry.id, entry]));
    const updates = rows.flatMap((row) => {
      const entry = latest.get(row.entry.id);
      const cover = row.selected === null ? undefined : row.items[row.selected]?.cover;
      if (!entry || !cover || entry.watch.type !== 'webtoon' || entry.watch.webtoonCover ||
        entry.title !== row.entry.title || entry.url !== row.entry.url) return [];
      return [{ ...entry, watch: { ...entry.watch, webtoonCover: cover } }];
    });
    if (!updates.length) {
      setMessage('기록이 바뀌어 적용할 표지가 없어요. 창을 다시 열어 확인해주세요.');
      return;
    }
    const skipped = selectedCount - updates.length;
    const notice = `웹툰 ${updates.length}개의 표지를 채웠어요.${skipped ? ` 바뀐 기록 ${skipped}개는 건너뛰었어요.` : ''}`;
    if (onSave(updates, notice)) onClose();
    else setMessage('표지를 저장하지 못했어요. 다시 시도해주세요.');
  }

  return <Dialog title="빈 표지 채우기" onClose={onClose} className="webtoon-cover-dialog" focusField={false}>
    <div className="webtoon-cover-content">
      <p className="watch-feedback">작품 제목으로 <a href={sourceUrl} target="_blank" rel="noreferrer">만화규장각</a>에서 표지를 찾습니다. 제목과 플랫폼이 모두 일치하는 후보가 한 개면 미리 선택돼요.</p>
      <div className="webtoon-cover-toolbar">
        <span role="status">{rows.length} / {queue.length}개 조회</span>
        {remaining > 0 && connected && <button className="button secondary" type="button" disabled={busy} onClick={() => void lookup()}>
          <Search size={15} aria-hidden="true"/>{busy ? '조회 중' : rows.length ? '남은 작품 조회' : '표지 찾기'}
        </button>}
      </div>
      {message && <p className="watch-feedback" role="status">{message}</p>}
      {rows.map(({ entry, items, selected }) => <fieldset key={entry.id} className="webtoon-cover-row">
        <legend>{entry.title}</legend>
        {!items.length ? <p className="watch-feedback">찾은 표지가 없어요.</p> : <>
          <div className="webtoon-cover-options">
            {items.map((item, index) => <label key={index} className="webtoon-cover-option">
              <input type="radio" name={`webtoon-${entry.id}`} checked={selected === index} onChange={() => choose(entry.id, index)}/>
              <CandidateImage candidate={item}/>
              <span className="webtoon-option-title"><strong>{item.title}</strong><small>{[item.platform, item.creator].filter(Boolean).join(' · ')}</small></span>
            </label>)}
          </div>
          {selected !== null && <button type="button" className="text-button muted" onClick={() => choose(entry.id, null)}>이 작품 건너뛰기</button>}
        </>}
      </fieldset>)}
    </div>
    <div className="dialog-footer">
      <button className="button secondary" type="button" onClick={onClose}>취소</button>
      <button className="button primary" type="button" disabled={busy || !selectedCount} onClick={apply}>{selectedCount ? `${selectedCount}개 표지 적용` : '표지 적용'}</button>
    </div>
  </Dialog>;
}
