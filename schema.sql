-- PushNotes Database Schema
-- Run this in Neon SQL Editor to set up the database

DROP TABLE IF EXISTS translations;
DROP TABLE IF EXISTS changelogs;

CREATE TABLE changelogs (
  id           TEXT PRIMARY KEY,
  repo_url     TEXT NOT NULL,
  repo_name    TEXT NOT NULL,
  version      TEXT,
  tone         TEXT,
  generated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE translations (
  id           SERIAL PRIMARY KEY,
  changelog_id TEXT REFERENCES changelogs(id) ON DELETE CASCADE,
  locale       TEXT NOT NULL,
  content      JSONB NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);