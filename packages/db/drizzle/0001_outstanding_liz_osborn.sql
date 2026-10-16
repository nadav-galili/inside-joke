ALTER TABLE "members" ADD COLUMN "ai_consent_version" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "manage_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_consent_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "selfie_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "selfie_consent_version" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "expo_push_token" text;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_manage_token_unique" UNIQUE("manage_token");