import { newsCategories, newsKinds, newsSourceHost, newsSourcePreferenceLimit, newsTopicLimit, steamNewsLimit } from '../src/lib/news.ts';

const categories = new Set(['all', ...newsCategories.map(category => category.id)]);
const dayMs = 86_400_000;
const koreaOffset = 32_400_000;
const eventWords = /\b(?:launch(?:es|ed)?|release[ds]?|out now|announc(?:e[ds]?|ement)|delay(?:ed)?|unveil(?:s|ed)?|dlc|expansion)\b|출시|공개|발표|신제품|발매|연기|확장팩|개봉|첫\s*방송|방영\s*확정|편성\s*확정/iu;
const kindPatterns = {
  update: /\b(?:patch(?:es)?|hotfix|firmware|update[ds]?|changelog)\b|패치|업데이트|펌웨어/iu,
  availability: /\b(?:in stock|restock|pre.?order|audition)\b|입고|재입고|예약\s*판매|청음|공동\s*구매/iu,
  deal: /\b(?:discount|free to keep|giveaway|on sale|sale ends|price drop|deals?)\b|할인|특가|무료\s*배포|가격\s*(?:인상|인하|변경|근황)/iu,
  music: /\b(?:new (?:album|single|ep|record)|reissue[ds]?|remaster(?:ed)?|releas(?:e[ds]?|ing)|debut album|album of the day|album arrives|announces (?:an? |the )?(?:album|single|ep))\b|신보|신곡|새\s*(?:앨범|싱글)|발매|재발매|리마스터/iu,
  serialization: /연재|완결|휴재|웹툰화|시즌\s*\d+\s*(?:복귀|시작)|신작\s*웹툰/iu,
  squad: /\b(?:injur(?:y|ies|ed)|fitness|team news|back in training|ruled out|returns? to training|sidelined)\b|부상|훈련\s*복귀|출전\s*여부|결장/iu,
  transfer: /\b(?:transfer[rs]?|signs?|signed|signing|contract|loan deal)\b|이적|계약|영입/iu,
  fixture: /\b(?:fixture[rs]?|kick.?off|match preview|rescheduled|broadcast|how to watch|when is|game moved)\b|킥오프|경기\s*일정|일정\s*변경|경기\s*예고|중계/iu,
  performance: /\b(?:\d+\s*fps|frame[ -]?rate|system requirements|graphics mode|performance mode|benchmarks?)\b|프레임\s*레이트|요구\s*사양|성능\s*(?:모드|비교|테스트)|벤치마크/iu,
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

const sourceHostPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
export function validateNewsSourcePreferences(value) {
  if (!Array.isArray(value) || value.length > newsSourcePreferenceLimit) return null;
  const output = [], seen = new Set();
  for (const item of value) {
    const host = item?.host;
    const label = trimText(item?.label, 80);
    if (typeof host !== 'string' || host.length > 253 || !sourceHostPattern.test(host) ||
      newsSourceHost('https://' + host) !== host || seen.has(host) || !label ||
      (item.mode !== 'more' && item.mode !== 'less')) return null;
    seen.add(host);
    output.push({ host, label, mode:item.mode });
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
  const city = article.sourceUrl === 'https://kr.mancity.com/news';
  const official = Boolean(steamApp || retailer || city);
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

const webtoonEventPatterns = [
  ['resume', /연재(?:를)?\s*(?:재개|재시작|복귀)|휴재(?:를)?\s*(?:끝|종료)|(?:새|새로운)\s*시즌|시즌\s*\d+\s*(?:복귀|재개|공개|시작)/u],
  ['completion', /완결|최종\s*화|마지막\s*(?:화|회차)|연재(?:를)?\s*종료/u],
  ['hiatus', /휴재|연재(?:를)?\s*(?:(?:일시|잠정)\s*)?(?:중단|중지)/u],
  ['start', /신작\s*웹툰|웹툰\s*신작|(?:첫|신규|동시)\s*연재|연재(?:를)?\s*(?:시작|개시)|웹툰(?:으로)?\s*(?:독점\s*)?공개/u],
];
const koreanTitleParticle = /(?:으로|에서|에게|까지|부터|의|이|가|은|는|을|를|과|와|도|로)$/u;

function indexWebtoonTitles(works) {
  const titles = new Map();
  let maxLength = 0;
  for (const work of works) {
    const title = normalized(work.title).replaceAll(' ', '');
    if (!title) continue;
    if (!titles.has(title)) titles.set(title, []);
    titles.get(title).push(work);
    maxLength = Math.max(maxLength, title.length);
  }
  return { titles, maxLength };
}

function recommendWebtoon(article, index) {
  if (!index.maxLength || !article.categories.includes('webtoon')) return null;
  const event = (webtoonEventPatterns.find(([, pattern]) => pattern.test(article.title)) ??
    webtoonEventPatterns.find(([, pattern]) => pattern.test(article.description)))?.[0];
  if (!event) return null;
  const words = normalized(article.title).split(' ');
  let matched, longest = 0;
  for (let start = 0; start < words.length; start++) {
    let phrase = '';
    for (let end = start; end < words.length; end++) {
      phrase += words[end];
      if (phrase.length > index.maxLength + 2) break;
      for (const title of [phrase, phrase.replace(koreanTitleParticle, '')]) {
        if (title.length <= longest) continue;
        const work = index.titles.get(title)?.find(item => item.events.includes(event));
        if (work) { matched = work; longest = title.length; }
      }
    }
  }
  if (!matched) return null;
  const official = article.sourceUrl === 'https://www.webtoonscorp.com/ko/media';
  return { topicId:'webtoon:'+matched.id, topicLabel:matched.title, kind:event === 'start' ? 'release' : 'serialization',
    official, relevance:official ? 4 : 2, workId:matched.id, webtoonEvent:event };
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
  if (a.rec.topicId !== b.rec.topicId || a.rec.kind !== b.rec.kind || a.rec.webtoonEvent !== b.rec.webtoonEvent ||
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

export function rankNews(articles, topics, sourcePreferences = [], followedWebtoons = []) {
  const rules = topics.map(topic => ({ ...topic, matches:topic.terms.map(termMatcher) }));
  const sourceModes = new Map(sourcePreferences.map(source => [source.host, source.mode]));
  const webtoons = indexWebtoonTitles(followedWebtoons);
  const candidates = articles.flatMap(article => {
    if (/\b(?:sponsored|paid partnership|advertorial)\b|유료광고|협찬\s*기사/iu.test(article.title)) return [];
    const rec = recommendWebtoon(article, webtoons) ?? recommend(article, rules);
    if (!rec) return [];
    const time = Date.parse(article.publishedAt), title = normalized(article.title);
    const mode = sourceModes.size ? sourceModes.get(newsSourceHost(article.sourceUrl)) : undefined;
    const sourceWeight = mode === 'more' ? 2 : mode === 'less' ? -1 : 0;
    const rank = Math.floor((time + koreaOffset) / dayMs) * 8 + rec.relevance + sourceWeight;
    return [{ article, rec, rank, sourceWeight, time, title, version:versionTokens(article.title), steamApp:steamNewsApp(article.sourceUrl),
      performance:rec.kind === 'performance' ? performanceDetails(article.title) : undefined,
      words:new Set(title.split(' ').filter(word => word.length > 2 && !stopWords.has(word))) }];
  });
  const groups = new Map();
  candidates.sort((a, b) => Number(b.rec.official) - Number(a.rec.official) || b.sourceWeight - a.sourceWeight || b.time - a.time || a.article.id.localeCompare(b.article.id));
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
    const { topicId, topicLabel, kind, official, workId, webtoonEvent } = entry.rec;
    return { ...entry.article, rank:entry.rank, recommendation:{ topicId, topicLabel, kind, official,
      ...(entry.sourceWeight > 0 && { preferredSource:true }), ...(workId && { workId, webtoonEvent }) },
      ...(entry.related.length && { related:entry.related }) };
  });
}
