import { describe, expect, it } from 'vitest';
import { buildVideoPrompt } from './prompt.ts';
import { sampleScript } from './test/fixtures.ts';

const cast = [{ id: crypto.randomUUID() }, { id: crypto.randomUUID() }];

describe('buildVideoPrompt', () => {
  it('maps each cast role to its image in order and asks for no on-screen text', () => {
    const prompt = buildVideoPrompt(sampleScript(cast), 'telenovela');
    expect(prompt).toContain('THE GAMBLER is the person in Image 1.');
    expect(prompt).toContain('THE RIVAL is the person in Image 2.');
    expect(prompt).toContain('5-10s: THE RIVAL gasps. THE RIVAL says: "With seven-two?!"');
    expect(prompt).toContain('No subtitles, no captions, no on-screen text.');
    expect(prompt).toContain('telenovela');
  });

  it('gives a line with no speaker to an off-screen narrator', () => {
    const script = sampleScript(cast);
    script.beats[0] = { ...script.beats[0]!, speakerRole: null, line: 'And he takes it again!' };
    expect(buildVideoPrompt(script, 'sports_commentary')).toContain(
      'An off-screen narrator says: "And he takes it again!"',
    );
  });
});
