/**
 * Oroplay 프라그마틱 게임 Priority 업데이트 스크립트
 * 
 * 실행: npx ts-node src/scripts/updateOroplayPragmaticPriority.ts
 * 
 * 동작:
 * 1. gamenamesequence.md에서 게임 이름과 순서 추출
 * 2. games에서 provider_id=1013693 (프라그마틱) 게임만 조회
 * 3. name으로 정확히 매칭하여 priority 1~635로 설정
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
      if (!gameName || isNaN(seqNum)) continue;
      
      gameMap.set(gameName, seqNum);
    }
    
    return gameMap;
  } catch (error) {
    console.error('❌ gamenamesequence.md 파싱 실패:', error);
    throw error;
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  try {
    console.log('🚀 Oroplay 프라그마틱 게임 Priority 업데이트 시작\n');

    // 1️⃣ gamenamesequence.md 파싱
    const sequenceFilePath = path.join(__dirname, '../../Jobtasks/gamenamesequence.md');
    console.log('📖 파일 읽기:', sequenceFilePath);
    
    const sequenceMap = parseGameSequenceFile(sequenceFilePath);
    console.log(`✅ 게임 순서 맵 생성 완료: ${sequenceMap.size}개\n`);
    
    // 샘플 출력
    console.log('📋 게임 순서 샘플 (처음 10개):');
    let count = 0;
    for (const [name, seq] of Array.from(sequenceMap.entries())) {
      if (count >= 10) break;
      console.log(`   [${seq}] ${name}`);
      count++;
    }
    if (sequenceMap.size > 10) {
      console.log(`   ... 외 ${sequenceMap.size - 10}개\n`);
    } else {
      console.log();
    }
    
    // 2️⃣ provider_id=1013693 (프라그마틱) 게임 조회
    console.log('📥 프라그마틱 게임(provider_id=1013693) 조회 중...');
    const { data: pragmaticGames, error: fetchError } = await supabase
      .from('games')
      .select('id, name, priority')
      .eq('provider_id', 1013693)
      .eq('type', 'slot');
    
    if (fetchError || !pragmaticGames) {
      throw new Error(`게임 조회 실패: ${fetchError?.message}`);
    }
    
    console.log(`✅ 프라그마틱 게임 ${pragmaticGames.length}개 조회 완료\n`);
    
    // 3️⃣ name으로 매칭하여 priority 업데이트
    console.log('🔄 Priority 업데이트 준비 중...');
    
    const updates: any[] = [];
    const mappedGames = new Set<string>();
    const unmappedGames: any[] = [];
    
    // 게임명으로 순서 찾기 (앞 2자 매칭)
    for (const game of pragmaticGames) {
      // 1. 정확한 이름으로 먼저 매칭 시도
      let sequence = sequenceMap.get(game.name);
      let matchType = 'exact';
      
      // 2. 정확한 매칭 실패 시 앞 2자로 매칭
      if (sequence === undefined && game.name.length >= 2) {
        const first2Chars = game.name.substring(0, 2);
        
        // sequenceMap의 모든 키 중에서 앞 2자가 같은 첫 번째 게임 찾기
        for (const [seqName, seq] of Array.from(sequenceMap.entries())) {
          if (seqName.substring(0, 2) === first2Chars) {
            sequence = seq;
            matchType = 'prefix2';
            break;
          }
        }
      }
      
      if (sequence !== undefined) {
        // ✅ 매핑 성공
        updates.push({
          id: game.id,
          priority: sequence
        });
        mappedGames.add(`${game.name} (${matchType})`);
      } else {
        // ❌ 매핑 실패
        unmappedGames.push({
          id: game.id,
          name: game.name,
          currentPriority: game.priority
        });
      }
    }
    
    console.log(`✅ 매핑 완료: ${mappedGames.size}개 매칭, ${unmappedGames.length}개 미매칭\n`);
    
    // 미매칭 게임 로그
    if (unmappedGames.length > 0) {
      console.log('⚠️ 매핑되지 않은 게임 (처음 10개):');
      for (let i = 0; i < Math.min(10, unmappedGames.length); i++) {
        console.log(`   - ${unmappedGames[i].name} (ID: ${unmappedGames[i].id})`);
      }
      if (unmappedGames.length > 10) {
        console.log(`   ... 외 ${unmappedGames.length - 10}개`);
      }
      console.log();
    }
    
    // 4️⃣ 매핑된 게임 업데이트
    console.log('💾 데이터베이스 업데이트 중...');
    
    if (updates.length > 0) {
      // 각 게임을 개별 update (upsert 사용 금지 - name null constraint 위반)
      let successCount = 0;
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('games')
          .update({
            priority: update.priority
          })
          .eq('id', update.id);
        
        if (updateError) {
          console.warn(`   ❌ ID ${update.id} 업데이트 실패: ${updateError.message}`);
        } else {
          successCount++;
        }
      }
      
      console.log(`✅ ${successCount}개 게임 priority 업데이트 완료\n`);
    }
    
    // 5️⃣ 미매칭 게임 priority 설정 (1000+)
    if (unmappedGames.length > 0) {
      console.log('⚠️ 미매칭 게임 priority 설정 중...');
      
      for (let i = 0; i < unmappedGames.length; i++) {
        const { error } = await supabase
          .from('games')
          .update({
            priority: 1000 + i
          })
          .eq('id', unmappedGames[i].id);
        
        if (error) {
          console.warn(`   ❌ ${unmappedGames[i].name} 업데이트 실패`);
        }
      }
      
      console.log(`✅ ${unmappedGames.length}개 미매칭 게임 priority 1000+ 설정\n`);
    }
    
    // 6️⃣ 완료 메시지
    console.log('✅ 프라그마틱 게임 정렬 완료!');
    console.log(`   - 매핑된 게임: ${mappedGames.size}개`);
    console.log(`   - 미매칭 게임: ${unmappedGames.length}개`);
    console.log(`   - 총 처리: ${updates.length + unmappedGames.length}/${pragmaticGames.length}개\n`);
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

main();
