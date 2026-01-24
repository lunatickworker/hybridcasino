/**
 * 프라그마틱 슬롯 게임 Priority 업데이트 스크립트
 * 
 * 실행: npx ts-node src/scripts/updatePragmaticPriority.ts
 * 
 * 동작:
 * 1. gamenamesequence.md에서 게임 이름과 순서 추출
 * 2. honor_games에서 provider_id=7363 (프라그마틱) 게임만 조회
 * 3. name_ko로 정확히 매칭하여 priority 1~635로 설정
 * 4. 매핑되지 않은 프라그마틱 게임은 priority 1000+ 설정
 * 5. 다른 게임은 변경 안함
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Supabase 초기화
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경변수 설정 필요');
  console.error('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL);
  console.error('VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY ? '설정됨' : '미설정');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * gamenamesequence.md 파싱: 게임명과 순서 맵 생성
 */
function parseGameSequenceFile(filePath: string): Map<string, number> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const gameMap = new Map<string, number>();
    
    // 마크다운 테이블 행 파싱: |순서|게임명|...
    const lines = content.split('\n');
    let sequence = 0;
    
    for (const line of lines) {
      if (!line.includes('|')) continue;
      
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 3) continue;
      
      const seqNum = parseInt(parts[1], 10);
      const gameName = parts[2];
      
      // 유효한 게임명인지 확인
      if (isNaN(seqNum) || seqNum <= 0 || !gameName) continue;
      if (gameName === '게임명' || gameName === '노출순서' || gameName === 'Honor') continue;
      
      gameMap.set(gameName, seqNum);
      sequence++;
    }
    
    console.log(`✅ 파싱 완료: ${gameMap.size}개 게임\n`);
    return gameMap;
  } catch (error) {
    console.error('❌ 파일 파싱 오류:', error);
    process.exit(1);
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   🎰 프라그마틱 Priority 업데이트        ║');
  console.log('╚════════════════════════════════════════════╝\n');
  
  const filePath = path.join(process.cwd(), 'Jobtasks', 'gamenamesequence.md');
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 파일 없음: ${filePath}`);
    process.exit(1);
  }
  
  // 1️⃣ 시퀀스 파일 파싱
  const sequenceMap = parseGameSequenceFile(filePath);
  
  console.log('📋 파싱된 게임 (처음 10개):');
  let count = 0;
  for (const entry of Array.from(sequenceMap)) {
    if (count >= 10) break;
    const [name, seq] = entry;
    console.log(`   [${seq}] ${name}`);
    count++;
  }
  if (sequenceMap.size > 10) {
    console.log(`   ... 외 ${sequenceMap.size - 10}개\n`);
  } else {
    console.log();
  }
  
  // 2️⃣ provider_id=7363 (프라그마틱) 게임 조회
  console.log('📥 프라그마틱 게임(provider_id=7363) 조회 중...');
  const { data: pragmaticGames, error: fetchError } = await supabase
    .from('honor_games')
    .select('id, name_ko, priority')
    .eq('provider_id', 7363)
    .eq('type', 'slot');
  
  if (fetchError || !pragmaticGames) {
    console.error('❌ 조회 오류:', fetchError?.message);
    process.exit(1);
  }
  
  console.log(`✅ 프라그마틱 게임 ${pragmaticGames.length}개 조회 완료\n`);
  
  // 3️⃣ name_ko로 매칭 및 priority 결정 (정확한 매칭 + 앞 2자 매칭)
  console.log('🔄 게임 매칭 중...\n');
  
  const updates: Array<{ id: number; priority: number }> = [];
  const matched = new Set<number>();
  let matchCount = 0;
  
  // 시퀀스 게임과 매칭
  for (const entry of Array.from(sequenceMap)) {
    const [seqName, seqPriority] = entry;
    
    // 1. 정확한 이름으로 먼저 매칭
    let game = pragmaticGames.find(g => g.name_ko === seqName);
    
    // 2. 정확한 매칭 실패 시 앞 2자로 매칭
    if (!game && seqName.length >= 2) {
      const first2Chars = seqName.substring(0, 2);
      game = pragmaticGames.find(g => 
        !matched.has(g.id) && 
        g.name_ko.length >= 2 && 
        g.name_ko.substring(0, 2) === first2Chars
      );
    }
    
    if (game) {
      updates.push({ id: game.id, priority: seqPriority });
      matched.add(game.id);
      matchCount++;
      
      if (matchCount <= 10) {
        console.log(`✅ [${seqPriority}] ${seqName}`);
      }
    }
  }
  
  if (matchCount > 10) {
    console.log(`   ... 외 ${matchCount - 10}개`);
  }
  
  // 매핑되지 않은 프라그마틱 게임 처리
  const unmapped = pragmaticGames.filter(g => !matched.has(g.id));
  console.log(`\n📌 매핑 안 된 프라그마틱 게임 ${unmapped.length}개:\n`);
  
  unmapped.forEach((game, idx) => {
    const priority = 1000 + idx;
    updates.push({ id: game.id, priority });
    
    if (idx < 10) {
      console.log(`   [${priority}] ${game.name_ko || '(이름없음)'}`);
    }
  });
  
  if (unmapped.length > 10) {
    console.log(`   ... 외 ${unmapped.length - 10}개`);
  }
  
  console.log(`\n📊 업데이트 요약:`);
  console.log(`   ✅ 매칭됨: ${matchCount}개`);
  console.log(`   📌 미매칭: ${unmapped.length}개`);
  console.log(`   📝 총: ${updates.length}개\n`);
  
  // 4️⃣ DB 업데이트
  console.log('⏳ 데이터베이스 업데이트 중...\n');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const update of updates) {
    const { error } = await supabase
      .from('honor_games')
      .update({ priority: update.priority, updated_at: new Date().toISOString() })
      .eq('id', update.id);
    
    if (error) {
      failCount++;
    } else {
      successCount++;
    }
  }
  
  console.log(`✅ 완료:`);
  console.log(`   ✅ 성공: ${successCount}개`);
  console.log(`   ❌ 실패: ${failCount}개\n`);
  
  // 5️⃣ 검증
  console.log('🔍 검증 (업데이트된 게임 처음 10개):\n');
  const { data: verifyData } = await supabase
    .from('honor_games')
    .select('name_ko, priority')
    .eq('provider_id', 7363)
    .eq('type', 'slot')
    .order('priority', { ascending: true })
    .limit(10);
  
  if (verifyData) {
    verifyData.forEach(g => {
      console.log(`   [${g.priority}] ${g.name_ko}`);
    });
  }
  
  console.log('\n✅ 스크립트 완료!\n');
}

main().catch(error => {
  console.error('❌ 오류:', error.message);
  process.exit(1);
});
