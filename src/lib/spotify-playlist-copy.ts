import type { LocalPlaylistTrack } from './local-playlist.ts';
import type { SpotifyEntity } from './spotify-account.ts';

const searchable = (value: string) => value.replace(/["\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim();
const key = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export function spotifyTrackQuery(track: LocalPlaylistTrack) {
  const title = searchable(track.title);
  const artist = track.artist === '아티스트 미상' ? '' : searchable(track.artist);
  return artist ? `track:"${title.slice(0, 67)}" artist:"${artist.slice(0, 34)}"` : title.slice(0, 120);
}

export function spotifyTrackChoices(track: LocalPlaylistTrack, items: SpotifyEntity[]) {
  const title = key(track.title), artist = track.artist === '아티스트 미상' ? '' : key(track.artist), album = key(track.album);
  const candidates = [...new Map(items.filter(item => item.type === 'track' && item.playable).map(item => [item.id, item])).values()];
  const exact = candidates.filter(item => title && artist && key(item.name) === title &&
    (key(item.artist) === artist || item.artist.split(', ').some(name => key(name) === artist)) &&
    (!track.seconds || !item.durationMs || Math.abs(item.durationMs / 1000 - track.seconds) <= 8));
  const sameAlbum = exact.filter(item => album && key(item.albumName) === album);
  const recommended = sameAlbum.length === 1 ? sameAlbum[0] : exact.length === 1 ? exact[0] : null;
  return { candidates, recommended: recommended?.id ?? '' };
}
