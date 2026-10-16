import { describe, expect, it } from 'vitest';
import { sampleScript } from '../test/fixtures.ts';
import { checkScript } from './script-writer.ts';

const cast = [
  { memberId: crypto.randomUUID(), displayName: 'Dani' },
  { memberId: crypto.randomUUID(), displayName: 'Ziv' },
];
const ids = cast.map((c) => ({ id: c.memberId }));

describe('checkScript', () => {
  it('accepts a script that casts exactly the given people over 15 seconds', () => {
    expect(checkScript(sampleScript(ids), cast).title).toBe('All In');
  });

  it('rejects a script that casts someone else', () => {
    const script = sampleScript([ids[0]!, { id: crypto.randomUUID() }]);
    expect(() => checkScript(script, cast)).toThrow(/cast does not match/);
  });

  it('rejects beats with a gap', () => {
    const script = sampleScript(ids);
    script.beats[1]!.fromSecond = 6;
    expect(() => checkScript(script, cast)).toThrow(/without gaps/);
  });

  it('rejects a speaker who is not in the cast', () => {
    const script = sampleScript(ids);
    script.beats[0]!.speakerRole = 'THE DEALER';
    expect(() => checkScript(script, cast)).toThrow(/not in the cast/);
  });
});
