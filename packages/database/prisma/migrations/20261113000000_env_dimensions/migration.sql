-- Lists of values behind the environment labels of the runs (Platform, OS ver, Unit model …).
ALTER TABLE "projects" ADD COLUMN "env_dimensions" JSONB NOT NULL DEFAULT '[]';
