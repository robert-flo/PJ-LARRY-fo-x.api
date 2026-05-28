// Shared lightweight NLP helpers. Deterministic, no external models.

export const STOPWORDS = new Set([
  "a","an","the","and","or","but","if","then","else","for","of","to","in","on",
  "at","by","with","from","as","is","are","was","were","be","been","being","this",
  "that","these","those","it","its","i","you","we","they","he","she","them","me",
  "my","your","our","their","what","which","who","whom","how","why","when","where",
  "do","does","did","done","can","could","should","would","will","shall","may",
  "about","into","over","than","so","not","no","yes","up","down","out","just",
  "people","really","actually","right","now","using","use","get","got","like",
  "x","twitter","post","posts","tweet","tweets","thread","via","amp","rt",
  // research-intent filler: common in prompts, near-zero search signal, and
  // AND-ing them over-constrains queries to zero results
  "real","world","experience","experiences","thing","things","stuff","way","ways",
  "lot","lots","much","many","around","regarding","online","recent","recently",
  "current","currently","new","latest","today","lately","said","saying","say",
]);

const TOKEN_RE = /[a-z0-9][a-z0-9'+#._-]*/gi;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? []).filter((t) => t.length > 1);
}

export function keywords(text: string, max = 8): string[] {
  const freq = new Map<string, number>();
  for (const tok of tokenize(text)) {
    if (STOPWORDS.has(tok)) continue;
    freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }
  // Frequency desc; stable sort preserves insertion (intent) order on ties,
  // so we keep the user's leading terms rather than promoting long filler words.
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([t]) => t);
}

// Quoted "phrases" are preserved verbatim as multi-word terms.
export function extractQuoted(text: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const phrase = m[1];
    if (phrase) out.push(phrase.trim());
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function contentTokens(text: string): Set<string> {
  return new Set(tokenize(text).filter((t) => !STOPWORDS.has(t) && t.length > 2));
}

export const PAIN_WORDS = [
  "problem","issue","issues","bug","bugs","broken","breaks","broke","fails","failing",
  "frustrating","frustrated","annoying","hate","struggling","struggle","painful","pain",
  "doesn't","cant","can't","won't","wtf","terrible","awful","worst","slow","confusing",
  "nightmare","stuck","error","errors","crash","crashes","regression","disappointed",
];
export const WIN_WORDS = [
  "love","great","awesome","amazing","finally","solved","fixed","works","working",
  "workaround","figured","tip","tips","recommend","recommended","best","fast","clean",
  "elegant","wins","win","shipped","game-changer","gamechanger","huge","incredible","nailed",
];
export const QUESTION_WORDS = [
  "how","why","what","which","anyone","vs","versus","alternative","alternatives",
  "recommend","should","best way","thoughts","help","?",
];

export type Sentiment = "pain" | "win" | "question" | "neutral";

export function classifySentiment(text: string): Sentiment {
  const lower = text.toLowerCase();
  const toks = new Set(tokenize(lower));
  const count = (words: string[]) =>
    words.reduce((acc, w) => acc + (w.includes(" ") ? (lower.includes(w) ? 1 : 0) : toks.has(w) ? 1 : 0), 0);
  const pain = count(PAIN_WORDS);
  const win = count(WIN_WORDS);
  const q = (lower.includes("?") ? 1 : 0) + count(QUESTION_WORDS);
  const max = Math.max(pain, win, q);
  if (max === 0) return "neutral";
  if (pain === max) return "pain";
  if (win === max) return "win";
  return "question";
}
