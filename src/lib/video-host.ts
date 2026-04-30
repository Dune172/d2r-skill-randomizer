// Whitelist of video hosts accepted as proof of a leaderboard run.
// Match is on the URL hostname, with leading "www." stripped — entries here
// either match exactly or as a suffix after a dot (so "twitch.tv" also matches
// "clips.twitch.tv" and "m.twitch.tv").
const VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'twitch.tv',
  'streamable.com',
  'vimeo.com',
  'tiktok.com',
  'kick.com',
  'medal.tv',
];

export const VIDEO_HOSTS_LABEL = 'YouTube, Twitch, Streamable, Vimeo, TikTok, Kick, Medal';

export function isVideoUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return VIDEO_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

/**
 * Like isVideoUrl, but also rejects bare-host links (e.g. "https://youtube.com/")
 * that point at the homepage instead of a specific video. Requires the URL to
 * have either a non-trivial path segment OR a query value.
 */
export function isSpecificVideoUrl(url: string): boolean {
  if (!isVideoUrl(url)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const hasPathSegment = parsed.pathname.split('/').some((seg) => seg.length >= 3);
  const hasQueryValue = /[?&][a-z]+=[^&\s]+/i.test(parsed.search);
  return hasPathSegment || hasQueryValue;
}
