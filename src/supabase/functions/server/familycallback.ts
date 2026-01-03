import { SupabaseClient } from "jsr:@supabase/supabase-js@2.49.8";

// =====================================================
// FamilyAPI 콜백 핸들러
// =====================================================

/**
 * FamilyAPI 잔고 확인 콜백 (/balance)
 * GET, POST 방식 모두 지원
 */
export async function handleBalanceCallback(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    let userId: string | null = null;

    // POST: body에서 추출, GET: query parameter에서 추출
    if (req.method === 'POST') {
      const body = await req.json();
      userId = body.userId;
    } else if (req.method === 'GET') {
      const url = new URL(req.url);
      userId = url.searchParams.get('userId');
    }

    console.log('📞 [FamilyAPI /balance] Callback 호출됨:', { userId, method: req.method });

    if (!userId) {
      console.error('❌ [FamilyAPI /balance] userId 누락');
      return new Response(
        JSON.stringify({ result_code: '1', balance: 0 }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 사용자 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, balance')
      .eq('username', userId)
      .maybeSingle();

    if (userError || !user) {
      console.error('❌ [/balance] 사용자 없음:', userId, userError);
      return new Response(
        JSON.stringify({ result_code: '1', balance: 0 }),
        { status: 404, headers: corsHeaders }
      );
    }

    const responseData = {
      result_code: '0',
      balance: user.balance || 0
    };

    console.log('✅ [/balance] 응답:', responseData);

    return new Response(
      JSON.stringify(responseData),
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('❌ FamilyAPI 잔고 확인 오류:', error);
    return new Response(
      JSON.stringify({ result_code: '1', balance: 0 }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * FamilyAPI 카지노 베팅/결과 콜백 (/changebalance)
 */
export async function handleChangeBalanceCallback(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await req.json();
    const {
      betId,
      tranId,
      betKey,
      userId,
      vendorIdx,
      vendorKey,
      gameKey,
      gameId,
      gameType,
      tranType,
      debit,
      credit,
      isCancel,
      isBonus,
      requestAt
    } = body;

    console.log('📞 [/changebalance] Callback 호출됨:', {
      tranId,
      userId,
      tranType,
      debit,
      credit,
      vendorKey,
      gameKey
    });

    // 멱등성 체크 (tranId 중복 확인)
    const { data: existingTran } = await supabase
      .from('game_records')
      .select('id')
      .eq('transaction_id', tranId)
      .maybeSingle();

    if (existingTran) {
      console.log('⚠️ [/changebalance] 중복 tranId:', tranId);
      // 중복 요청
      const { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('username', userId)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          result_code: '98',
          balance: user?.balance || 0
        }),
        { headers: corsHeaders }
      );
    }

    // 사용자 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('username', userId)
      .maybeSingle();

    if (userError || !user) {
      console.error('❌ [/changebalance] 사용자 없음:', userId, userError);
      return new Response(
        JSON.stringify({ result_code: '1', balance: 0 }),
        { status: 404, headers: corsHeaders }
      );
    }

    // debit: 베팅 (차감), credit: 결과 (증가)
    const amount = tranType === 'debit' ? -debit : credit;
    const newBalance = user.balance + amount;

    if (newBalance < 0) {
      console.error('❌ [/changebalance] 잔고 부족:', { userId, balance: user.balance, amount });
      return new Response(
        JSON.stringify({ result_code: '1', balance: user.balance }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 잔고 업데이트
    await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', user.id);

    // 게임 기록 저장
    const { data: gameData } = await supabase
      .from('games')
      .select('id, provider_id, game_type') // ✅ game_type 추가
      .eq('vendor_code', vendorKey)
      .maybeSingle();

    await supabase.from('game_records').insert({
      user_id: user.id,
      game_id: gameData?.id || null,
      provider_id: gameData?.provider_id || null,
      api_type: 'familyapi',
      transaction_id: tranId,
      bet_id: betId,
      bet_key: betKey,
      vendor_key: vendorKey,
      game_key: gameKey,
      game_type: gameData?.game_type || gameType || 'casino', // ✅ games 테이블에서 가져온 game_type 우선 사용
      tran_type: tranType,
      bet_amount: debit || 0,
      win_amount: credit || 0,
      balance_before: user.balance,
      balance_after: newBalance,
      is_cancel: isCancel === 1,
      is_bonus: isBonus === 1,
      created_at: new Date(requestAt).toISOString()
    } as any);  // ⭐ id는 자동 생성되므로 제외

    const responseData = {
      result_code: '0',
      balance: newBalance
    };

    console.log('✅ [/changebalance] 응답:', responseData);

    return new Response(
      JSON.stringify(responseData),
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('❌ FamilyAPI 카지노 베팅/결과 오류:', error);
    return new Response(
      JSON.stringify({ result_code: '1', balance: 0 }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * FamilyAPI 슬롯 베팅/결과 콜백 (/changebalance/slot)
 */
export async function handleChangeBalanceSlotCallback(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = await req.json();
    const {
      betId,
      tranId,
      betKey,
      userId,
      vendorIdx,
      vendorKey,
      gameKey,
      gameId,
      gameType,
      tranType,
      debit,
      credit,
      isCancel,
      isBonus,
      requestAt
    } = body;

    console.log('📞 [/changebalance/slot] Callback 호출됨:', {
      tranId,
      userId,
      tranType,
      debit,
      credit,
      vendorKey,
      gameKey
    });

    // 멱등성 체크
    const { data: existingTran } = await supabase
      .from('game_records')
      .select('id')
      .eq('transaction_id', tranId)
      .maybeSingle();

    if (existingTran) {
      console.log('⚠️ [/changebalance/slot] 중복 tranId:', tranId);
      const { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('username', userId)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          result_code: '98',
          balance: user?.balance || 0
        }),
        { headers: corsHeaders }
      );
    }

    // 사용자 조회
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('username', userId)
      .maybeSingle();

    if (userError || !user) {
      console.error('❌ [/changebalance/slot] 사용자 없음:', userId, userError);
      return new Response(
        JSON.stringify({ result_code: '1', balance: 0 }),
        { status: 404, headers: corsHeaders }
      );
    }

    const amount = tranType === 'debit' ? -debit : credit;
    const newBalance = user.balance + amount;

    if (newBalance < 0) {
      console.error('❌ [/changebalance/slot] 잔고 부족:', { userId, balance: user.balance, amount });
      return new Response(
        JSON.stringify({ result_code: '1', balance: user.balance }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 잔고 업데이트
    await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', user.id);

    // 게임 기록 저장 (game_code로 매칭)
    const { data: gameData } = await supabase
      .from('games')
      .select('id, provider_id, game_type') // ✅ game_type 추가
      .eq('game_code', gameKey)
      .eq('vendor_code', vendorKey)
      .maybeSingle();

    await supabase.from('game_records').insert({
      user_id: user.id,
      game_id: gameData?.id || null,
      provider_id: gameData?.provider_id || null,
      api_type: 'familyapi',
      transaction_id: tranId,
      bet_id: betId,
      bet_key: betKey,
      vendor_key: vendorKey,
      game_key: gameKey,
      game_type: gameData?.game_type || gameType || 'slot', // ✅ games 테이블에서 가져온 game_type 우선 사용
      tran_type: tranType,
      bet_amount: debit || 0,
      win_amount: credit || 0,
      balance_before: user.balance,
      balance_after: newBalance,
      is_cancel: isCancel === 1,
      is_bonus: isBonus === 1,
      created_at: new Date(requestAt).toISOString()
    } as any);  // ⭐ id는 자동 생성되므로 제외

    const responseData = {
      result_code: '0',
      balance: newBalance
    };

    console.log('✅ [/changebalance/slot] 응답:', responseData);

    return new Response(
      JSON.stringify(responseData),
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('❌ FamilyAPI 슬롯 베팅/결과 오류:', error);
    return new Response(
      JSON.stringify({ result_code: '1', balance: 0 }),
      { status: 500, headers: corsHeaders }
    );
  }
}