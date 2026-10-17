import type { VideoStyle } from '@insidejoke/shared';

/**
 * Sample videos for the welcome screens. Titles and lines are made up, and each is a genre, never
 * a real film or show. `clip` is a bundled mp4 (`require('../../assets/samples/x.mp4')`) and is
 * played in place of the poster when set. A clip may show only made-up people or people who
 * agreed to be in the app's samples.
 */
export const SAMPLES: {
  genre: VideoStyle;
  title: string;
  subtitle: string;
  clip?: number;
}[] = [
  {
    genre: 'telenovela',
    title: 'Who Finished the Hummus',
    subtitle: 'You knew it was mine, Dani. You knew.',
  },
  {
    genre: 'action_trailer_80s',
    title: 'The Bluff of the Century',
    subtitle: 'One man. One pair of sevens. No fear.',
  },
  {
    genre: 'nature_documentary',
    title: 'Late Again, Dani',
    subtitle: 'Forty minutes late, the rare Dani emerges.',
  },
  {
    genre: 'sports_commentary',
    title: 'Left on Read',
    subtitle: 'And Maya leaves him on read. What a play.',
  },
];
