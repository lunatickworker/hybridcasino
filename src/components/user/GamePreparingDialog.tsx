import { motion } from "motion/react";
import { Loader2, Crown } from "lucide-react";
import { Progress } from "../ui/progress";

type GameStage = 'deposit' | 'launch' | 'withdraw' | 'switch_deposit';

interface GamePreparingDialogProps {
  show: boolean;
  stage?: GameStage;
  progress?: number;
}

/**
 * 게임 준비 단계별 진행 모달
 * FINAL_FLOW_CONFIRMED.md Phase 6 구현
 * 
 * stage:
 * - 'deposit': 최초 게임 실행 시 입금
 * - 'launch': 게임 실행 중
 * - 'withdraw': 게임 전환 시 기존 게임 출금
 * - 'switch_deposit': 게임 전환 시 새 게임 입금
 */
export function GamePreparingDialog({ show, stage = 'launch', progress }: GamePreparingDialogProps) {
  if (!show) return null;

  // stage에 따른 메시지 및 타이틀
  const stageConfig: Record<GameStage, { title: string; message: string }> = {
    deposit: { title: '게임 준비중', message: '게임 입금 중...' },
    launch: { title: '게임 준비중', message: '게임 실행 중...' },
    withdraw: { title: '게임 종료중', message: '출금 실행 중...' },
    switch_deposit: { title: '게임 준비중', message: '새 게임 준비 중...' }
  };

  const { title, message } = stageConfig[stage] || { title: '게임 준비중', message: '게임 준비 중...' };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: 'transparent',
        pointerEvents: 'none'
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3 }}
        className="relative"
        style={{
          pointerEvents: 'auto'
        }}
      >
        {/* VIP Casino 스타일 로딩 박스 */}
        <div className="luxury-card rounded-3xl p-12 border-2 border-yellow-600/40 shadow-2xl backdrop-blur-sm bg-gradient-to-br from-black/90 via-slate-900/90 to-black/90">
          <div className="flex flex-col items-center gap-6">
            {/* 회전하는 크라운 아이콘 */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "linear"
              }}
              className="relative"
            >
              <Crown className="w-20 h-20 text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.9)]" />
            </motion.div>

            {/* 로딩 스피너 */}
            <Loader2 className="w-12 h-12 text-yellow-400 animate-spin" />

            {/* 메시지 */}
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold gold-text neon-glow tracking-wide">
                {title}
              </h2>
              <p className="text-yellow-200/80 text-lg">
                {message}
              </p>
            </div>

            {/* Progress 바 (선택) */}
            {progress !== undefined && (
              <div className="w-64">
                <Progress value={progress} className="h-2" />
                <p className="text-yellow-200/60 text-sm text-center mt-2">
                  {Math.round(progress)}%
                </p>
              </div>
            )}

            {/* 애니메이션 도트 */}
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.5, 1, 0.5]
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.2
                  }}
                  className="w-3 h-3 bg-yellow-400 rounded-full shadow-lg shadow-yellow-400/50"
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
