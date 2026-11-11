-- Project role "manager": reads everything and sees the team view (no testing rights).
ALTER TYPE "project_role" ADD VALUE IF NOT EXISTS 'manager' BEFORE 'tester';
