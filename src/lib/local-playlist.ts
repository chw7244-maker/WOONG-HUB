import { safePath, type LocalAlbum, type LocalTrack } from './local-music.ts';

export const playlistCandidateLimit = 120;
export const playlistTrackLimit = 25;
export const playlistPromptLimit = 240;
export type LocalPlaylistTrack = Pick<LocalTrack, 'path' | 'title' | 'artist' | 'album' | 'seconds'>;
export type SavedLocalPlaylist = { folder: string; tracks: LocalPlaylistTrack[] };
const titleLimit = 80;
const oneLine = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
const searchKey = (value: string) => value.normalize('NFC').toLowerCase().replace(/\s+/g, '');

/** Exact mentions get priority. Then take a different track from each album per pass. */
export function playlistCandidates(albums: LocalAlbum[], prompt: string, random = Math.random) {
  const key = searchKey(prompt);
  const groups = albums.filter(album => album.tracks.length).map(({ tracks }) => ({
    tracks, offset: Math.floor(random() * tracks.length),
  }));
  const result = new Map<string, LocalTrack>();
  for (const { tracks } of groups) {
    for (const track of tracks) {
      if (result.size >= playlistCandidateLimit / 2) break;
      if ([track.title, track.artist, track.genre].some(value => {
        const term = searchKey(value);
        return term.length >= 2 && key.includes(term) && !term.endsWith('미상');
      })) result.set(track.path, track);
    }
  }
  const start = Math.floor(random() * groups.length);
  const rounds = Math.max(0, ...groups.map(group => group.tracks.length));
  for (let round = 0; round < rounds && result.size < playlistCandidateLimit; round++) {
    for (let i = 0; i < groups.length && result.size < playlistCandidateLimit; i++) {
      const group = groups[(start + i) % groups.length];
      if (round >= group.tracks.length) continue;
      const track = group.tracks[(group.offset + round) % group.tracks.length];
      result.set(track.path, track);
    }
  }
  return [...result.values()];
}

export function playlistRequest(prompt: string, count: number, tracks: LocalTrack[]) {
  return {
    prompt: oneLine(prompt), count: Math.min(count, tracks.length),
    tracks: tracks.map(({ title, artist, genre }) => ({
      title: oneLine(title).slice(0, 160),
      artist: oneLine(artist).slice(0, 120),
      genre: oneLine(genre).slice(0, 60),
    })),
  };
}

export function validateLocalPlaylist(input: unknown): SavedLocalPlaylist {
  const value = input as SavedLocalPlaylist;
  const validText = (text: unknown, max: number) => typeof text === 'string' && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text);
  const invalid = () => new Error('내 음원 플레이리스트의 곡 정보를 확인해주세요.');
  if (!value || !validText(value.folder, 200) || !Array.isArray(value.tracks) ||
    !value.tracks.length || value.tracks.length > playlistTrackLimit) throw invalid();

  const paths = new Set<string>();
  const tracks = value.tracks.map(track => {
    if (!track || typeof track.path !== 'string' || !safePath(track.path) || paths.has(track.path) ||
      !validText(track.title, 300) || !track.title.trim() || !validText(track.artist, 300) || !validText(track.album, 300) ||
      (track.seconds !== null && (!Number.isInteger(track.seconds) || track.seconds < 0 || track.seconds > 1_000_000))) throw invalid();
    const { path, title, artist, album, seconds } = track;
    paths.add(path);
    return { path, title, artist, album, seconds };
  });
  return { folder: value.folder, tracks };
}

export function playlistExport(title: string, tracks: LocalPlaylistTrack[]) {
  const name = oneLine(title).slice(0, titleLimit) || 'AI 플레이리스트';
  const basename = name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || 'AI 플레이리스트';
  const lines = ['#EXTM3U', `#PLAYLIST:${name}`];
  for (const track of tracks) {
    if (!safePath(track.path)) throw new Error('음원 경로를 확인해주세요.');
    lines.push(`#EXTINF:${track.seconds ?? -1},${oneLine(track.artist)} - ${oneLine(track.title)}`, `./${track.path}`);
  }
  return { filename: `HUB - ${basename}.m3u8`, content: lines.join('\n') + '\n' };
}
