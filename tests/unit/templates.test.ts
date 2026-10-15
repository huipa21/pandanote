import { describe, expect, it } from 'vitest';
import {
  insertTemplateText,
  isBlankTemplateBody,
  normalizeTemplateBody,
  normalizeTemplateName,
  referencesAttachment,
  templateCommandSchema,
  templateExcerpt,
  templateMatches,
  templateNameKey,
} from '../../src/lib/shared/templates.ts';

const id = '0b1f7f6e-3c1d-4a8e-9f10-2b3c4d5e6f70';

describe('template names', () => {
  it('trims and keeps NFC, rejects empty, long and control-character names', () => {
    expect(normalizeTemplateName('  Weekly review  ')).toBe('Weekly review');
    expect(normalizeTemplateName('周报')).toBe('周报');
    expect(normalizeTemplateName('   ')).toBeNull();
    expect(normalizeTemplateName('a'.repeat(61))).toBeNull();
    expect(normalizeTemplateName('a'.repeat(60))).toBe('a'.repeat(60));
    expect(normalizeTemplateName('bad\nname')).toBeNull();
    expect(normalizeTemplateName('bad\u0007name')).toBeNull();
  });

  it('counts code points, not UTF-16 units', () => {
    expect(normalizeTemplateName('😀'.repeat(60))).not.toBeNull();
    expect(normalizeTemplateName('😀'.repeat(61))).toBeNull();
  });

  it('identifies names case-insensitively, width-insensitively and ignoring extra spaces', () => {
    expect(templateNameKey('Daily  Note')).toBe(templateNameKey('daily note'));
    expect(templateNameKey('ＡＢＣ')).toBe(templateNameKey('abc'));
    expect(templateNameKey('Café')).toBe(templateNameKey('CAFÉ'));
    expect(templateNameKey('日记')).not.toBe(templateNameKey('日記'));
  });
});

describe('template bodies', () => {
  it('stores LF line endings and detects blank bodies', () => {
    expect(normalizeTemplateBody('a\r\nb\rc')).toBe('a\nb\nc');
    expect(isBlankTemplateBody(' \n\t ')).toBe(true);
    expect(isBlankTemplateBody('x')).toBe(false);
  });

  it('refuses links and images that point at attachments', () => {
    expect(referencesAttachment('![photo](attachment:abc)')).toBe(true);
    expect(referencesAttachment('[file](attachment:abc)')).toBe(true);
    expect(referencesAttachment('![x][ref]\n\n[ref]: attachment:abc')).toBe(
      true,
    );
  });

  it('allows ordinary text, code examples and external links', () => {
    expect(referencesAttachment('Use `![x](attachment:id)` in notes')).toBe(
      false,
    );
    expect(referencesAttachment('```\n![x](attachment:id)\n```')).toBe(false);
    expect(referencesAttachment('[site](https://example.com)')).toBe(false);
    expect(referencesAttachment('plain attachment: text')).toBe(false);
  });
});

describe('template search', () => {
  const template = {
    name: 'Weekly 周报',
    bodyMarkdown: '## Goals\n- rest #Work',
  };

  it('matches name or body, case-insensitively, with every term required', () => {
    expect(templateMatches(template, '')).toBe(true);
    expect(templateMatches(template, 'WEEKLY')).toBe(true);
    expect(templateMatches(template, '周报')).toBe(true);
    expect(templateMatches(template, 'goals rest')).toBe(true);
    expect(templateMatches(template, 'goals missing')).toBe(false);
  });

  it('treats operators and punctuation as literal text', () => {
    expect(templateMatches(template, 'AND')).toBe(false);
    expect(templateMatches(template, '#Work')).toBe(true);
    expect(templateMatches(template, '(周报')).toBe(false);
  });
});

describe('template excerpts', () => {
  it('uses the first non-blank line and truncates by code point', () => {
    expect(templateExcerpt('\n  \n## Title\nmore')).toBe('## Title');
    expect(templateExcerpt('😀'.repeat(5), 3)).toBe('😀😀😀…');
    expect(templateExcerpt('')).toBe('');
  });
});

describe('inserting a template at the caret', () => {
  it('inserts into an empty note without extra separators', () => {
    expect(insertTemplateText('', 0, 0, 'Hello')).toEqual({
      text: 'Hello',
      caret: 5,
    });
  });

  it('separates text before and after with one blank line', () => {
    expect(insertTemplateText('Intro', 5, 5, 'T')).toEqual({
      text: 'Intro\n\nT',
      caret: 8,
    });
    expect(insertTemplateText('AB', 1, 1, 'T')).toEqual({
      text: 'A\n\nT\n\nB',
      caret: 4,
    });
  });

  it('adds only the missing newlines when the caret is already after line breaks', () => {
    expect(insertTemplateText('Intro\n', 6, 6, 'T')).toEqual({
      text: 'Intro\n\nT',
      caret: 8,
    });
    expect(insertTemplateText('Intro\n\n', 7, 7, 'T')).toEqual({
      text: 'Intro\n\nT',
      caret: 8,
    });
  });

  it('replaces the selected range and drops newlines at the template edges', () => {
    // The selection (SEL) is replaced; separators sit at the template's edges.
    expect(insertTemplateText('x SEL y', 2, 5, '\nT\n')).toEqual({
      text: 'x \n\nT\n\n y',
      caret: 5,
    });
  });
});

describe('template command schema', () => {
  it('accepts each action with its exact fields only', () => {
    expect(
      templateCommandSchema.safeParse({
        action: 'create',
        mutationId: id,
        name: 'A',
        bodyMarkdown: 'b',
      }).success,
    ).toBe(true);
    expect(
      templateCommandSchema.safeParse({
        action: 'delete',
        mutationId: id,
        templateId: id,
        expectedRevision: 1,
        confirmed: true,
      }).success,
    ).toBe(true);
    expect(
      templateCommandSchema.safeParse({
        action: 'delete',
        mutationId: id,
        templateId: id,
        expectedRevision: 1,
      }).success,
    ).toBe(false);
    expect(
      templateCommandSchema.safeParse({
        action: 'create',
        mutationId: id,
        name: 'A',
        bodyMarkdown: 'b',
        extra: true,
      }).success,
    ).toBe(false);
  });
});
