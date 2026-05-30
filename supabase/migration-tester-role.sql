-- Migration: Add 'tester' plan support to grant_plan
-- Tester: 1 month expiry, is_active=true, 10 credits (once per plan period).
-- Run this in Supabase SQL Editor AFTER migration-grant-plan.sql.

CREATE OR REPLACE FUNCTION grant_plan(
  target_user_id UUID,
  target_plan    TEXT,
  credit_amount  INT DEFAULT 150
)
RETURNS TABLE(plan TEXT, credits INTEGER, is_active BOOLEAN, credited BOOLEAN) AS $$
DECLARE
  v_expires        TIMESTAMPTZ;
  v_active         BOOLEAN;
  v_credited       BOOLEAN := false;
  v_existing       INT;
  v_credit_amount  INT;
BEGIN
  -- Determine expiry, activation, and credit amount per plan
  IF target_plan IN ('plus', 'family') THEN
    v_expires       := now() + INTERVAL '1 year';
    v_active        := true;
    v_credit_amount := credit_amount;   -- default 150
  ELSIF target_plan = 'tester' THEN
    v_expires       := now() + INTERVAL '1 month';
    v_active        := true;
    v_credit_amount := 10;              -- always 10 for tester, ignore credit_amount param
  ELSIF target_plan = 'noob' THEN
    v_expires       := NULL;            -- never expires
    v_active        := true;
    v_credit_amount := 0;               -- noob bypasses credit checks in the bot
  ELSE  -- 'free' (downgrade): leave is_active unchanged, no credits
    v_expires       := NULL;
    v_active        := NULL;
    v_credit_amount := 0;
  END IF;

  UPDATE users
  SET plan            = target_plan,
      plan_expires_at = v_expires,
      is_active       = COALESCE(v_active, is_active)
  WHERE id = target_user_id;

  -- Grant credits ONCE per active plan period (idempotent via ledger)
  IF target_plan IN ('plus', 'family', 'tester') AND v_credit_amount > 0 THEN
    SELECT count(*) INTO v_existing
    FROM credit_grants cg
    WHERE cg.user_id = target_user_id
      AND cg.plan    = target_plan
      AND (cg.expires_at IS NULL OR cg.expires_at > now());

    IF v_existing = 0 THEN
      UPDATE users SET credits = GREATEST(0, credits + v_credit_amount)
      WHERE id = target_user_id;

      INSERT INTO credit_grants (user_id, plan, amount, expires_at)
      VALUES (target_user_id, target_plan, v_credit_amount, v_expires);

      v_credited := true;
    END IF;
  END IF;

  RETURN QUERY
  SELECT u.plan, u.credits, u.is_active, v_credited
  FROM users u WHERE u.id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissions unchanged — only service_role can call this
REVOKE EXECUTE ON FUNCTION grant_plan(UUID, TEXT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_plan(UUID, TEXT, INT) TO service_role;
