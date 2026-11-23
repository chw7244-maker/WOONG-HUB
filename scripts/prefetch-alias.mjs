/**
 * Next's segment prefetch asks for a flat file name, but the static export writes it into folders:
 * `/audio/__next.$d$section/__PAGE__.txt` is requested as `/audio/__next.$d$section.__PAGE__.txt`, and a
 * two-level page such as `/games/steam/__next.games/steam/__PAGE__.txt` as `/games/steam/__next.games.steam.__PAGE__.txt`.
 * Returns the flat name for an exported page segment file, or null when the file needs no alias.
 */
export function prefetchAlias(key) {
  const match = key.match(/^(.*\/)(__next\.[^/].*)\/__PAGE__\.txt$/);
  return match ? `${match[1]}${match[2].split('/').join('.')}.__PAGE__.txt` : null;
}
