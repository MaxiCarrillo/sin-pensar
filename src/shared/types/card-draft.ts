import type { MainDeckCardCount } from '../constants/setup.ts'

export type CardId = `card-${number}`

export interface CardField {
  value: string
  subtype: string
}

export interface GameCard {
  id: CardId
  title: CardField
  character: CardField
  everything: CardField
  keyword: string
}

export const CARD_DRAFT_PHASES = {
  handoff: 'handoff',
  selectingMain: 'selecting-main',
  selectingLightning: 'selecting-lightning',
  ready: 'ready',
  complete: 'complete',
} as const

export type CardDraftPhase = (typeof CARD_DRAFT_PHASES)[keyof typeof CARD_DRAFT_PHASES]

export interface PlayerCardDraft {
  playerId: string
  dealCardIds: CardId[]
  selectedMainCardIds: CardId[]
  lightningCardId: CardId | null
}

export interface CardDraftSession {
  setupKey: string
  mainDeckCardCount: MainDeckCardCount
  playerDrafts: PlayerCardDraft[]
  currentPlayerIndex: number
  phase: CardDraftPhase
}

export type CardDraftCreationRejectReason =
  | 'invalid-players'
  | 'invalid-main-count'
  | 'invalid-catalog'
  | 'insufficient-cards'
  | 'invalid-setup-key'

export type CardDraftTransitionRejectReason =
  | 'invalid-phase'
  | 'missing-current-player'
  | 'unknown-card'
  | 'main-quota-reached'
  | 'main-quota-incomplete'
  | 'main-selection-already-confirmed'
  | 'lightning-must-be-distinct'
  | 'lightning-required'

export type CardDraftCreationResult =
  | { kind: 'created'; session: CardDraftSession }
  | { kind: 'rejected'; reason: CardDraftCreationRejectReason }

export type CardDraftTransitionResult =
  | { kind: 'success'; session: CardDraftSession }
  | { kind: 'rejected'; reason: CardDraftTransitionRejectReason }

export type CardDraftStartRejectReason =
  | CardDraftCreationRejectReason
  | 'invalid-owner'
  | 'invalid-roster'
  | 'invalid-team-assignment'

export type CardDraftStartResult =
  | { kind: 'started'; session: CardDraftSession }
  | { kind: 'existing'; session: CardDraftSession }
  | { kind: 'rejected'; reason: CardDraftStartRejectReason }
