import { describe, expect, it } from 'vitest';
import { buildAss, cuesFromBeats, rtlLine } from './subtitles.ts';

const beat = (fromSecond: number, toSecond: number, subtitle: string) => ({
  fromSecond,
  toSecond,
  action: 'x',
  speakerRole: null,
  line: '',
  subtitle,
});

describe('cuesFromBeats', () => {
  it('keeps a short line as one cue and skips empty ones', () => {
    expect(cuesFromBeats([beat(0, 5, 'אול אין.'), beat(5, 10, '  ')])).toEqual([
      { start: 0, end: 5, text: 'אול אין.' },
    ]);
  });

  it('splits a long line into two timed cues at a word boundary', () => {
    const cues = cuesFromBeats([beat(10, 15, 'תסמכו על התהליך, אחים שלי, תסמכו עליי עד הסוף')]);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 10, end: 12.5 });
    expect(cues[1]).toMatchObject({ start: 12.5, end: 15 });
    expect(`${cues[0]!.text} ${cues[1]!.text}`).toBe(
      'תסמכו על התהליך, אחים שלי, תסמכו עליי עד הסוף',
    );
  });
});

describe('rtlLine', () => {
  it('embeds the line right to left', () => {
    expect(rtlLine('שלום')).toBe('‫שלום‬');
  });

  it('puts a right-to-left mark before a leading number', () => {
    expect(rtlLine('22:14 אוכל')).toBe('‫‏22:14 אוכל‬');
  });
});

describe('buildAss', () => {
  it('writes a Hebrew track with RTL encoding and strips override braces', () => {
    const ass = buildAss(
      [beat(0, 5, 'היי {\\b1}דני')],
      'he',
      { width: 432, height: 768 },
      'DejaVu Sans',
    );
    expect(ass).toContain('PlayResX: 432');
    expect(ass).toMatch(/,177$/m);
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,‫היי b1דני‬');
  });

  it('leaves an English track as plain text', () => {
    const ass = buildAss(
      [beat(0, 5, 'All in.')],
      'en',
      { width: 1280, height: 720 },
      'DejaVu Sans',
    );
    expect(ass).toContain(',,All in.');
  });
});
