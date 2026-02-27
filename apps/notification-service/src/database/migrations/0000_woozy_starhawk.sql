CREATE TABLE "notification_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"read_at" timestamp,
	"acknowledged_at" timestamp,
	"delivered_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"priority" text DEFAULT 'info' NOT NULL,
	"sender_id" uuid,
	"broadcast" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_recipients_user_id_idx" ON "notification_recipients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_recipients_notification_id_idx" ON "notification_recipients" USING btree ("notification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_recipients_unique_user_notification_idx" ON "notification_recipients" USING btree ("notification_id","user_id");