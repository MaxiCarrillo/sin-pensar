import type { MainDeckCardCount, TurnDuration } from '../constants/setup.ts'
import type { CardDraftSession, CardId } from './card-draft.ts'
import type { Player, TeamAssignment, TeamId } from './setup.ts'

export const GAMEPLAY_PHASES = {
  handoff: 'handoff',
  activeTurn: 'active-turn',
  lightningAttribution: 'lightning-attribution',
  concealedActive: 'concealed-active',
  timeExpired: 'time-expired',
  stageComplete: 'stage-complete',
  gameComplete: 'game-complete',
  results: 'results',
} as const

export const GAMEPLAY_STAGES = [
  {
    index: 0,
    kind: 'talk',
    label: 'RONDA 1',
    name: 'Ronda 1',
    rule: 'Hablar',
    source: 'main',
    backgroundColor: 'var(--color-primary-dark)',
    actionColor: 'var(--color-primary)',
  },
  {
    index: 1,
    kind: 'mime',
    label: 'RONDA 2',
    name: 'Ronda 2',
    rule: 'Mímica',
    source: 'main',
    backgroundColor: 'var(--color-tertiary-dark)',
    actionColor: 'var(--color-tertiary)',
  },
  {
    index: 2,
    kind: 'lightning',
    label: 'RELÁMPAGO',
    name: 'Relámpago',
    rule: 'Todo permitido',
    source: 'lightning',
    backgroundColor: 'var(--color-primary-dark)',
    actionColor: 'var(--color-primary)',
  },
  {
    index: 3,
    kind: 'sounds',
    label: 'RONDA 3',
    name: 'Ronda 3',
    rule: 'Sonidos',
    source: 'main',
    backgroundColor: 'var(--color-secondary-dark)',
    actionColor: 'var(--color-secondary)',
  },
] as const

export type GameplayPhase = (typeof GAMEPLAY_PHASES)[keyof typeof GAMEPLAY_PHASES]
export type GameplayStage = (typeof GAMEPLAY_STAGES)[number]
export type GameplayStageIndex = GameplayStage['index']
export type GameplayStageKind = GameplayStage['kind']

export interface GameplaySetupInput {
  ownerPlayerId: string
  players: readonly Player[]
  turnDuration: TurnDuration
  mainDeckCardCount: MainDeckCardCount
  teamCount: number
  teamAssignment: TeamAssignment
  cardDraft: CardDraftSession
  knownCardIds: readonly CardId[]
}

export interface GameplayTeam {
  id: TeamId
  name: string
  playerIds: string[]
}

export interface GameplayTeamScore {
  teamId: TeamId
  score: number
}

export interface GameplayTurnStats {
  correct: number
  passed: number
}

export interface PendingLightningAttribution {
  readonly cardId: CardId
  readonly decidedAt: number
  readonly pausedAt: number
}

export interface GameplayTurnResult {
  turnNumber: number
  stageIndex: GameplayStageIndex
  stageKind: GameplayStageKind
  teamId: TeamId
  playerId: string
  correct: number
  passed: number
  endReason: 'timeout' | 'stage-complete'
}

export interface GameplayStageResult {
  stageIndex: GameplayStageIndex
  stageKind: GameplayStageKind
  completedByTeamId: TeamId
  completedByPlayerId: string
  scores: GameplayTeamScore[]
}

interface GameplayStateCore {
  setupKey: string
  turnDuration: TurnDuration
  mainDeckCardIds: CardId[]
  lightningDeckCardIds: CardId[]
  stageIndex: GameplayStageIndex
  stageKind: GameplayStageKind
  pendingCardIds: CardId[]
  teams: GameplayTeam[]
  scores: GameplayTeamScore[]
  currentTeamIndex: number
  playerCursors: number[]
  turnNumber: number
  turnStats: GameplayTurnStats
  completedTurns: GameplayTurnResult[]
  completedStages: GameplayStageResult[]
}

export type GameplayState =
  | (GameplayStateCore & {
      phase: 'handoff'
      startedAt: null
      deadline: null
    })
  | (GameplayStateCore & {
      phase: 'active-turn'
      startedAt: number
      deadline: number
    })
  | (GameplayStateCore & {
      phase: 'lightning-attribution'
      startedAt: number
      deadline: number
      pendingAttribution: PendingLightningAttribution
    })
  | (GameplayStateCore & {
      phase: 'concealed-active'
      startedAt: number
      deadline: number
    })
  | (GameplayStateCore & {
      phase: 'time-expired'
      startedAt: null
      deadline: null
    })
  | (GameplayStateCore & {
      phase: 'stage-complete'
      startedAt: null
      deadline: null
    })
  | (GameplayStateCore & {
      phase: 'game-complete'
      startedAt: null
      deadline: null
    })
  | (GameplayStateCore & {
      phase: 'results'
      startedAt: null
      deadline: null
    })

export interface CurrentTurnParticipant {
  team: GameplayTeam
  teamIndex: number
  playerId: string
  playerIndex: number
}

export type GameplaySetupRejectReason =
  | 'invalid-owner'
  | 'invalid-roster'
  | 'invalid-turn-duration'
  | 'invalid-main-count'
  | 'invalid-team-assignment'
  | 'incomplete-card-draft'
  | 'invalid-card-draft'
  | 'duplicate-source-card'
  | 'empty-main-deck'
  | 'empty-lightning-deck'

export type GameplaySetupValidation =
  | {
      kind: 'valid'
      setupKey: string
      teams: GameplayTeam[]
      mainDeckCardIds: CardId[]
      lightningDeckCardIds: CardId[]
    }
  | { kind: 'rejected'; reason: GameplaySetupRejectReason }

export type GameplayCreationResult =
  | { kind: 'created'; state: GameplayState }
  | { kind: 'rejected'; reason: GameplaySetupRejectReason }

export type GameplayTransitionRejectReason =
  | 'missing-game'
  | 'invalid-phase'
  | 'invalid-timestamp'
  | 'deadline-not-reached'
  | 'stale-card'
  | 'empty-deck'
  | 'invalid-participant'
  | 'invalid-player-membership'
  | 'invalid-stage'
  | 'attribution-required'
  | 'final-stage'

export type GameplayTransitionResult =
  | { kind: 'success'; state: GameplayState }
  | { kind: 'rejected'; reason: GameplayTransitionRejectReason }

export type GameplayStartResult =
  | { kind: 'started'; state: GameplayState }
  | { kind: 'existing'; state: GameplayState }
  | { kind: 'rejected'; reason: GameplaySetupRejectReason }

export interface WinningTeam {
  id: TeamId
  name: string
  score: number
}
