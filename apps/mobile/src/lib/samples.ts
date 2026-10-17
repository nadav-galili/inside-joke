import type { VideoStyle } from '@insidejoke/shared';

/**
 * Sample videos for the welcome screens. Titles, names and lines are made up, and each is a genre,
 * never a real film or show.
 */
export const SAMPLES: { genre: VideoStyle; title: string; subtitle: string }[] = [
  {
    genre: 'telenovela',
    title: 'Who Finished the Hummus',
    subtitle: 'You knew it was mine, Gus. You knew.',
  },
  {
    genre: 'action_trailer_80s',
    title: 'The Bluff of the Century',
    subtitle: 'One man. One pair of sevens. No fear.',
  },
  {
    genre: 'nature_documentary',
    title: 'Late Again, Theo',
    subtitle: 'Forty minutes late, the rare Theo emerges.',
  },
  {
    genre: 'sports_commentary',
    title: 'Left on Read',
    subtitle: 'And Bea leaves him on read. What a play.',
  },
];
