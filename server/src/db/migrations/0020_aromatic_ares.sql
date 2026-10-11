CREATE TABLE "onboarding_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"status" text NOT NULL,
	"outcome" text,
	"reason" text,
	"detail" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "onboarding_generations" ADD CONSTRAINT "onboarding_generations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_generations" ADD CONSTRAINT "onboarding_generations_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_generations_ws_repo_idx" ON "onboarding_generations" USING btree ("workspace_id","repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_generations_one_running_uq" ON "onboarding_generations" USING btree ("workspace_id","repo_id") WHERE status = 'running';