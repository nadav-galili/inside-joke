import { describe, expect, it } from 'vitest';
import { createVideoSchema, isRtlLanguage } from './video.ts';

const id = () => crypto.randomUUID();

describe('createVideoSchema', () => {
  it('accepts a video with two to four cast members', () => {
    const ok = createVideoSchema.safeParse({
      groupId: id(),
      inputText: 'Dani went all in with seven-two again',
      style: 'action_trailer_80s',
      castMemberIds: [id(), id()],
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a cast of one and a cast of five', () => {
    const base = { groupId: id(), inputText: 'x', style: 'telenovela' };
    expect(createVideoSchema.safeParse({ ...base, castMemberIds: [id()] }).success).toBe(false);
    const five = [id(), id(), id(), id(), id()];
    expect(createVideoSchema.safeParse({ ...base, castMemberIds: five }).success).toBe(false);
  });

  it('rejects a named film as a style', () => {
    const bad = {
      groupId: id(),
      inputText: 'x',
      style: 'pulp_fiction',
      castMemberIds: [id(), id()],
    };
    expect(createVideoSchema.safeParse(bad).success).toBe(false);
  });
});

describe('isRtlLanguage', () => {
  it('treats Hebrew as right to left, with or without a region', () => {
    expect(isRtlLanguage('he')).toBe(true);
    expect(isRtlLanguage('he-IL')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);
  });
});
