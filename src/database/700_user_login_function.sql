-- user_login RPC 함수 생성
-- 사용자 로그인 검증 및 온라인 상태 업데이트

CREATE OR REPLACE FUNCTION user_login(
  p_username TEXT,
  p_password TEXT
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  nickname TEXT,
  email TEXT,
  phone TEXT,
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  partner_id UUID,
  referrer_id UUID,
  status TEXT,
  vip_level INTEGER,
  balance NUMERIC,
  invest_balance NUMERIC,
  oroplay_balance NUMERIC,
  point NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 사용자 조회 및 비밀번호 검증
  RETURN QUERY
  SELECT 
    u.id,
    u.username,
    u.nickname,
    u.email,
    u.phone,
    u.bank_name,
    u.bank_account,
    u.bank_holder,
    u.partner_id,
    u.referrer_id,
    u.status,
    u.vip_level,
    u.balance,
    u.invest_balance,
    u.oroplay_balance,
    u.point,
    u.created_at,
    u.updated_at
  FROM users u
  WHERE u.username = p_username
    AND u.password_hash = p_password
    AND u.status IN ('active', 'pending');
    
  -- 로그인 성공 시 온라인 상태 업데이트 (별도 트랜잭션)
  IF FOUND THEN
    UPDATE users 
    SET is_online = true,
        last_login_at = NOW(),
        updated_at = NOW()
    WHERE username = p_username;
  END IF;
END;
$$;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION user_login(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION user_login(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION user_login IS '사용자 로그인 검증 및 온라인 상태 업데이트';
