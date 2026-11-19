import { newsCategories, newsKinds, newsTopicLimit, steamNewsLimit } from '../src/lib/news.ts';

const categories = new Set(['all', ...newsCategories.map(category => category.id)]);
const dayMs = 86_400_000;
const koreaOffset = 32_400_000;
const eventWords = /\b(?:launch(?:es|ed)?|release[ds]?|out now|announc(?:e[ds]?|ement)|delay(?:ed)?|unveil(?:s|ed)?|dlc|expansion)\b|출시|공개|발표|신제품|발매|연기|확장팩/iu;
const kindPatterns = {
  update: /\b(?:patch(?:es)?|hotfix|firmware|update[ds]?|changelog)\b|패치|업데이트|펌웨어/iu,
  availability: /\b(?:in stock|restock|pre.?order|audition)\b|입고|재입고|예약\s*판매|청음|공동\s*구매/iu,
  deal: /\b(?:discount|free to keep|giveaway|on sale|sale ends|price drop|deals?)\b|할인|특가|무료\s*배포|가격\s*(?:인상|인하|변경)/iu,
  music: /\b(?:new (?:album|single|ep|record)|reissue[ds]?|remaster(?:ed)?|releas(?:e[ds]?|ing)|debut album|album of the day|album arrives|announces (?:an? |the )?(?:album|single|ep))\b|신보|새\s*앨범|발매|재발매|리마스터/iu,
  squad: /\b(?:injur(?:y|ies|ed)|fitness|team news|back in training|ruled out|returns? to training|sidelined)\b|부상|훈련\s*복귀|출전\s*여부|결장/iu,
  transfer: /\b(?:transfer[rs]?|signs?|signed|signing|contract|loan deal)\b|이적|계약|영입/iu,
  fixture: /\b(?:fixture[rs]?|kick.?off|match preview|rescheduled|broadcast|how to watch|when is|game moved)\b|킥오프|경기\s*일정|일정\s*변경|경기\s*예고|중계/iu,
  performance: /\b(?:\d+\s*fps|frame[ -]?rate|system requirements|graphics mode|performance mode)\b|프레임\s*레이트|요구\s*사양|성능\s*모드/iu,
  release: eventWords,
  review: /\breview[rs]?\b|리뷰|사용기|청음기/iu,
};
const kindEntries = Object.entries(kindPatterns);
const trimText = (value, max) => typeof value === 'string' && !/[\u0000-\u001f\u007f]/u.test(value) && value.length <= max ? value.trim() : '';

export function validateNewsTopics(value) {
  if (!Array.isArray(value) || value.length > newsTopicLimit) return null;
  const output = [];
  const ids = new Set(), apps = new Set();
  for (const item of value) {
    if (!item || !/^[a-z0-9-]{1,64}$/.test(item.id ?? '') || typeof item.id !== 'string' || ids.has(item.id) ||
      !trimText(item.label, 80) || !categories.has(item.category) || typeof item.muted !== 'boolean' ||
      !Array.isArray(item.terms) || item.terms.length > 12 || item.terms.some(term => !trimText(term, 80)) ||
      !Array.isArray(item.kinds) || item.kinds.length > Object.keys(newsKinds).length ||
      item.kinds.some(kind => typeof kind !== 'string' || !Object.hasOwn(newsKinds, kind)) ||
      (!item.terms.length && item.category === 'all')) return null;
    const app = item.steamAppId;
    if (app !== undefined) {
      if (typeof app !== 'string' || !/^[1-9]\d{0,9}$/.test(app) || Number(app) > 4_294_967_295 ||
        item.category !== 'games' || (!item.muted && apps.size >= steamNewsLimit && !apps.has(app))) return null;
      if (!item.muted) apps.add(app);
    }
    ids.add(item.id);
    output.push({ id:item.id, label:item.label.trim(), category:item.category, terms:[...new Set(item.terms.map(term => term.trim()))],
      kinds:[...new Set(item.kinds)], muted:item.muted, ...(app && { steamAppId:app }) });
  }
  return output;
}

function normalized(text) {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function termMatcher(term) {
  const value = normalized(term);
  if (!value) return () => false;
  if (/\p{Script=Hangul}/u.test(value)) {
    const phrase = value.replaceAll(' ', '');
    return text => text.replaceAll(' ', '').includes(phrase);
  }
  const phrase = ' ' + value;
  return text => text.includes(phrase + ' ') || (value.length >= 4 && text.includes(phrase + 's '));
}

export function steamNewsApp(sourceUrl) {
  return /^https:\/\/store\.steampowered\.com\/app\/([1-9]\d{0,9})\/?$/.exec(sourceUrl)?.[1];
}

function recommend(article, topics) {
  const steamApp = steamNewsApp(article.sourceUrl);
  const retailer = article.sourceUrl.startsWith('https://www.schezade.co.kr/');
  const official = Boolean(steamApp || retailer);
  const city = article.sourceUrl === 'https://www.bbc.com/sport/football/teams/manchester-city';
  if (/\b(?:sponsored|paid partnership|advertorial)\b|유료광고|협찬\s*기사/iu.test(article.title)) return null;
  const title = ' ' + normalized(article.title) + ' ';
  const text = title + normalized(article.description) + ' ';
  const titleKinds = kindEntries.filter(([,pattern]) => pattern.test(article.title)).map(([kind]) => kind);
  const detailsKinds = kindEntries.filter(([,pattern]) => pattern.test(article.description)).map(([kind]) => kind);
  const kinds = [...new Set([...titleKinds,...detailsKinds])];
  const gameNews = article.categories.includes('games') && !official;
  const routineGameGuide = gameNews &&
    /\b(?:walkthrough|beginner'?s guide|how to (?:find|get|unlock|fix|complete)|where to (?:find|get))\b|공략|얻는\s*법|찾는\s*법/iu.test(article.title);
  const comparesReleaseDate = gameNews ? article.title.match(/^(.*?)\b(?:same (?:day|date|week) as|compared to)\b/iu)?.[1] : undefined;
  const subject = comparesReleaseDate === undefined ? undefined : ' ' + normalized(comparesReleaseDate) + ' ';
  let best;
  let mutedSpecificity = -1;
  for (const topic of topics) {
    if (topic.category !== 'all' && !article.categories.includes(topic.category)) continue;
    const matchedTitle = topic.matches.some(matches => matches(title));
    const direct = (steamApp && steamApp === topic.steamAppId) || (city && topic.id === 'city');
    if (subject !== undefined && topic.matches.length && !topic.matches.some(matches => matches(subject))) continue;
    if (topic.matches.length && !direct && !matchedTitle && !topic.matches.some(matches => matches(text))) continue;
    const kind = kinds.find(value => topic.kinds.includes(value)) ?? (topic.kinds.length ? undefined : kinds[0]);
    if (routineGameGuide && topic.kinds.length && kind !== 'review') continue;
    if (topic.kinds.length && !kind) continue;
    const specificity = direct ? 3 : matchedTitle ? 2 : topic.matches.length ? 1 : 0;
    if (topic.muted) {
      mutedSpecificity = Math.max(mutedSpecificity, specificity);
      continue;
    }
    const relevance = Number(Boolean(direct || matchedTitle)) + Number(Boolean(kind && titleKinds.includes(kind))) + Number(official) * 2;
    if (!best || best.specificity < specificity || (best.specificity === specificity && best.relevance < relevance)) {
      best = { topicId:topic.id, topicLabel:topic.label, kind, official, relevance, specificity };
    }
  }
  return best && best.specificity > mutedSpecificity ? best : null;
}

const stopWords = new Set(['the','this','with','from','that','their','will','now','says','about','into','after','gets','your','what','after']);
const versionTokens = title => (title.match(/\d+(?:\.\d+)*/gu) ?? []).join('|');
function performanceDetails(title) {
  const platforms = title.match(/\b(?:playstation 5|ps5)(?: pro)?\b|\bxbox series [xs]\b|\bswitch 2\b/giu) ?? [];
  const rates = Array.from(title.matchAll(/\b(\d{2,3})\s*fps\b/giu), match => match[1]);
  return {
    platforms:new Set(platforms.map(value => value.toLowerCase().replace('playstation 5','ps5'))),
    rates:new Set(rates),
    limited:/\b(?:not|no|without|unable|cannot|can['’]t|won['’]t|locked at|capped at)\b|미지원|불가|제한/iu.test(title),
  };
}
function sameStory(a, b) {
  if (a.rec.topicId !== b.rec.topicId || a.rec.kind !== b.rec.kind ||
    Math.abs(a.time - b.time) > 36 * 3_600_000) return false;
  if (a.steamApp && b.steamApp && a.steamApp !== b.steamApp) return false;
  if (a.title === b.title) return true;
  if (a.article.sourceName === b.article.sourceName) return false;
  if (a.performance && b.performance && a.performance.limited === b.performance.limited &&
    [...a.performance.platforms].some(value => b.performance.platforms.has(value)) &&
    [...a.performance.rates].some(value => b.performance.rates.has(value))) return true;
  if (a.version !== b.version || a.words.size < 5 || b.words.size < 5) return false;
  const common = [...a.words].filter(word => b.words.has(word)).length;
  return common / (a.words.size + b.words.size - common) >= 0.82;
}

export function rankNews(articles, topics) {
  const rules = topics.map(topic => ({ ...topic, matches:topic.terms.map(termMatcher) }));
  const candidates = articles.flatMap(article => {
    const rec = recommend(article, rules);
    if (!rec) return [];
    const time = Date.parse(article.publishedAt), title = normalized(article.title);
    const rank = Math.floor((time + koreaOffset) / dayMs) * 8 + rec.relevance;
    return [{ article, rec, rank, time, title, version:versionTokens(article.title), steamApp:steamNewsApp(article.sourceUrl),
      performance:rec.kind === 'performance' ? performanceDetails(article.title) : undefined,
      words:new Set(title.split(' ').filter(word => word.length > 2 && !stopWords.has(word))) }];
  });
  const groups = new Map();
  candidates.sort((a, b) => Number(b.rec.official) - Number(a.rec.official) || b.time - a.time || a.article.id.localeCompare(b.article.id));
  for (const candidate of candidates) {
    const key = candidate.rec.topicId;
    const bucket = groups.get(key) ?? [];
    const existing = bucket.find(entry => sameStory(entry, candidate));
    if (existing) {
      if (existing.related.length < 4 && !existing.related.some(item => item.sourceName === candidate.article.sourceName) &&
        existing.article.sourceName !== candidate.article.sourceName) {
        const { id, title, url, sourceName } = candidate.article;
        existing.related.push({ id, title, url, sourceName });
      }
    } else {
      bucket.push({ ...candidate, related:[] });
      groups.set(key, bucket);
    }
  }
  return [...groups.values()].flat().sort((a, b) => b.rank - a.rank || b.time - a.time || a.article.id.localeCompare(b.article.id)).map(entry => {
    const { topicId, topicLabel, kind, official } = entry.rec;
    return { ...entry.article, rank:entry.rank, recommendation:{ topicId, topicLabel, kind, official },
      ...(entry.related.length && { related:entry.related }) };
  });
}
