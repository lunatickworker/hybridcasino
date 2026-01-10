import { useMemo } from "react";
import { Badge } from "../ui/badge";

interface GameResultDetailProps {
  external: {
    id: string | number;
    detail: any;
  } | null;
  gameTitle?: string;
}

// 카드 수트 심볼
const SUITS = {
  H: '♥',
  S: '♠',
  D: '♦',
  C: '♣'
};

// 카드 수트 색상
const SUIT_COLORS = {
  H: 'text-red-600',
  S: 'text-slate-900',
  D: 'text-red-600',
  C: 'text-slate-900'
};

// 카드 랭크 표시
const RANK_DISPLAY: Record<string, string> = {
  'A': 'A',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  'T': '10',
  'J': 'J',
  'Q': 'Q',
  'K': 'K'
};

interface Card {
  suit: 'H' | 'S' | 'D' | 'C';
  rank: string;
}

// 카드 문자열 파싱 (예: "3H" -> {suit: 'H', rank: '3'})
function parseCard(cardStr: string): Card | null {
  if (!cardStr || cardStr.length < 2) return null;
  
  const rank = cardStr[0];
  const suit = cardStr[1] as 'H' | 'S' | 'D' | 'C';
  
  if (!SUITS[suit] || !RANK_DISPLAY[rank]) return null;
  
  return { suit, rank };
}

function CardDisplay({ card }: { card: Card }) {
  return (
    <div className="inline-flex flex-col items-center justify-center bg-white rounded border border-slate-300 shadow-sm w-10 h-14 p-1">
      <div className={`text-lg font-bold leading-none ${SUIT_COLORS[card.suit]}`}>
        {RANK_DISPLAY[card.rank]}
      </div>
      <div className={`text-2xl leading-none ${SUIT_COLORS[card.suit]}`}>
        {SUITS[card.suit]}
      </div>
    </div>
  );
}

export function GameResultDetail({ external, gameTitle }: GameResultDetailProps) {
  const parsedResult = useMemo(() => {
    if (!external?.detail?.data?.result) return null;

    const result = external.detail.data.result;
    const table = external.detail.data.table;
    const dealer = external.detail.data.dealer;
    
    // 바카라 게임 결과 파싱
    if (result.player?.cards && result.banker?.cards) {
      const playerCards = result.player.cards
        .map((c: string) => parseCard(c))
        .filter((c: Card | null) => c !== null) as Card[];
      
      const bankerCards = result.banker.cards
        .map((c: string) => parseCard(c))
        .filter((c: Card | null) => c !== null) as Card[];

      return {
        type: 'baccarat',
        player: {
          cards: playerCards,
          score: result.player.score ?? 0
        },
        banker: {
          cards: bankerCards,
          score: result.banker.score ?? 0
        },
        outcome: result.outcome || null,
        tableName: table?.name || null,
        dealerName: dealer?.name || null,
      };
    }

    // 다른 게임 타입도 추가 가능
    return null;
  }, [external]);

  if (!parsedResult) {
    return null;
  }

  if (parsedResult.type === 'baccarat') {
    return (
      <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-400">게임 결과</div>
          {parsedResult.outcome && (
            <Badge 
              variant={parsedResult.outcome === 'Player' ? 'default' : parsedResult.outcome === 'Banker' ? 'secondary' : 'outline'}
              className="ml-2"
            >
              {parsedResult.outcome}
            </Badge>
          )}
        </div>

        {/* 테이블 & 딜러 정보 */}
        {(parsedResult.tableName || parsedResult.dealerName) && (
          <div className="text-xs text-slate-500 mb-2 space-x-3">
            {parsedResult.tableName && <span>🎲 {parsedResult.tableName}</span>}
            {parsedResult.dealerName && <span>👤 {parsedResult.dealerName}</span>}
          </div>
        )}
        
        {/* Player */}
        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-300 w-16">Player</div>
          <div className="flex items-center gap-1">
            {parsedResult.player.cards.map((card, idx) => (
              <CardDisplay key={idx} card={card} />
            ))}
          </div>
          <div className="text-sm text-slate-400 ml-2">
            Score {parsedResult.player.score}
          </div>
        </div>

        {/* Banker */}
        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-300 w-16">Banker</div>
          <div className="flex items-center gap-1">
            {parsedResult.banker.cards.map((card, idx) => (
              <CardDisplay key={idx} card={card} />
            ))}
          </div>
          <div className="text-sm text-slate-400 ml-2">
            Score {parsedResult.banker.score}
          </div>
        </div>
      </div>
    );
  }

  return null;
}