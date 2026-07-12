export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: Color;
}

export interface Move {
  from: string;
  to: string;
  promotion?: PieceType;
  san?: string;
  piece?: Piece;
  captured?: Piece | null;
  flags: {
    capture?: boolean;
    doublePush?: boolean;
    enPassant?: boolean;
    castleKingSide?: boolean;
    castleQueenSide?: boolean;
    promotion?: boolean;
    check?: boolean;
    mate?: boolean;
  };
}

export interface HistoryEntry {
  move: Move;
  fenBefore: string;
  fenAfter: string;
}

export interface GameStatus {
  turn: Color;
  inCheck: boolean;
  checkmate: boolean;
  stalemate: boolean;
  draw: boolean;
  drawReason: null | 'threefold' | 'fifty-move' | 'insufficient-material' | 'stalemate';
  legalMoves: number;
}

export const START_FEN = 'rn1qkbnr/pppbpppp/8/3p4/3P4/3B1N2/PPPNPPPP/R1BQK2R w KQkq - 0 1';
export const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
const PIECE_VALUES: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const KNIGHT_OFFSETS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];
const KING_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const QUEEN_DIRS = [...BISHOP_DIRS, ...ROOK_DIRS];

function indexToCoords(index: number) {
  return { row: Math.floor(index / 8), col: index % 8 };
}

function coordsToIndex(row: number, col: number) {
  return row * 8 + col;
}

export function squareToIndex(square: string) {
  const file = square[0];
  const rank = square[1];
  const col = FILES.indexOf(file as (typeof FILES)[number]);
  const rankIndex = RANKS.indexOf(rank as (typeof RANKS)[number]);
  if (col < 0 || rankIndex < 0) throw new Error(`Invalid square: ${square}`);
  const row = 7 - rankIndex;
  return coordsToIndex(row, col);
}

export function indexToSquare(index: number) {
  const { row, col } = indexToCoords(index);
  return `${FILES[col]}${8 - row}`;
}

function clonePiece(piece: Piece | null): Piece | null {
  return piece ? { ...piece } : null;
}

function boardKey(board: Array<Piece | null>, turn: Color, castling: string, enPassant: string | null) {
  const placement = board
    .map((piece) => (piece ? `${piece.color}${piece.type}` : '..'))
    .join('');
  return `${placement}|${turn}|${castling || '-'}|${enPassant || '-'}`;
}

export class ChessEngine {
  board: Array<Piece | null> = new Array(64).fill(null);
  turn: Color = 'w';
  castling = 'KQkq';
  enPassant: string | null = null;
  halfmoveClock = 0;
  fullmoveNumber = 1;
  history: HistoryEntry[] = [];
  private repetition = new Map<string, number>();

  constructor(fen = STANDARD_START_FEN) {
    this.loadFEN(fen);
  }

  clone() {
    const engine = new ChessEngine(this.exportFEN());
    engine.history = this.history.map((entry) => ({
      move: JSON.parse(JSON.stringify(entry.move)),
      fenBefore: entry.fenBefore,
      fenAfter: entry.fenAfter,
    }));
    engine.repetition = new Map(this.repetition);
    return engine;
  }

  reset(fen = STANDARD_START_FEN) {
    this.loadFEN(fen);
  }

  loadFEN(fen: string) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length !== 6) throw new Error('Invalid FEN');
    const [placement, turn, castling, enPassant, halfmove, fullmove] = parts;
    const rows = placement.split('/');
    if (rows.length !== 8) throw new Error('Invalid FEN placement');
    this.board = new Array(64).fill(null);
    rows.forEach((row, rowIndex) => {
      let col = 0;
      for (const char of row) {
        if (/\d/.test(char)) {
          col += Number(char);
          continue;
        }
        const color = char === char.toUpperCase() ? 'w' : 'b';
        const type = char.toLowerCase() as PieceType;
        this.board[coordsToIndex(rowIndex, col)] = { color, type };
        col += 1;
      }
      if (col !== 8) throw new Error('Invalid FEN row width');
    });
    this.turn = turn as Color;
    this.castling = castling === '-' ? '' : castling;
    this.enPassant = enPassant === '-' ? null : enPassant;
    this.halfmoveClock = Number(halfmove);
    this.fullmoveNumber = Number(fullmove);
    this.history = [];
    this.repetition = new Map();
    this.bumpRepetition();
  }

  exportFEN() {
    const rows: string[] = [];
    for (let row = 0; row < 8; row += 1) {
      let line = '';
      let empty = 0;
      for (let col = 0; col < 8; col += 1) {
        const piece = this.board[coordsToIndex(row, col)];
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty) {
          line += String(empty);
          empty = 0;
        }
        const char = piece.type;
        line += piece.color === 'w' ? char.toUpperCase() : char;
      }
      if (empty) line += String(empty);
      rows.push(line);
    }
    return `${rows.join('/')} ${this.turn} ${this.castling || '-'} ${this.enPassant || '-'} ${this.halfmoveClock} ${this.fullmoveNumber}`;
  }

  getPiece(square: string) {
    return clonePiece(this.board[squareToIndex(square)]);
  }

  setPiece(square: string, piece: Piece | null) {
    this.board[squareToIndex(square)] = clonePiece(piece);
  }

  private bumpRepetition() {
    const key = boardKey(this.board, this.turn, this.castling, this.enPassant);
    this.repetition.set(key, (this.repetition.get(key) ?? 0) + 1);
  }

  private rebuildRepetition() {
    const clonedHistory = [...this.history];
    const fen = this.exportFEN();
    this.loadFEN(fen);
    const entries = [...clonedHistory];
    this.history = [];
    this.repetition = new Map();
    this.bumpRepetition();
    for (const entry of entries) {
      this.makeMove({ from: entry.move.from, to: entry.move.to, promotion: entry.move.promotion }, false);
    }
  }

  private isInside(row: number, col: number) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  private findKing(color: Color) {
    const index = this.board.findIndex((piece) => piece?.type === 'k' && piece.color === color);
    if (index < 0) throw new Error(`King not found for ${color}`);
    return indexToSquare(index);
  }

  isSquareAttacked(square: string, byColor: Color) {
    const target = squareToIndex(square);
    const { row: tr, col: tc } = indexToCoords(target);

    const pawnDir = byColor === 'w' ? -1 : 1;
    const pawnAttackRow = tr - pawnDir;
    for (const dc of [-1, 1]) {
      const c = tc + dc;
      if (!this.isInside(pawnAttackRow, c)) continue;
      const piece = this.board[coordsToIndex(pawnAttackRow, c)];
      if (piece?.color === byColor && piece.type === 'p') return true;
    }

    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const r = tr + dr;
      const c = tc + dc;
      if (!this.isInside(r, c)) continue;
      const piece = this.board[coordsToIndex(r, c)];
      if (piece?.color === byColor && piece.type === 'n') return true;
    }

    for (const [dr, dc] of BISHOP_DIRS) {
      let r = tr + dr;
      let c = tc + dc;
      while (this.isInside(r, c)) {
        const piece = this.board[coordsToIndex(r, c)];
        if (piece) {
          if (piece.color === byColor && (piece.type === 'b' || piece.type === 'q')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    for (const [dr, dc] of ROOK_DIRS) {
      let r = tr + dr;
      let c = tc + dc;
      while (this.isInside(r, c)) {
        const piece = this.board[coordsToIndex(r, c)];
        if (piece) {
          if (piece.color === byColor && (piece.type === 'r' || piece.type === 'q')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    for (const [dr, dc] of KING_OFFSETS) {
      const r = tr + dr;
      const c = tc + dc;
      if (!this.isInside(r, c)) continue;
      const piece = this.board[coordsToIndex(r, c)];
      if (piece?.color === byColor && piece.type === 'k') return true;
    }

    return false;
  }

  inCheck(color = this.turn) {
    const kingSquare = this.findKing(color);
    return this.isSquareAttacked(kingSquare, color === 'w' ? 'b' : 'w');
  }

  private addMove(list: Move[], move: Move) {
    const clone = this.clone();
    clone.performMove({
      ...move,
      piece: move.piece ? { ...move.piece } : move.piece,
      captured: move.captured ? { ...move.captured } : move.captured,
      flags: { ...move.flags },
    }, false);
    if (!clone.inCheck(move.piece?.color ?? this.turn)) {
      move.flags.check = false;
      move.flags.mate = false;
      move.san = this.computeSAN(move, false, false);
      list.push(move);
    }
  }

  private computeSAN(move: Move, check: boolean, mate: boolean) {
    const pieceType = move.piece?.type ?? 'p';
    if (move.flags.castleKingSide) return `O-O${mate ? '#' : check ? '+' : ''}`;
    if (move.flags.castleQueenSide) return `O-O-O${mate ? '#' : check ? '+' : ''}`;
    const pieceChar = pieceType === 'p' ? '' : pieceType.toUpperCase();
    const capture = move.flags.capture || move.flags.enPassant ? 'x' : '';
    const fromFile = move.from[0];
    const target = move.to;
    const promotion = move.flags.promotion && move.promotion ? `=${move.promotion.toUpperCase()}` : '';
    const pawnPrefix = pieceType === 'p' && capture ? fromFile : '';
    return `${pieceChar}${pawnPrefix}${capture}${target}${promotion}${mate ? '#' : check ? '+' : ''}`;
  }

  generateLegalMoves(color = this.turn): Move[] {
    const moves: Move[] = [];
    for (let index = 0; index < 64; index += 1) {
      const piece = this.board[index];
      if (!piece || piece.color !== color) continue;
      const from = indexToSquare(index);
      const { row, col } = indexToCoords(index);

      if (piece.type === 'p') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const promotionRow = color === 'w' ? 0 : 7;
        const forwardRow = row + dir;
        if (this.isInside(forwardRow, col) && !this.board[coordsToIndex(forwardRow, col)]) {
          const to = indexToSquare(coordsToIndex(forwardRow, col));
          if (forwardRow === promotionRow) {
            (['q', 'r', 'b', 'n'] as PieceType[]).forEach((promotion) => {
              this.addMove(moves, { from, to, promotion, piece, captured: null, flags: { promotion: true } });
            });
          } else {
            this.addMove(moves, { from, to, piece, captured: null, flags: {} });
          }
          if (row === startRow) {
            const doubleRow = row + dir * 2;
            if (!this.board[coordsToIndex(doubleRow, col)]) {
              this.addMove(moves, {
                from,
                to: indexToSquare(coordsToIndex(doubleRow, col)),
                piece,
                captured: null,
                flags: { doublePush: true },
              });
            }
          }
        }
        for (const dc of [-1, 1]) {
          const captureRow = row + dir;
          const captureCol = col + dc;
          if (!this.isInside(captureRow, captureCol)) continue;
          const targetIndex = coordsToIndex(captureRow, captureCol);
          const target = this.board[targetIndex];
          const to = indexToSquare(targetIndex);
          if (target && target.color !== color) {
            if (captureRow === promotionRow) {
              (['q', 'r', 'b', 'n'] as PieceType[]).forEach((promotion) => {
                this.addMove(moves, { from, to, promotion, piece, captured: target, flags: { capture: true, promotion: true } });
              });
            } else {
              this.addMove(moves, { from, to, piece, captured: target, flags: { capture: true } });
            }
          }
          if (this.enPassant === to) {
            const capturedPawn = this.board[coordsToIndex(row, captureCol)];
            this.addMove(moves, { from, to, piece, captured: capturedPawn, flags: { capture: true, enPassant: true } });
          }
        }
      }

      if (piece.type === 'n') {
        for (const [dr, dc] of KNIGHT_OFFSETS) {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) continue;
          const target = this.board[coordsToIndex(r, c)];
          if (!target || target.color !== color) {
            this.addMove(moves, {
              from,
              to: indexToSquare(coordsToIndex(r, c)),
              piece,
              captured: target,
              flags: target ? { capture: true } : {},
            });
          }
        }
      }

      if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
        const dirs = piece.type === 'b' ? BISHOP_DIRS : piece.type === 'r' ? ROOK_DIRS : QUEEN_DIRS;
        for (const [dr, dc] of dirs) {
          let r = row + dr;
          let c = col + dc;
          while (this.isInside(r, c)) {
            const target = this.board[coordsToIndex(r, c)];
            if (!target) {
              this.addMove(moves, { from, to: indexToSquare(coordsToIndex(r, c)), piece, captured: null, flags: {} });
            } else {
              if (target.color !== color) {
                this.addMove(moves, {
                  from,
                  to: indexToSquare(coordsToIndex(r, c)),
                  piece,
                  captured: target,
                  flags: { capture: true },
                });
              }
              break;
            }
            r += dr;
            c += dc;
          }
        }
      }

      if (piece.type === 'k') {
        for (const [dr, dc] of KING_OFFSETS) {
          const r = row + dr;
          const c = col + dc;
          if (!this.isInside(r, c)) continue;
          const target = this.board[coordsToIndex(r, c)];
          if (!target || target.color !== color) {
            this.addMove(moves, {
              from,
              to: indexToSquare(coordsToIndex(r, c)),
              piece,
              captured: target,
              flags: target ? { capture: true } : {},
            });
          }
        }

        const enemy = color === 'w' ? 'b' : 'w';
        const kingSquare = color === 'w' ? 'e1' : 'e8';
        if (from === kingSquare && !this.inCheck(color)) {
          if ((color === 'w' ? this.castling.includes('K') : this.castling.includes('k'))
            && !this.board[squareToIndex(color === 'w' ? 'f1' : 'f8')]
            && !this.board[squareToIndex(color === 'w' ? 'g1' : 'g8')]
            && !this.isSquareAttacked(color === 'w' ? 'f1' : 'f8', enemy)
            && !this.isSquareAttacked(color === 'w' ? 'g1' : 'g8', enemy)) {
            this.addMove(moves, {
              from,
              to: color === 'w' ? 'g1' : 'g8',
              piece,
              captured: null,
              flags: { castleKingSide: true },
            });
          }
          if ((color === 'w' ? this.castling.includes('Q') : this.castling.includes('q'))
            && !this.board[squareToIndex(color === 'w' ? 'd1' : 'd8')]
            && !this.board[squareToIndex(color === 'w' ? 'c1' : 'c8')]
            && !this.board[squareToIndex(color === 'w' ? 'b1' : 'b8')]
            && !this.isSquareAttacked(color === 'w' ? 'd1' : 'd8', enemy)
            && !this.isSquareAttacked(color === 'w' ? 'c1' : 'c8', enemy)) {
            this.addMove(moves, {
              from,
              to: color === 'w' ? 'c1' : 'c8',
              piece,
              captured: null,
              flags: { castleQueenSide: true },
            });
          }
        }
      }
    }
    return moves;
  }

  private performMove(move: Move, recordHistory = true) {
    const fenBefore = this.exportFEN();
    const fromIndex = squareToIndex(move.from);
    const toIndex = squareToIndex(move.to);
    const piece = this.board[fromIndex] ?? move.piece;
    if (!piece) throw new Error('No piece at source square');
    const captured = move.flags.enPassant
      ? this.board[squareToIndex(`${move.to[0]}${move.from[1]}`)]
      : this.board[toIndex] ?? move.captured ?? null;

    this.board[fromIndex] = null;
    if (move.flags.enPassant) {
      this.board[squareToIndex(`${move.to[0]}${move.from[1]}`)] = null;
    }

    if (move.flags.castleKingSide) {
      const rookFrom = squareToIndex(piece.color === 'w' ? 'h1' : 'h8');
      const rookTo = squareToIndex(piece.color === 'w' ? 'f1' : 'f8');
      this.board[rookTo] = this.board[rookFrom];
      this.board[rookFrom] = null;
    }
    if (move.flags.castleQueenSide) {
      const rookFrom = squareToIndex(piece.color === 'w' ? 'a1' : 'a8');
      const rookTo = squareToIndex(piece.color === 'w' ? 'd1' : 'd8');
      this.board[rookTo] = this.board[rookFrom];
      this.board[rookFrom] = null;
    }

    this.board[toIndex] = move.flags.promotion ? { color: piece.color, type: move.promotion ?? 'q' } : piece;

    this.enPassant = null;
    if (piece.type === 'p' && move.flags.doublePush) {
      const targetRank = piece.color === 'w' ? '3' : '6';
      this.enPassant = `${move.from[0]}${targetRank}`;
    }

    if (piece.type === 'k') {
      this.castling = this.castling.replace(piece.color === 'w' ? /[KQ]/g : /[kq]/g, '');
    }
    if (piece.type === 'r') {
      if (move.from === 'a1') this.castling = this.castling.replace('Q', '');
      if (move.from === 'h1') this.castling = this.castling.replace('K', '');
      if (move.from === 'a8') this.castling = this.castling.replace('q', '');
      if (move.from === 'h8') this.castling = this.castling.replace('k', '');
    }
    if (captured?.type === 'r') {
      if (move.to === 'a1') this.castling = this.castling.replace('Q', '');
      if (move.to === 'h1') this.castling = this.castling.replace('K', '');
      if (move.to === 'a8') this.castling = this.castling.replace('q', '');
      if (move.to === 'h8') this.castling = this.castling.replace('k', '');
    }

    if (piece.type === 'p' || captured) this.halfmoveClock = 0;
    else this.halfmoveClock += 1;

    if (this.turn === 'b') this.fullmoveNumber += 1;
    this.turn = this.turn === 'w' ? 'b' : 'w';
    this.bumpRepetition();

    const finalizedMove: Move = {
      ...move,
      piece,
      captured,
      san: move.san,
      flags: { ...move.flags },
    };
    if (recordHistory) {
      const fenAfter = this.exportFEN();
      this.history.push({ move: finalizedMove, fenBefore, fenAfter });
    }
    return finalizedMove;
  }

  makeMove(input: { from: string; to: string; promotion?: PieceType }, validate = true) {
    if (!validate) {
      const piece = this.getPiece(input.from);
      if (!piece) throw new Error(`Illegal move: ${input.from}-${input.to}`);
      const target = this.getPiece(input.to);
      const move: Move = {
        from: input.from,
        to: input.to,
        promotion: input.promotion,
        piece,
        captured: target,
        flags: {
          capture: Boolean(target),
          promotion: Boolean(input.promotion),
        },
      };
      return this.performMove(move, true);
    }
    const legalMoves = this.generateLegalMoves(this.turn);
    const move = legalMoves.find((candidate) => candidate.from === input.from && candidate.to === input.to && (candidate.promotion ?? null) === (input.promotion ?? null));
    if (!move) throw new Error(`Illegal move: ${input.from}-${input.to}`);
    return this.performMove(move, true);
  }

  undoMove() {
    const last = this.history.pop();
    if (!last) return null;
    const replay = [...this.history];
    this.loadFEN(replay[0]?.fenBefore ?? last.fenBefore);
    this.history = [];
    this.repetition = new Map();
    this.bumpRepetition();
    replay.forEach((entry) => {
      this.performMove(entry.move, true);
    });
    return last.move;
  }

  isInsufficientMaterial() {
    const pieces = this.board.filter(Boolean) as Piece[];
    const nonKings = pieces.filter((piece) => piece.type !== 'k');
    if (nonKings.length === 0) return true;
    if (nonKings.length === 1 && ['b', 'n'].includes(nonKings[0].type)) return true;
    if (nonKings.length === 2 && nonKings.every((piece) => piece.type === 'b')) {
      const bishopSquares = this.board
        .map((piece, index) => (piece?.type === 'b' ? index : -1))
        .filter((index) => index >= 0)
        .map((index) => {
          const { row, col } = indexToCoords(index);
          return (row + col) % 2;
        });
      return bishopSquares[0] === bishopSquares[1];
    }
    return false;
  }

  isThreefoldRepetition() {
    const key = boardKey(this.board, this.turn, this.castling, this.enPassant);
    return (this.repetition.get(key) ?? 0) >= 3;
  }

  getStatus(): GameStatus {
    const legalMoves = this.generateLegalMoves(this.turn).length;
    const inCheck = this.inCheck(this.turn);
    if (legalMoves === 0 && inCheck) {
      return { turn: this.turn, inCheck, checkmate: true, stalemate: false, draw: false, drawReason: null, legalMoves };
    }
    if (legalMoves === 0) {
      return { turn: this.turn, inCheck, checkmate: false, stalemate: true, draw: true, drawReason: 'stalemate', legalMoves };
    }
    if (this.isThreefoldRepetition()) {
      return { turn: this.turn, inCheck, checkmate: false, stalemate: false, draw: true, drawReason: 'threefold', legalMoves };
    }
    if (this.halfmoveClock >= 100) {
      return { turn: this.turn, inCheck, checkmate: false, stalemate: false, draw: true, drawReason: 'fifty-move', legalMoves };
    }
    if (this.isInsufficientMaterial()) {
      return { turn: this.turn, inCheck, checkmate: false, stalemate: false, draw: true, drawReason: 'insufficient-material', legalMoves };
    }
    return { turn: this.turn, inCheck, checkmate: false, stalemate: false, draw: false, drawReason: null, legalMoves };
  }

  getMoveHistory() {
    return this.history.map((entry) => ({ ...entry }));
  }

  toPGN(headers: Record<string, string> = {}) {
    const defaultHeaders = {
      Event: 'WARHEX Match',
      Site: 'WARHEX',
      Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      Round: '1',
      White: headers.White ?? 'White',
      Black: headers.Black ?? 'Black',
      Result: headers.Result ?? '*',
      ...headers,
    };
    const headerBlock = Object.entries(defaultHeaders)
      .map(([key, value]) => `[${key} "${value}"]`)
      .join('\n');
    const moves = this.history
      .map((entry) => entry.move.san ?? `${entry.move.from}${entry.move.to}`)
      .reduce<string[]>((acc, san, index) => {
        if (index % 2 === 0) acc.push(`${Math.floor(index / 2) + 1}. ${san}`);
        else acc[acc.length - 1] += ` ${san}`;
        return acc;
      }, [])
      .join(' ');
    return `${headerBlock}\n\n${moves} ${defaultHeaders.Result}`.trim();
  }

  loadPGN(pgn: string) {
    this.reset(STANDARD_START_FEN);
    const movesSection = pgn
      .split('\n')
      .filter((line) => !line.startsWith('['))
      .join(' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\d+\./g, ' ')
      .trim();
    const tokens = movesSection.split(/\s+/).filter((token) => token && !['1-0', '0-1', '1/2-1/2', '*'].includes(token));
    for (const token of tokens) {
      const legal = this.generateLegalMoves(this.turn);
      const move = legal.find((candidate) => candidate.san === token || `${candidate.from}${candidate.to}${candidate.promotion ?? ''}` === token.toLowerCase());
      if (!move) throw new Error(`Unable to parse PGN token: ${token}`);
      this.makeMove({ from: move.from, to: move.to, promotion: move.promotion });
    }
  }

  exportState() {
    return {
      fen: this.exportFEN(),
      turn: this.turn,
      board: this.board.map(clonePiece),
      legalMoves: this.generateLegalMoves(this.turn),
      status: this.getStatus(),
      history: this.getMoveHistory(),
    };
  }

  evaluateMaterial(color: Color) {
    return this.board.reduce((score, piece) => {
      if (!piece) return score;
      const value = PIECE_VALUES[piece.type];
      return score + (piece.color === color ? value : -value);
    }, 0);
  }
}
