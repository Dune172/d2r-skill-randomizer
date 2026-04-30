// Tiny embedded blocklist for leaderboard names. Substring match, case-insensitive.
// Goal: catch the obvious slurs/expletives. Not a comprehensive filter — pair with
// the admin DELETE endpoint for anything that slips through.
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'bastard', 'dick', 'cock',
  'pussy', 'whore', 'slut', 'fag', 'faggot', 'nigger', 'nigga', 'kike',
  'spic', 'chink', 'gook', 'tranny', 'retard', 'rape', 'rapist', 'nazi',
  'hitler', 'pedo', 'pedophile', 'cum', 'jizz', 'twat',
];

export function isClean(name: string): boolean {
  const lower = name.toLowerCase();
  // Strip non-letters so "f.u.c.k" or "n1gger" still get caught (best-effort).
  const stripped = lower.replace(/[^a-z]/g, '');
  for (const word of BLOCKED) {
    if (lower.includes(word)) return false;
    if (stripped.includes(word)) return false;
  }
  return true;
}
