import { describe, expect, it } from 'vitest';
import { countWords } from '#lib/shared/word-count.ts';

describe('countWords', () => {
  it('counts Latin words separated by spaces or punctuation', () => {
    expect(countWords('Hello, world! This is a note.')).toBe(6);
    expect(countWords("don't stop well-known 2024")).toBe(4);
  });

  it('counts each CJK character as one unit', () => {
    expect(countWords('你好世界')).toBe(4);
    expect(countWords('こんにちは カタカナ')).toBe(9);
    expect(countWords('안녕')).toBe(2);
  });

  it('counts mixed text and ignores markdown punctuation', () => {
    expect(countWords('# 标题 hello\n\n- **bold** 中文')).toBe(6);
  });

  it('returns zero for empty or symbol-only text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('--- *** ###')).toBe(0);
  });
});
