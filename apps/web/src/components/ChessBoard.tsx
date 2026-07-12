import { useEffect, useMemo, useState } from 'react';
import { ChessEngine, type Move } from '../../../../packages/shared/src/index';

const PIECE_MAP: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

interface Props {
  fen: string;
  lastMove?: { from: string; to: string } | null;
  orientation?: 'w' | 'b';
  interactive?: boolean;
  onMove?: (move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => void;
}

export function ChessBoard({ fen, lastMove, orientation = 'w', interactive = true, onMove }: Props) {
  const engine = useMemo(() => new ChessEngine(fen), [fen]);
  const [selected, setSelected] = useState<string | null>(null);
  const [targets, setTargets] = useState<Move[]>([]);
  const [promotionChoice, setPromotionChoice] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    setSelected(null);
    setTargets([]);
    setPromotionChoice(null);
  }, [fen]);

  const legalMoves = engine.generateLegalMoves(engine.turn);
  const squares = (orientation === 'w'
    ? RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}`))
    : [...RANKS].reverse().flatMap((rank) => [...FILES].reverse().map((file) => `${file}${rank}`))
  );

  const selectSquare = (square: string) => {
    if (!interactive) return;
    const piece = engine.getPiece(square);
    const currentTargets = legalMoves.filter((move) => move.from === square);
    if (selected && targets.some((move) => move.to === square)) {
      const move = targets.find((candidate) => candidate.to === square)!;
      if (move.flags.promotion) {
        setPromotionChoice({ from: move.from, to: move.to });
      } else {
        onMove?.({ from: move.from, to: move.to });
      }
      setSelected(null);
      setTargets([]);
      return;
    }
    if (piece && piece.color === engine.turn) {
      setSelected(square);
      setTargets(currentTargets);
      return;
    }
    setSelected(null);
    setTargets([]);
  };

  return (
    <div className="board-shell">
      <div className="board-grid" role="grid" aria-label="Chess board">
        {squares.map((square, index) => {
          const piece = engine.getPiece(square);
          const moveTarget = targets.find((move) => move.to === square);
          const isDark = ((Math.floor(index / 8) + index) % 2) % 2 === 1;
          const isSelected = selected === square;
          const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
          const inCheck = piece?.type === 'k' && piece.color === engine.turn && engine.inCheck(engine.turn);
          return (
            <button
              key={square}
              type="button"
              className={[
                'square',
                isDark ? 'dark' : 'light',
                isSelected ? 'selected' : '',
                moveTarget ? 'target' : '',
                isLastMove ? 'last-move' : '',
                inCheck ? 'in-check' : '',
              ].join(' ')}
              aria-label={`Square ${square}${piece ? ` ${piece.color}${piece.type}` : ''}`}
              onClick={() => selectSquare(square)}
              draggable={interactive && Boolean(piece && piece.color === engine.turn)}
              onDragStart={(event) => event.dataTransfer.setData('text/plain', square)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const from = event.dataTransfer.getData('text/plain');
                if (!from) return;
                const move = legalMoves.find((candidate) => candidate.from === from && candidate.to === square);
                if (!move) return;
                if (move.flags.promotion) setPromotionChoice({ from, to: square });
                else onMove?.({ from, to: square });
              }}
            >
              <span className="square-label">{square}</span>
              {moveTarget && <span className="move-hint" />}
              <span className="piece">{piece ? PIECE_MAP[`${piece.color}${piece.type}`] : ''}</span>
            </button>
          );
        })}
      </div>
      {promotionChoice && (
        <div className="promotion-modal">
          {(['q', 'r', 'b', 'n'] as const).map((option) => (
            <button
              key={option}
              className="btn secondary"
              onClick={() => {
                onMove?.({ ...promotionChoice, promotion: option });
                setPromotionChoice(null);
              }}
            >
              {PIECE_MAP[`${engine.turn}${option}`]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
