import type { VideoStyle } from '@insidejoke/shared';
import billPoster from '../../assets/samples/the-bill.jpg';
import billVideo from '../../assets/samples/the-bill.mp4';
import fivePoster from '../../assets/samples/five-minutes-away.jpg';
import fiveVideo from '../../assets/samples/five-minutes-away.mp4';
import kPoster from '../../assets/samples/k.jpg';
import kVideo from '../../assets/samples/k.mp4';

export type Sample = {
  genre: VideoStyle;
  title: string;
  /** The group-chat moment the film was made from, shown before the cut to the film. */
  chat: { name: string; text: string }[];
  /** The line under the clip. */
  tagline: string;
  video: number;
  poster: number;
};

/**
 * Sample videos for the welcome screens, each made from a moment every group chat has. Gus, Theo
 * and Bea are AI portraits of people who don't exist, and each style is a genre, never a real film
 * or show. Scripts: /mnt/project-files/design/sample-scripts.md.
 */
export const SAMPLES: Sample[] = [
  {
    genre: 'nature_documentary',
    title: 'Five Minutes Away',
    chat: [
      { name: 'Theo', text: '5 min away 🏃' },
      { name: 'Bea', text: 'theo.' },
      { name: 'Theo', text: 'parking!!' },
    ],
    tagline: 'Every group has a Theo.',
    video: fiveVideo,
    poster: fivePoster,
  },
  {
    genre: 'telenovela',
    title: 'k',
    chat: [
      { name: 'Bea', text: 'i just want you all to know how much this group means to me ❤️' },
      { name: 'Gus', text: 'k' },
    ],
    tagline: 'Every group has a Gus.',
    video: kVideo,
    poster: kPoster,
  },
  {
    genre: 'action_trailer_80s',
    title: 'The Bill',
    chat: [
      { name: 'Bea', text: "who's paying" },
      { name: 'Gus', text: 'brb bathroom' },
      { name: 'Theo', text: "he's done this 6 times" },
    ],
    tagline: 'This time, the bill found him.',
    video: billVideo,
    poster: billPoster,
  },
];
