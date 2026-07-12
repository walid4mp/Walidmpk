import { ChessEngine, type Color, type Move, type PieceType } from './chess.js';

const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const ROOK_TABLE = [
  0, 0, 0, 5, 5, 0, 0, 0,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  5, 10, 10, 10, 10, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const QUEEN_TABLE = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];

const KING_MIDDLE_TABLE = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];

const PIECE_VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const TABLES: Record<PieceType, number[]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_MIDDLE_TABLE,
};

function scoreForIndex(index: number, color: Color, table: number[]) {
  return color === 'w' ? table[index] : table[63 - index];
}

export function evaluatePosition(engine: ChessEngine, color: Color) {
  const status = engine.getStatus();
  if (status.checkmate) return engine.turn === color ? -999999 : 999999;
  if (status.draw) return 0;

  let score = 0;
  engine.board.forEach((piece, index) => {
    if (!piece) return;
    const base = PIECE_VALUE[piece.type] + scoreForIndex(index, piece.color, TABLES[piece.type]);
    score += piece.color === color ? base : -base;
  });

  const myMoves = engine.generateLegalMoves(color).length;
  const theirMoves = engine.generateLegalMoves(color === 'w' ? 'b' : 'w').length;
  score += (myMoves - theirMoves) * 3;
  if (engine.inCheck(color === 'w' ? 'b' : 'w')) score += 25;
  if (engine.inCheck(color)) score -= 25;
  return score;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
}

export class ChessAI {
  private nodes = 0;

  search(engine: ChessEngine, depth: number, color: Color = engine.turn): SearchResult {
    this.nodes = 0;
    const result = this.minimax(engine.clone(), depth, -Infinity, Infinity, true, color);
    return { ...result, depth, nodes: this.nodes };
  }

  private minimax(engine: ChessEngine, depth: number, alpha: number, beta: number, maximizing: boolean, color: Color): { move: Move | null; score: number } {
    this.nodes += 1;
    const status = engine.getStatus();
    if (depth === 0 || status.checkmate || status.draw || status.stalemate) {
      return { move: null, score: evaluatePosition(engine, color) };
    }

    const legalMoves = engine.generateLegalMoves(engine.turn).sort((a, b) => Number(Boolean(b.flags.capture)) - Number(Boolean(a.flags.capture)));
    let bestMove: Move | null = null;

    if (maximizing) {
      let bestScore = -Infinity;
      for (const move of legalMoves) {
        const child = engine.clone();
        child.makeMove({ from: move.from, to: move.to, promotion: move.promotion });
        const score = this.minimax(child, depth - 1, alpha, beta, false, color).score;
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return { move: bestMove, score: bestScore };
    }

    let bestScore = Infinity;
    for (const move of legalMoves) {
      const child = engine.clone();
      child.makeMove({ from: move.from, to: move.to, promotion: move.promotion });
      const score = this.minimax(child, depth - 1, alpha, beta, true, color).score;
      if (score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return { move: bestMove, score: bestScore };
  }
}
