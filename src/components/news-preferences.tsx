'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Dialog from './dialog';
import { newsCategories, newsKinds, newsTopicLimit, steamNewsLimit, type NewsKind, type NewsPreferences, type NewsTopic } from '@/lib/news';
import { steamAppId } from '@/lib/games';
import type { Entry } from '@/lib/store';

const kindChoices = Object.entries(newsKinds) as [NewsKind,string][];

export function NewsPreferencesDialog({ preferences, games, onSave, onClose }: {
  preferences: NewsPreferences;
  games: Entry[];
  onSave: (preferences: NewsPreferences) => Promise<void>;
  onClose: () => void;
}) {
  const [topics, setTopics] = useState(preferences.topics);
  const [sourcePreferences, setSourcePreferences] = useState(preferences.sourcePreferences ?? []);
  const [termInputs, setTermInputs] = useState<Record<string,string>>({});
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<NewsTopic['category']>('all');
  const [gameId, setGameId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const game = games.find(entry => entry.id === gameId);

  function addTopic() {
    const name = (game?.title ?? label).trim().slice(0,80);
    if (!name) return;
    const id = game && (game.game?.steam?.appId ?? game.game?.steamAccount?.appId ?? steamAppId(game.url));
    const appId = id ? String(id) : undefined;
    const existing = topics.find(topic => topic.label.toLowerCase() === name.toLowerCase() || (appId && appId === topic.steamAppId));
    if (existing) {
      setError('이미 추가된 주제예요. 아래에서 팔로우 상태를 바꿀 수 있어요.');
      return;
    }
    const terms = [...new Set([name, game?.game?.steam?.name.slice(0,80)].filter((term): term is string => Boolean(term)))];
    const topic: NewsTopic = { id:crypto.randomUUID(), label:name, terms, category:game ? 'games' : category,
      kinds:game ? ['release','update','deal'] : [], muted:false, ...(appId && { steamAppId:appId }) };
    setTopics([topic, ...topics]);
    setLabel('');
    setGameId('');
    setError('');
  }

  function edit(id: string, patch: Partial<NewsTopic>) {
    setTopics(current => current.map(topic => topic.id === id ? { ...topic, ...patch } : topic));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const cleaned = topics.map(topic => {
      const input = termInputs[topic.id];
      const terms = input === undefined ? topic.terms : [...new Set(input.split(',').map(term => term.trim()).filter(Boolean))];
      return { ...topic, terms };
    });
    if (cleaned.some(topic => (topic.category === 'all' && !topic.terms.length) || topic.terms.length > 12 || topic.terms.some(term => term.length > 80))) {
      setError('별칭은 최대 12개이고 하나당 80자까지예요. 전체 분야를 고른 주제에는 별칭을 하나 이상 입력해주세요.');
      return;
    }
    if (new Set(cleaned.filter(topic => !topic.muted && topic.steamAppId).map(topic => topic.steamAppId)).size > steamNewsLimit) {
      setError(`Steam 공식 공지를 동시에 팔로우할 수 있는 게임은 ${steamNewsLimit}개까지예요.`);
      return;
    }
    setBusy(true);
    setError('');
    try { await onSave({ revision:preferences.revision, topics:cleaned, sourcePreferences }); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '관심 설정을 저장하지 못했어요.'); }
    finally { setBusy(false); }
  }

  return <Dialog title="관심 뉴스 설정" onClose={() => { if (!busy) onClose(); }} className="news-preferences-dialog">
    <form onSubmit={save}>
      <div className="news-preference-body">
        <div className="news-topic-add">
          <label>새 주제<input value={label} placeholder="아티스트, 게임, 장비 이름" maxLength={80} onChange={event => { setLabel(event.target.value); setGameId(''); }}/></label>
          <label>분야<select value={category} onChange={event => setCategory(event.target.value as NewsTopic['category'])}>
            <option value="all">전체</option>
            {newsCategories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <button className="button secondary" type="button" disabled={busy || !label.trim() || topics.length >= newsTopicLimit} onClick={addTopic}><Plus size={16}/>주제 추가</button>
        </div>
        {!!games.length && <div className="news-topic-add news-game-add">
          <label>내 게임에서 추가<select value={gameId} onChange={event => { setGameId(event.target.value); setLabel(''); }}>
            <option value="">게임 선택</option>
            {games.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
          </select></label>
          <button type="button" className="button secondary" disabled={busy || !game || topics.length >= newsTopicLimit} onClick={addTopic}><Plus size={16}/>게임 추가</button>
        </div>}
        <section className="news-source-preferences" aria-labelledby="news-source-preferences-heading">
          <div className="news-source-preference-heading">
            <h3 id="news-source-preferences-heading">출처 선호</h3>
            {sourcePreferences.length > 0 && <button type="button" className="text-button muted" disabled={busy} onClick={() => setSourcePreferences([])}>출처 선호 초기화</button>}
          </div>
          {sourcePreferences.length ? [...sourcePreferences].sort((a, b) => a.label.localeCompare(b.label, 'ko')).map(source => <label className="news-source-preference" key={source.host}>
            <span>{source.label}<small>{source.host}</small></span>
            <select aria-label={`${source.label} 출처 선호`} value={source.mode} disabled={busy} onChange={event => {
              const mode = event.target.value;
              setSourcePreferences(current => mode === 'default' ? current.filter(item => item.host !== source.host)
                : current.map(item => item.host === source.host ? { ...item, mode:mode === 'more' ? 'more' : 'less' } : item));
            }}>
              <option value="more">더 보기</option>
              <option value="less">덜 보기</option>
              <option value="default">기본으로 되돌리기</option>
            </select>
          </label>) : <p>기사 옵션에서 출처를 더 보거나 덜 보도록 설정할 수 있어요.</p>}
        </section>
        <div className="news-topic-list">
          {topics.map(topic => <details className="news-topic-setting" key={topic.id}>
            <summary><strong>{topic.label}</strong><small>{topic.muted ? '덜 보기' : '팔로우 중'}{topic.steamAppId ? ' · Steam 공식 공지' : ''}</small></summary>
            <div className="news-topic-fields">
              <label className="news-topic-muted"><input type="checkbox" checked={topic.muted} onChange={event => edit(topic.id,{ muted:event.target.checked })}/>이 주제 덜 보기</label>
              <label>별칭 <small>쉼표로 구분</small><input maxLength={1000} value={termInputs[topic.id] ?? topic.terms.join(', ')} placeholder="별칭이 비어 있으면 분야로만 찾습니다"
                onChange={event => setTermInputs({ ...termInputs, [topic.id]:event.target.value })}/></label>
              <fieldset><legend>기사 유형 <small>선택이 없으면 전체 유형</small></legend>
                <div className="news-kind-choices">{kindChoices.map(([kind,name]) => <label key={kind}>
                  <input type="checkbox" checked={topic.kinds.includes(kind)} onChange={event => edit(topic.id,{
                    kinds:event.target.checked ? [...topic.kinds,kind] : topic.kinds.filter(value => value !== kind),
                  })}/>{name}
                </label>)}</div>
              </fieldset>
              <button className="text-button muted" type="button" aria-label={`${topic.label} 주제 제거`} onClick={() => setTopics(current => current.filter(item => item.id !== topic.id))}><Trash2 size={14}/>주제 제거</button>
            </div>
          </details>)}
          {!topics.length && <p className="muted">주제를 추가하면 관심 뉴스에서 관련 기사를 찾을 수 있어요.</p>}
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
      </div>
      <div className="dialog-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>취소</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? '저장 중' : '설정 저장'}</button>
      </div>
    </form>
  </Dialog>;
}
