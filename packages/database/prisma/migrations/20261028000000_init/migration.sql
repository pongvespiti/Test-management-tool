-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('local', 'ldap');

-- CreateEnum
CREATE TYPE "project_role" AS ENUM ('viewer', 'tester', 'lead');

-- CreateEnum
CREATE TYPE "release_status" AS ENUM ('planned', 'active', 'completed');

-- CreateEnum
CREATE TYPE "case_type" AS ENUM ('Normal', 'Abnormal');

-- CreateEnum
CREATE TYPE "case_status" AS ENUM ('draft', 'in_review', 'ready', 'deprecated');

-- CreateEnum
CREATE TYPE "case_priority" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "case_template" AS ENUM ('text', 'steps');

-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('draft', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "judgement" AS ENUM ('pass', 'pass_with_condition', 'not_pass');

-- CreateEnum
CREATE TYPE "result_status" AS ENUM ('untested', 'ok', 'ng', 'ok_cond', 'blocked', 'nt', 'na');

-- CreateEnum
CREATE TYPE "result_source" AS ENUM ('ui', 'bulk', 'junit', 'api');

-- CreateEnum
CREATE TYPE "defect_status" AS ENUM ('new', 'open', 'in_progress', 'resolved', 'closed', 'reopened', 'rejected');

-- CreateEnum
CREATE TYPE "defect_severity" AS ENUM ('critical', 'major', 'minor', 'trivial');

-- CreateEnum
CREATE TYPE "defect_priority" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "attachment_entity_type" AS ENUM ('run_case', 'defect', 'test_case', 'plan', 'comment', 'template');

-- CreateEnum
CREATE TYPE "comment_entity_type" AS ENUM ('defect', 'run_case', 'test_case', 'plan');

-- CreateEnum
CREATE TYPE "import_kind" AS ENUM ('cases', 'junit');

-- CreateEnum
CREATE TYPE "integration_kind" AS ENUM ('jira');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "auth_provider" "auth_provider" NOT NULL DEFAULT 'local',
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "doc_no_pattern" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "require_case_review" BOOLEAN NOT NULL DEFAULT false,
    "next_defect_seq" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "project_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "project_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "status" "release_status" NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suites" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "description" TEXT,
    "field_defs" JSONB NOT NULL DEFAULT '[]',
    "env_template" JSONB NOT NULL DEFAULT '[]',
    "next_seq" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "suites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" SERIAL NOT NULL,
    "suite_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" SERIAL NOT NULL,
    "suite_id" INTEGER NOT NULL,
    "section_id" INTEGER,
    "seq" INTEGER NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "case_type" "case_type" NOT NULL DEFAULT 'Normal',
    "status" "case_status" NOT NULL DEFAULT 'ready',
    "priority" "case_priority" NOT NULL DEFAULT 'medium',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimate_minutes" INTEGER,
    "refs" TEXT,
    "template" "case_template" NOT NULL DEFAULT 'text',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "precondition" TEXT,
    "procedure" TEXT,
    "expected" TEXT,
    "remark" TEXT,
    "summary_group" TEXT,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "source" JSONB,
    "reviewer_id" INTEGER,
    "review_requested_by_id" INTEGER,
    "review_requested_at" TIMESTAMPTZ(6),
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_by_id" INTEGER,
    "updated_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_case_versions" (
    "id" SERIAL NOT NULL,
    "test_case_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "changed_by_id" INTEGER,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_case_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_steps" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" INTEGER,
    "updated_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shared_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "project_id" INTEGER NOT NULL,
    "entity_type" "attachment_entity_type" NOT NULL,
    "entity_id" INTEGER,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_templates" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "suite_id" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attachment_id" UUID NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_plans" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "release_id" INTEGER,
    "doc_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "test_method" TEXT,
    "judgement_criteria" TEXT,
    "raw_data_path" TEXT,
    "overall_judgement" "judgement",
    "judgement_note" TEXT,
    "status" "plan_status" NOT NULL DEFAULT 'draft',
    "completed_at" TIMESTAMPTZ(6),
    "completed_by_id" INTEGER,
    "template_id" INTEGER,
    "signed_copy_id" UUID,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "test_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_runs" (
    "id" SERIAL NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "suite_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "scenario" TEXT,
    "environment" JSONB NOT NULL DEFAULT '[]',
    "tester_id" INTEGER,
    "tested_date" DATE,
    "judgement" "judgement",
    "judgement_note" TEXT,
    "remark" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source_run_id" INTEGER,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_cases" (
    "id" SERIAL NOT NULL,
    "run_id" INTEGER NOT NULL,
    "test_case_id" INTEGER,
    "case_version" INTEGER NOT NULL DEFAULT 1,
    "display_id" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "case_type" "case_type" NOT NULL DEFAULT 'Normal',
    "section_path" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" "case_priority" NOT NULL DEFAULT 'medium',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimate_minutes" INTEGER,
    "refs" TEXT,
    "template" "case_template" NOT NULL DEFAULT 'text',
    "precondition" TEXT,
    "procedure" TEXT,
    "expected" TEXT,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "case_remark" TEXT,
    "summary_group" TEXT,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "assignee_id" INTEGER,
    "status" "result_status" NOT NULL DEFAULT 'untested',
    "actual_result" TEXT,
    "result_remark" TEXT,
    "step_results" JSONB,
    "executed_by_id" INTEGER,
    "executed_at" TIMESTAMPTZ(6),
    "elapsed_sec" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "run_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_case_results" (
    "id" SERIAL NOT NULL,
    "run_case_id" INTEGER NOT NULL,
    "status" "result_status" NOT NULL,
    "actual_result" TEXT,
    "remark" TEXT,
    "step_results" JSONB,
    "source" "result_source" NOT NULL DEFAULT 'ui',
    "executed_by_id" INTEGER,
    "executed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "elapsed_sec" INTEGER,

    CONSTRAINT "run_case_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defects" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "steps" TEXT,
    "expected" TEXT,
    "actual" TEXT,
    "severity" "defect_severity" NOT NULL DEFAULT 'major',
    "priority" "defect_priority" NOT NULL DEFAULT 'medium',
    "status" "defect_status" NOT NULL DEFAULT 'new',
    "assignee_id" INTEGER,
    "reporter_id" INTEGER,
    "release_id" INTEGER,
    "found_in" TEXT,
    "fixed_in" TEXT,
    "environment" TEXT,
    "external_key" TEXT,
    "external_url" TEXT,
    "external_status" TEXT,
    "external_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "defects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_links" (
    "id" SERIAL NOT NULL,
    "defect_id" INTEGER NOT NULL,
    "run_case_id" INTEGER,
    "test_case_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "entity_type" "comment_entity_type" NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "kind" "import_kind" NOT NULL DEFAULT 'cases',
    "suite_id" INTEGER,
    "run_id" INTEGER,
    "file_name" TEXT NOT NULL,
    "sheet" TEXT NOT NULL DEFAULT '',
    "layout" TEXT,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER,
    "user_id" INTEGER,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_integrations" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "kind" "integration_kind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secret_enc" TEXT,
    "updated_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_key_key" ON "projects"("key");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE INDEX "releases_project_id_idx" ON "releases"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "suites_project_id_prefix_key" ON "suites"("project_id", "prefix");

-- CreateIndex
CREATE INDEX "sections_suite_id_parent_id_idx" ON "sections"("suite_id", "parent_id");

-- CreateIndex
CREATE INDEX "test_cases_suite_id_section_id_idx" ON "test_cases"("suite_id", "section_id");

-- CreateIndex
CREATE INDEX "test_cases_tags_idx" ON "test_cases" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "test_cases_steps_idx" ON "test_cases" USING GIN ("steps" jsonb_path_ops);

-- CreateIndex
CREATE INDEX "test_cases_review_queue_idx" ON "test_cases"("status", "reviewer_id") WHERE (status = 'in_review');

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_suite_id_seq_key" ON "test_cases"("suite_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_suite_code_live_key" ON "test_cases"("suite_id", "code") WHERE (code IS NOT NULL AND NOT is_deleted);

-- CreateIndex
CREATE INDEX "test_case_versions_test_case_id_version_idx" ON "test_case_versions"("test_case_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "shared_steps_project_id_name_key" ON "shared_steps"("project_id", "name");

-- CreateIndex
CREATE INDEX "attachments_entity_type_entity_id_idx" ON "attachments"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "attachments_project_id_idx" ON "attachments"("project_id");

-- CreateIndex
CREATE INDEX "report_templates_project_id_idx" ON "report_templates"("project_id");

-- CreateIndex
CREATE INDEX "test_plans_project_id_release_id_idx" ON "test_plans"("project_id", "release_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_plans_project_id_doc_no_key" ON "test_plans"("project_id", "doc_no");

-- CreateIndex
CREATE INDEX "test_runs_suite_id_idx" ON "test_runs"("suite_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_runs_plan_id_code_key" ON "test_runs"("plan_id", "code");

-- CreateIndex
CREATE INDEX "run_cases_run_id_sort_order_idx" ON "run_cases"("run_id", "sort_order");

-- CreateIndex
CREATE INDEX "run_cases_run_id_status_idx" ON "run_cases"("run_id", "status");

-- CreateIndex
CREATE INDEX "run_cases_test_case_id_idx" ON "run_cases"("test_case_id");

-- CreateIndex
CREATE INDEX "run_cases_assignee_id_idx" ON "run_cases"("assignee_id");

-- CreateIndex
CREATE INDEX "run_case_results_run_case_id_idx" ON "run_case_results"("run_case_id");

-- CreateIndex
CREATE INDEX "run_case_results_executed_at_idx" ON "run_case_results"("executed_at");

-- CreateIndex
CREATE INDEX "defects_project_id_status_idx" ON "defects"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "defects_project_id_seq_key" ON "defects"("project_id", "seq");

-- CreateIndex
CREATE INDEX "defect_links_defect_id_idx" ON "defect_links"("defect_id");

-- CreateIndex
CREATE INDEX "defect_links_run_case_id_idx" ON "defect_links"("run_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "defect_links_defect_run_case_key" ON "defect_links"("defect_id", "run_case_id") WHERE (run_case_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "comments_entity_type_entity_id_idx" ON "comments"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "imports_project_id_idx" ON "imports"("project_id");

-- CreateIndex
CREATE INDEX "activity_log_project_id_created_at_idx" ON "activity_log"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_log_entity_type_entity_id_idx" ON "activity_log"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_integrations_project_id_kind_key" ON "project_integrations"("project_id", "kind");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suites" ADD CONSTRAINT "suites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "suites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_review_requested_by_id_fkey" FOREIGN KEY ("review_requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_case_versions" ADD CONSTRAINT "test_case_versions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_steps" ADD CONSTRAINT "shared_steps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_steps" ADD CONSTRAINT "shared_steps_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_steps" ADD CONSTRAINT "shared_steps_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "suites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "report_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_signed_copy_id_fkey" FOREIGN KEY ("signed_copy_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plans" ADD CONSTRAINT "test_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "test_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "suites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_tester_id_fkey" FOREIGN KEY ("tester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_source_run_id_fkey" FOREIGN KEY ("source_run_id") REFERENCES "test_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_cases" ADD CONSTRAINT "run_cases_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_cases" ADD CONSTRAINT "run_cases_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_cases" ADD CONSTRAINT "run_cases_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_cases" ADD CONSTRAINT "run_cases_executed_by_id_fkey" FOREIGN KEY ("executed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_case_results" ADD CONSTRAINT "run_case_results_run_case_id_fkey" FOREIGN KEY ("run_case_id") REFERENCES "run_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_case_results" ADD CONSTRAINT "run_case_results_executed_by_id_fkey" FOREIGN KEY ("executed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_links" ADD CONSTRAINT "defect_links_defect_id_fkey" FOREIGN KEY ("defect_id") REFERENCES "defects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_links" ADD CONSTRAINT "defect_links_run_case_id_fkey" FOREIGN KEY ("run_case_id") REFERENCES "run_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_links" ADD CONSTRAINT "defect_links_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "test_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_suite_id_fkey" FOREIGN KEY ("suite_id") REFERENCES "suites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_integrations" ADD CONSTRAINT "project_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_integrations" ADD CONSTRAINT "project_integrations_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
