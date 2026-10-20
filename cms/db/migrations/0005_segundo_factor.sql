ALTER TABLE "users" ADD COLUMN "totp_activado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_ultimo_paso" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "codigos_recuperacion" text[] DEFAULT '{}'::text[] NOT NULL;