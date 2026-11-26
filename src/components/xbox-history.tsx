'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {Gamepad2, Link2, Plus, RefreshCw} from 'lucide-react';
import {emptyGame, playTime} from '@/lib/games';
import type {Entry} from '@/lib/store';
import Dialog from './dialog';
import {GameCover, GameViewToggle, useGameView} from './game-view';

export type XboxGame = {id:string; name:string; lastPlayed:string|null; minutes:number|null; imageUrl?:string};
type XboxSnapshot = {
  games:XboxGame[];
  historyIncomplete:boolean;
  playtimeIncomplete:boolean;
  limited:boolean;
  checkedAt:string;
};

const PAGE_SIZE = 10;
const kst = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', dateStyle:'medium'});
const checkedAtFormat = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', dateStyle:'medium', timeStyle:'short'});
const messages:Record<string,string> = {
  xbox_not_configured:'사이트 설정에 OpenXBL API 키를 등록하면 Xbox 기록을 불러올 수 있어요.',
  xbox_access_denied:'OpenXBL이 조회를 거부했어요. API 키와 Xbox 계정 공개 설정을 확인해주세요.',
  xbox_rate_limited:'OpenXBL의 요청 한도에 도달했어요. 잠시 후 다시 시도해주세요.',
  authentication_required:'WOONG HUB에 로그인한 뒤 확인해주세요.',
  xbox_unavailable:'Xbox 기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
  xbox_storage_unavailable:'Xbox 기록을 읽거나 저장하지 못했어요. 잠시 후 다시 시도해주세요.',
  xbox_refresh_incomplete:'새 기록의 일부를 불러오지 못했어요.',
};

export function useXboxHistory(enabled:boolean) {
  const [snapshot, setSnapshot] = useState<XboxSnapshot|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const active = useRef<AbortController|null>(null);
  const load = useCallback(async (method:'GET'|'POST') => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/games/xbox', {
        method,credentials:'same-origin',cache:'no-store',signal:controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setError(messages[data?.error] ?? messages.xbox_unavailable);
        return;
      }
      setSnapshot(data.snapshot);
      if (data.warning) setError(messages[data.warning] ?? messages.xbox_unavailable);
    } catch {
      if (!controller.signal.aborted) setError(messages.xbox_unavailable);
    } finally {
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load('GET');
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [enabled,load]);

  return {snapshot,loading,error,refresh:()=>load('POST')};
}

function xboxGameDraft(game:XboxGame):Entry {
  return {id:crypto.randomUUID(),kind:'games',title:game.name.slice(0,200),detail:'',category:'Xbox',status:'플레이 중',
    url:'',date:'',done:false,createdAt:new Date().toISOString(),game:{...emptyGame(),xboxTitleId:game.id}};
}

export default function XboxHistory({history,entries,onEdit,onSave}:{
  history:ReturnType<typeof useXboxHistory>;entries:Entry[];onEdit:(entry:Entry)=>void;onSave:(entry:Entry)=>boolean;
}) {
  const {snapshot,loading,error,refresh} = history;
  const [view, setView] = useGameView('xbox');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [linkGame, setLinkGame] = useState<XboxGame|null>(null);
  const [linkEntryId, setLinkEntryId] = useState('');
  const linkedIds = new Set(entries.map(entry=>entry.game?.xboxTitleId));
  const candidates = entries.filter(entry=>!entry.game?.xboxTitleId);
  const linkEntry = candidates.find(entry=>entry.id===linkEntryId);

  function linkExisting() {
    if (!linkGame || !linkEntry || linkedIds.has(linkGame.id)) return;
    if (onSave({...linkEntry,game:{...(linkEntry.game??emptyGame()),xboxTitleId:linkGame.id}})) setLinkGame(null);
  }

  return (
    <section className="games-summary" aria-labelledby="xbox-history-title">
      <div className="xbox-history-heading">
        <span className="games-summary-icon"><Gamepad2 size={18} aria-hidden="true"/></span>
        <span className="games-summary-copy">
          <h2 id="xbox-history-title">Xbox 플레이 기록</h2>
          <small>{snapshot ? `조회된 게임 ${snapshot.games.length}개` : '최근 플레이 날짜 · 게임별 누적 플레이 시간'}</small>
        </span>
      </div>
      <div className="xbox-history" aria-busy={loading}>
        <div className="xbox-history-actions">
          <button type="button" className="button secondary" disabled={loading} onClick={()=>void refresh()}>
            <RefreshCw size={14} aria-hidden="true"/>
            {loading ? '불러오는 중' : snapshot ? '새로고침' : 'Xbox 기록 불러오기'}
          </button>
          {snapshot && <small className="muted">최근 조회 {checkedAtFormat.format(new Date(snapshot.checkedAt))}</small>}
          {!!snapshot?.games.length && <GameViewToggle view={view} onChange={setView} label="Xbox 보기 방식"/>}
        </div>
        {error && <p className="form-error" role="alert">{error}{snapshot && ' 아래에는 마지막으로 저장한 기록이 표시돼요.'}</p>}
        {snapshot && <>
          {(snapshot.historyIncomplete || snapshot.limited) &&
            <p className="muted">Xbox에서 받은 플레이 기록의 일부를 표시하고 있어요.</p>}
          {snapshot.playtimeIncomplete &&
            <p className="muted">일부 게임의 플레이 시간을 조회하지 못했어요.</p>}
          {snapshot.games.length ? (
            <ul className={view==='cover'?'game-shelf-grid xbox-cover-grid':'xbox-history-list'} aria-label="Xbox에서 플레이한 게임">
              {snapshot.games.slice(0, visible).map(game=>(
                <li key={game.id} className={view==='cover'?'game-tile':undefined}>
                  {view==='cover'&&<div className="game-tile-cover">
                    <GameCover key={game.imageUrl} imageUrl={game.imageUrl} title=""/>
                  </div>}
                  <div className={view==='cover'?'game-tile-copy':undefined}>
                    <strong>{game.name}</strong>
                    <small>{game.lastPlayed ? `마지막 플레이 ${kst.format(new Date(game.lastPlayed))}` : '마지막 플레이 날짜 미기록'}</small>
                    <small className="game-tile-time">{playTime(game.minutes)}</small>
                  </div>
                  <div className="xbox-link-actions">
                    {linkedIds.has(game.id) ? <span className="badge">HUB에 연결됨</span> : <>
                      <button type="button" className="button secondary small" onClick={()=>onEdit(xboxGameDraft(game))}><Plus size={12} aria-hidden="true"/>HUB 게임으로 추가</button>
                      <button type="button" className="text-button muted" disabled={!candidates.length} onClick={()=>{setLinkEntryId('');setLinkGame(game);}}>기존 기록에 연결</button>
                    </>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">받아온 Xbox 플레이 기록이 없어요.</p>}
          {visible < snapshot.games.length &&
            <button type="button" className="button secondary" onClick={()=>setVisible(count=>count+PAGE_SIZE)}>더 보기</button>}
        </>}
      </div>
      {linkGame&&<Dialog title="기존 게임에 Xbox 기록 연결" onClose={()=>setLinkGame(null)}>
        <div className="steam-link-dialog">
          <p>‘{linkGame.name}’과 연결할 HUB 게임을 선택하세요.</p>
          <label>HUB 게임<select value={linkEntryId} onChange={event=>setLinkEntryId(event.target.value)}>
            <option value="">기존 게임을 선택해주세요</option>
            {candidates.map(entry=><option key={entry.id} value={entry.id}>{entry.title}{entry.category?` · ${entry.category}`:''}</option>)}
          </select></label>
        </div>
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={()=>setLinkGame(null)}>취소</button>
          <button type="button" className="button primary" disabled={!linkEntry||linkedIds.has(linkGame.id)} onClick={linkExisting}><Link2 size={14} aria-hidden="true"/>이 기록에 연결</button>
        </div>
      </Dialog>}
    </section>
  );
}
