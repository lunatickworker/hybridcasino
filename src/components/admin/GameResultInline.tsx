import { Badge } from "../ui/badge";
import { useMemo } from "react";

interface GameResultInlineProps {
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
    <div className="inline-flex flex-col items-center justify-center bg-white rounded-lg border-2 border-slate-200 shadow-lg w-16 h-24 p-2">
      <div className={`text-2xl font-bold leading-none mb-1 ${SUIT_COLORS[card.suit]}`}>
        {RANK_DISPLAY[card.rank]}
      </div>
      <div className={`text-3xl leading-none ${SUIT_COLORS[card.suit]}`}>
        {SUITS[card.suit]}
      </div>
    </div>
  );
}

export function GameResultInline({ external, gameTitle }: GameResultInlineProps) {
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

    return null;
  }, [external]);

  if (!parsedResult) {
    return (
      <div className="text-sm text-slate-500 p-2">
        게임 결과 없음
      </div>
    );
  }

  if (parsedResult.type === 'baccarat') {
    const playerWon = parsedResult.outcome === 'Player';
    const bankerWon = parsedResult.outcome === 'Banker';
    const tie = parsedResult.outcome === 'Tie';
    
    return (
      <div className="flex items-center gap-6 bg-gradient-to-r from-slate-900/80 via-slate-800/80 to-slate-900/80 rounded-2xl p-6 border-2 border-slate-700/50 shadow-2xl backdrop-blur-sm">
        {/* Player Section */}
        <div className={`flex flex-col items-center gap-3 p-4 rounded-xl transition-all ${
          playerWon 
            ? 'bg-gradient-to-br from-blue-600/30 to-blue-800/30 border-2 border-blue-500 shadow-lg shadow-blue-500/50' 
            : 'bg-slate-800/40 border border-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
              PLAYER
            </span>
            {playerWon && <span className="text-3xl">👑</span>}
          </div>
          <div className={`text-5xl font-black ${
            playerWon ? 'text-blue-400' : 'text-slate-400'
          }`}>
            {parsedResult.player.score}
          </div>
          <div className="flex gap-2">
            {parsedResult.player.cards.map((card, idx) => (
              <CardDisplay key={idx} card={card} />
            ))}
          </div>
        </div>

        {/* VS Section */}
        <div className="flex flex-col items-center gap-2 px-4">
          <div className="text-3xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-pulse">
            VS
          </div>
          {parsedResult.outcome && (
            <Badge 
              variant={playerWon ? 'default' : bankerWon ? 'secondary' : 'outline'}
              className={`text-base px-4 py-1 font-bold ${
                playerWon ? 'bg-blue-600 text-white' : 
                bankerWon ? 'bg-red-600 text-white' : 
                'bg-slate-600 text-white'
              }`}
            >
              {parsedResult.outcome}
            </Badge>
          )}
        </div>

        {/* Banker Section */}
        <div className={`flex flex-col items-center gap-3 p-4 rounded-xl transition-all ${
          bankerWon 
            ? 'bg-gradient-to-br from-red-600/30 to-red-800/30 border-2 border-red-500 shadow-lg shadow-red-500/50' 
            : 'bg-slate-800/40 border border-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
              BANKER
            </span>
            {bankerWon && <span className="text-3xl">👑</span>}
          </div>
          <div className={`text-5xl font-black ${
            bankerWon ? 'text-red-400' : 'text-slate-400'
          }`}>
            {parsedResult.banker.score}
          </div>
          <div className="flex gap-2">
            {parsedResult.banker.cards.map((card, idx) => (
              <CardDisplay key={idx} card={card} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}