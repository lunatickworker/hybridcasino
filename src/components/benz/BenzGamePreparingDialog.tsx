import { motion } from "motion/react";
import { Loader2, Zap } from "lucide-react";
import { Progress } from "../ui/progress";

type GameStage = 'deposit' | 'launch' | 'withdraw' | 'switch_deposit';

interface BenzGamePreparingDialogProps {
  show: boolean;
  stage?: GameStage;
  progress?: number;
}

/**
 * BENZ CASINO 전용 게임 준비 단계별 진행 모달
 * 보라/핑크 그라디언트 컨셉으로 럭셔리한 느낌
 * 
 * stage:
 * - 'deposit': 최초 게임 실행 시 입금
 * - 'launch': 게임 실행 중
 * - 'withdraw': 게임 전환 시 기존 게임 출금
 * - 'switch_deposit': 게임 전환 시 새 게임 입금
 */
export function BenzGamePreparingDialog({ show, stage = 'launch', progress }: BenzGamePreparingDialogProps) {
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
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none'
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative"
        style={{
          pointerEvents: 'auto'
        }}
      >
        {/* BENZ CASINO 스타일 로딩 박스 */}
        <div className="relative rounded-3xl p-12 shadow-2xl overflow-hidden">
          {/* 배경 그라디언트 */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/95 via-pink-900/95 to-purple-900/95"></div>
          
          {/* 애니메이션 배경 효과 */}
          <motion.div
            className="absolute inset-0 opacity-30"
            animate={{
              background: [
                'radial-gradient(circle at 20% 50%, rgba(168, 85, 247, 0.4) 0%, transparent 50%)',
                'radial-gradient(circle at 80% 50%, rgba(236, 72, 153, 0.4) 0%, transparent 50%)',
                'radial-gradient(circle at 50% 80%, rgba(168, 85, 247, 0.4) 0%, transparent 50%)',
                'radial-gradient(circle at 20% 50%, rgba(168, 85, 247, 0.4) 0%, transparent 50%)',
              ]
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "linear"
            }}
          />

          {/* 테두리 글로우 효과 */}
          <div className="absolute inset-0 rounded-3xl border-2 border-purple-400/40 shadow-[0_0_50px_rgba(168,85,247,0.3)]"></div>

          <div className="relative flex flex-col items-center gap-6">
            {/* 회전하는 번개 아이콘 */}
            <div className="relative">
              <motion.div
                animate={{ 
                  rotate: 360,
                  scale: [1, 1.1, 1]
                }}
                transition={{
                  rotate: { duration: 2, repeat: Infinity, ease: "linear" },
                  scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                }}
                className="relative"
              >
                <Zap className="w-20 h-20 text-pink-400 drop-shadow-[0_0_30px_rgba(236,72,153,0.9)]" fill="currentColor" />
              </motion.div>

              {/* 펄스 효과 */}
              <motion.div
                className="absolute inset-0 rounded-full bg-pink-500/30"
                animate={{
                  scale: [1, 2, 2],
                  opacity: [0.5, 0, 0]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeOut"
                }}
              />
            </div>

            {/* 로딩 스피너 */}
            <Loader2 className="w-12 h-12 text-purple-400 animate-spin drop-shadow-[0_0_15px_rgba(168,85,247,0.6)]" />

            {/* 메시지 */}
            <div className="text-center space-y-2">
              <h2 
                className="text-3xl font-black tracking-wide bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent"
                style={{
                  textShadow: '0 0 30px rgba(168, 85, 247, 0.5)'
                }}
              >
                {title}
              </h2>
              <p className="text-purple-200/90 text-lg font-medium">
                {message}
              </p>
            </div>

            {/* Progress 바 (선택) */}
            {progress !== undefined && (
              <div className="w-64">
                <div className="relative h-2 bg-purple-950/50 rounded-full overflow-hidden">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                    style={{ width: `${progress}%` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                  <motion.div
                    className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    animate={{
                      x: ['-100%', '100%']
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "linear"
                    }}
                  />
                </div>
                <p className="text-purple-200/60 text-sm text-center mt-2 font-medium">
                  {Math.round(progress)}%
                </p>
              </div>
            )}

            {/* 애니메이션 도트 */}
            <div className="flex gap-3">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.4, 1, 0.4]
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeInOut"
                  }}
                  className="w-3 h-3 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 shadow-lg shadow-pink-400/50"
                />
              ))}
            </div>

            {/* 하단 데코레이션 라인 */}
            <motion.div
              className="w-32 h-1 rounded-full bg-gradient-to-r from-transparent via-purple-400 to-transparent"
              animate={{
                opacity: [0.3, 0.8, 0.3],
                scaleX: [0.8, 1.2, 0.8]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}