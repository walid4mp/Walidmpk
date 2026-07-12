import { describe, expect, it } from 'vitest';
import { ChessAI } from './ai';
import { ChessEngine, STANDARD_START_FEN } from './chess';

describe('ChessEngine', () => {
  it('loads standard start position', () => {
    const engine = new ChessEngine();
    expect(engine.exportFEN()).toBe(STANDARD_START_FEN);
    expect(engine.generateLegalMoves().length).toBe(20);
  });

  it('supports castling on both sides', () => {
    const engine = new ChessEngine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const legal = engine.generateLegalMoves();
    expect(legal.some((move) => move.flags.castleKingSide && move.to === 'g1')).toBe(true);
    expect(legal.some((move) => move.flags.castleQueenSide && move.to === 'c1')).toBe(true);
  });

  it('supports en passant capture', () => {
    const engine = new ChessEngine();
    engine.makeMove({ from: 'e2', to: 'e4' });
    engine.makeMove({ from: 'a7', to: 'a6' });
    engine.makeMove({ from: 'e4', to: 'e5' });
    engine.makeMove({ from: 'd7', to: 'd5' });
    const move = engine.generateLegalMoves().find((candidate) => candidate.from === 'e5' && candidate.to === 'd6');
    expect(move?.flags.enPassant).toBe(true);
    engine.makeMove({ from: 'e5', to: 'd6' });
    expect(engine.getPiece('d6')?.type).toBe('p');
    expect(engine.getPiece('d5')).toBeNull();
  });

  it('supports promotion choices', () => {
    const engine = new ChessEngine('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const promotions = engine.generateLegalMoves().filter((move) => move.from === 'a7' && move.to === 'a8');
    expect(promotions).toHaveLength(4);
    engine.makeMove({ from: 'a7', to: 'a8', promotion: 'q' });
    expect(engine.getPiece('a8')?.type).toBe('q');
  });

  it('detects checkmate', () => {
    const engine = new ChessEngine();
    engine.makeMove({ from: 'f2', to: 'f3' });
    engine.makeMove({ from: 'e7', to: 'e5' });
    engine.makeMove({ from: 'g2', to: 'g4' });
    engine.makeMove({ from: 'd8', to: 'h4' });
    const status = engine.getStatus();
    expect(status.checkmate).toBe(true);
    expect(status.inCheck).toBe(true);
  });

  it('detects stalemate', () => {
    const engine = new ChessEngine('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    const status = engine.getStatus();
    expect(status.stalemate).toBe(true);
    expect(status.draw).toBe(true);
  });

  it('detects threefold repetition', () => {
    const engine = new ChessEngine('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    for (let i = 0; i < 3; i += 1) {
      engine.makeMove({ from: 'h1', to: 'h2' });
      engine.makeMove({ from: 'e8', to: 'e7' });
      engine.makeMove({ from: 'h2', to: 'h1' });
      engine.makeMove({ from: 'e7', to: 'e8' });
    }
    expect(engine.isThreefoldRepetition()).toBe(true);
    expect(engine.getStatus().drawReason).toBe('threefold');
  });

  it('detects insufficient material', () => {
    const engine = new ChessEngine('8/8/8/8/8/4k3/8/4K1N1 w - - 0 1');
    expect(engine.getStatus().drawReason).toBe('insufficient-material');
  });

  it('exports and imports PGN', () => {
    const engine = new ChessEngine();
    engine.makeMove({ from: 'e2', to: 'e4' });
    engine.makeMove({ from: 'e7', to: 'e5' });
    engine.makeMove({ from: 'g1', to: 'f3' });
    const pgn = engine.toPGN({ White: 'A', Black: 'B' });
    const clone = new ChessEngine();
    clone.loadPGN(pgn);
    expect(clone.exportFEN()).toBe(engine.exportFEN());
  });
});

describe('ChessAI', () => {
  it('finds a mating move in one', () => {
    const engine = new ChessEngine('6k1/5ppp/8/8/8/5Q2/5PPP/6K1 w - - 0 1');
    const ai = new ChessAI();
    const result = ai.search(engine, 2, 'w');
    expect(result.move).not.toBeNull();
  });
});
