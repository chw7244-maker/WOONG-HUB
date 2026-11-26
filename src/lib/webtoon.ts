export type WebtoonCover = { source: 'kmas'; imageUrl: string };
export type WebtoonCoverCandidate = {
  title: string;
  platform: string;
  creator: string;
  cover: WebtoonCover;
};

export function validateWebtoonCover(value: unknown): WebtoonCover {
  if (!value || typeof value !== 'object') throw new Error('웹툰 표지 정보를 확인해주세요.');
  const { source, imageUrl } = value as WebtoonCover;
  if (source !== 'kmas' || typeof imageUrl !== 'string' || imageUrl.length > 500) {
    throw new Error('웹툰 표지 정보를 확인해주세요.');
  }
  const url = new URL(imageUrl);
  if (url.protocol !== 'https:' || !['www.kmas.or.kr', 'kmas.or.kr'].includes(url.hostname) ||
    url.href.length > 500 || url.username || url.password || url.port || url.hash ||
    [...url.searchParams.keys()].some(key => /prvkey|token|secret/i.test(key))) {
    throw new Error('웹툰 표지 주소를 확인해주세요.');
  }
  return { source, imageUrl: url.href };
}

export function webtoonPlatform(link: string): string {
  try {
    const { protocol, hostname, pathname, searchParams } = new URL(link);
    if (!['http:', 'https:'].includes(protocol)) return '';
    if (['comic.naver.com', 'm.comic.naver.com'].includes(hostname) &&
      /^\/webtoon\/(list|detail)\/?$/.test(pathname) && /^\d+$/.test(searchParams.get('titleId') ?? '')) return '네이버웹툰';
    if (hostname === 'webtoon.kakao.com' && /^\/content\/.+\/\d+\/?$/.test(pathname)) return '카카오웹툰';
    if (['page.kakao.com', 'm.page.kakao.com'].includes(hostname) &&
      (/^\/content\/\d+\/?$/.test(pathname) || (/^\/home\/?$/.test(pathname) && /^\d+$/.test(searchParams.get('seriesId') ?? '')))) return '카카오페이지';
  } catch {}
  return '';
}

export const webtoonMatchKey = (value: string) => value.normalize('NFC').toLowerCase().replace(/\s+/g, '');
