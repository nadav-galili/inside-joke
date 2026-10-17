import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { GENERATION_STEPS, VIDEO_STATUSES, VIDEO_STYLES, type Script } from '@insidejoke/shared';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const videoStatusEnum = pgEnum('video_status', VIDEO_STATUSES);
export const videoStyleEnum = pgEnum('video_style', VIDEO_STYLES);
export const generationStepEnum = pgEnum('generation_step', GENERATION_STEPS);
export const jobStatusEnum = pgEnum('job_status', ['queued', 'running', 'done', 'failed']);
export const inviteStatusEnum = pgEnum('invite_status', ['invited', 'joined', 'left']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  /** The one free, watermarked video per account (build plan, payments). */
  freeVideoUsed: boolean('free_video_used').notNull().default(false),
  /** Videos paid for but not yet spent, including credits given back for failed videos. */
  videoCredits: integer('video_credits').notNull().default(0),
  /** The AI data consent version the user agreed to (guideline 5.1.2(i)); null until they do. */
  aiConsentVersion: text('ai_consent_version'),
  /**
   * The user's own selfie. It is copied to a `faces` row for each group they are in, so revoking
   * it revokes every one of those.
   */
  selfieKey: text('selfie_key'),
  selfieConsentVersion: text('selfie_consent_version'),
  expoPushToken: text('expo_push_token'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  inviteCode: text('invite_code').notNull().unique(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

/** A person in a group. `userId` is null for a friend who joined from the web invite page. */
export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    inviteStatus: inviteStatusEnum('invite_status').notNull().default('invited'),
    /** The AI data consent a friend gave on the invite page; app users consent on `users`. */
    aiConsentVersion: text('ai_consent_version'),
    /** Secret in the link a web-joined friend keeps to remove their face or report a video. */
    manageToken: text('manage_token').unique(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('members_group_idx').on(t.groupId)],
);

/**
 * A member's own selfie and the consent they gave with it. Only the member uploads it; revoking
 * sets `revokedAt`, deletes the R2 object, and keeps the member out of new videos.
 */
export const faces = pgTable(
  'faces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    consentTextVersion: text('consent_text_version').notNull(),
    consentedAt: timestamptz('consented_at').notNull().defaultNow(),
    revokedAt: timestamptz('revoked_at'),
  },
  (t) => [index('faces_member_idx').on(t.memberId)],
);

export const videos = pgTable(
  'videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The pasted chat text. Cleared once the script is approved; only the script is kept. */
    inputText: text('input_text'),
    style: videoStyleEnum('style').notNull(),
    script: jsonb('script').$type<Script>(),
    status: videoStatusEnum('status').notNull().default('draft'),
    r2Key: text('r2_key'),
    watermarked: boolean('watermarked').notNull().default(true),
    costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    readyAt: timestamptz('ready_at'),
  },
  (t) => [index('videos_creator_idx').on(t.creatorId), index('videos_group_idx').on(t.groupId)],
);

export const videoCast = pgTable(
  'video_cast',
  {
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    roleInScript: text('role_in_script'),
  },
  (t) => [uniqueIndex('video_cast_pk').on(t.videoId, t.memberId)],
);

/** One row per pipeline step per video; the worker claims rows with `FOR UPDATE SKIP LOCKED`. */
export const generationJobs = pgTable(
  'generation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    step: generationStepEnum('step').notNull(),
    status: jobStatusEnum('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    provider: text('provider'),
    model: text('model'),
    requestId: text('request_id'),
    output: jsonb('output'),
    error: text('error'),
    costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
    runAfter: timestamptz('run_after').notNull().defaultNow(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('generation_jobs_claim_idx').on(t.status, t.runAfter),
    // The daily caps count a step's jobs over the last day.
    index('generation_jobs_step_created_idx').on(t.step, t.createdAt),
  ],
);

/** RevenueCat webhook log, idempotent by transaction. */
export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  videoId: uuid('video_id').references(() => videos.id, { onDelete: 'set null' }),
  productId: text('product_id').notNull(),
  transactionId: text('transaction_id').notNull().unique(),
  rawEvent: jsonb('raw_event').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

/**
 * A request to take a video down. A cast member's request removes the video at once; the row is
 * kept so takedowns can be reviewed.
 */
export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  videoId: uuid('video_id')
    .notNull()
    .references(() => videos.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').references(() => members.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});
