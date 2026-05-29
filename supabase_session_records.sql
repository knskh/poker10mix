-- ============================================
-- 成績機能（テーブル別）のための session_records テーブル
-- Supabase SQL Editor で全選択して実行してください
-- ============================================

CREATE TABLE IF NOT EXISTS session_records (
    id            bigserial PRIMARY KEY,
    room_id       text,
    timestamp     timestamptz DEFAULT now(),
    hands_played  int4 DEFAULT 0,
    game_types    jsonb,
    participants  jsonb,
    created_at    timestamptz DEFAULT now()
);

-- 既存テーブルに不足カラムがあれば追加（再実行しても安全）
ALTER TABLE session_records ADD COLUMN IF NOT EXISTS room_id      text;
ALTER TABLE session_records ADD COLUMN IF NOT EXISTS timestamp    timestamptz DEFAULT now();
ALTER TABLE session_records ADD COLUMN IF NOT EXISTS hands_played int4 DEFAULT 0;
ALTER TABLE session_records ADD COLUMN IF NOT EXISTS game_types   jsonb;
ALTER TABLE session_records ADD COLUMN IF NOT EXISTS participants jsonb;

-- 検索高速化のための index
CREATE INDEX IF NOT EXISTS idx_session_records_room_id   ON session_records (room_id);
CREATE INDEX IF NOT EXISTS idx_session_records_timestamp ON session_records (timestamp DESC);

-- RLS を無効化（サーバー専用テーブル）
ALTER TABLE session_records DISABLE ROW LEVEL SECURITY;

-- 確認: 行数表示
SELECT count(*) AS rows FROM session_records;
