DROP INDEX "content_key_idx";--> statement-breakpoint
DROP INDEX "revisions_key_idx";--> statement-breakpoint
ALTER TABLE "content_entries" ADD COLUMN "locale" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "locale" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "content_key_locale_idx" ON "content_entries" USING btree ("key","locale");--> statement-breakpoint
CREATE INDEX "revisions_key_idx" ON "revisions" USING btree ("entry_key","locale","published_at");