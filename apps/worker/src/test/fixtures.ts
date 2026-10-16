import {
  createDb,
  faces,
  generationJobs,
  groups,
  members,
  runMigrations,
  users,
  videoCast,
  videos,
  type Db,
} from '@insidejoke/db';
import type { Script } from '@insidejoke/shared';

export const testDbUrl = process.env.TEST_DATABASE_URL;

let db: Db | undefined;
export async function testDb(): Promise<Db> {
  if (!db) {
    db = createDb(testDbUrl!);
    await runMigrations(db);
  }
  return db;
}

/**
 * Clears the job queue. `claimNextJob` takes any due job, so a job left by an earlier test (a
 * retry that has since come due) would otherwise be claimed by the next one.
 */
export async function clearJobs(db: Db) {
  await db.delete(generationJobs);
}

/** A group with two consenting members and a draft video starring both. */
export async function seedVideo(db: Db, opts: { inputText?: string } = {}) {
  const [user] = await db.insert(users).values({ clerkUserId: crypto.randomUUID() }).returning();
  const [group] = await db
    .insert(groups)
    .values({ ownerId: user!.id, name: 'Poker', inviteCode: crypto.randomUUID() })
    .returning();
  const cast = await db
    .insert(members)
    .values([
      { groupId: group!.id, displayName: 'Dani', inviteStatus: 'joined' },
      { groupId: group!.id, displayName: 'Ziv', inviteStatus: 'joined' },
    ])
    .returning();
  await db
    .insert(faces)
    .values(
      cast.map((m) => ({ memberId: m.id, r2Key: `faces/${m.id}.jpg`, consentTextVersion: 'v1' })),
    );
  const [video] = await db
    .insert(videos)
    .values({
      groupId: group!.id,
      creatorId: user!.id,
      style: 'telenovela',
      inputText: opts.inputText ?? 'Dani: all in. Ziv: with seven-two?? Dani: trust the process',
    })
    .returning();
  await db.insert(videoCast).values(cast.map((m) => ({ videoId: video!.id, memberId: m.id })));
  return { video: video!, cast };
}

export function sampleScript(cast: { id: string }[]): Script {
  return {
    title: 'All In',
    premise: 'דני הולך אול-אין עם 7-2',
    setting: 'A smoky poker table at night',
    cast: [
      { memberId: cast[0]!.id, role: 'THE GAMBLER', direction: 'Pushes all his chips in, slowly.' },
      { memberId: cast[1]!.id, role: 'THE RIVAL', direction: 'Gasps and clutches the table.' },
    ],
    beats: [
      {
        fromSecond: 0,
        toSecond: 5,
        action: 'THE GAMBLER pushes all in.',
        speakerRole: 'THE GAMBLER',
        line: 'All in.',
        subtitle: 'אול אין.',
      },
      {
        fromSecond: 5,
        toSecond: 10,
        action: 'THE RIVAL gasps.',
        speakerRole: 'THE RIVAL',
        line: 'With seven-two?!',
        subtitle: 'עם 7-2?!',
      },
      {
        fromSecond: 10,
        toSecond: 15,
        action: 'Slow zoom on THE GAMBLER.',
        speakerRole: 'THE GAMBLER',
        line: 'Trust the process.',
        subtitle: 'תסמכו על התהליך, אחים שלי, תסמכו עליי',
      },
    ],
    subtitleLanguage: 'he',
  };
}
