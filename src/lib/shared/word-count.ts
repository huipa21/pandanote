/**
 * Word count for a note body.
 *
 * - Latin-script words: each run of Latin letters/digits (apostrophes and
 *   hyphens may join parts, e.g. "don't", "well-known") counts as one word.
 * - CJK characters: each Han, Hiragana, Katakana, or Hangul syllable counts
 *   as one unit.
 *
 * Markdown punctuation is not a letter or digit, so it adds nothing.
 */
const LATIN_WORD =
  /[\p{Script=Latin}\p{Nd}]+(?:['’-][\p{Script=Latin}\p{Nd}]+)*/gu;
const CJK_CHAR =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

export function countWords(text: string): number {
  const latin = text.match(LATIN_WORD)?.length ?? 0;
  const cjk = text.match(CJK_CHAR)?.length ?? 0;
  return latin + cjk;
}
