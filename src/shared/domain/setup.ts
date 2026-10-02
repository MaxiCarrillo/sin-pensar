import { MIN_PLAYERS, MIN_PLAYERS_PER_TEAM } from '@/shared/constants/setup'
import type {
  Player,
  TeamAssignment,
  TeamCount,
  TeamId,
  TeamMembership,
} from '@/shared/types/setup'

export function normalizePlayerName(name: string) {
  return name.trim().toLocaleLowerCase('es')
}

export function isRosterValid(players: Player[]) {
  if (players.length < MIN_PLAYERS) return false

  const normalizedNames = players.map((player) => normalizePlayerName(player.name))
  const playerIds = players.map((player) => player.id)
  return (
    normalizedNames.every(Boolean) &&
    new Set(normalizedNames).size === normalizedNames.length &&
    playerIds.every(Boolean) &&
    new Set(playerIds).size === playerIds.length
  )
}

export function deriveValidTeamCounts(playerCount: number): TeamCount[] {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS) return []
  return Array.from(
    { length: Math.floor(playerCount / MIN_PLAYERS_PER_TEAM) - 1 },
    (_, index) => index + 2,
  )
}

export function isValidTeamCount(playerCount: number, value: unknown): value is TeamCount {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    deriveValidTeamCounts(playerCount).includes(value)
  )
}

export function normalizeTeamCount(playerCount: number, teamCount: TeamCount): TeamCount {
  const validCounts = deriveValidTeamCounts(playerCount)
  if (validCounts.includes(teamCount)) return teamCount
  return validCounts[0] ?? teamCount
}

export function deriveBalancedTeamSizes(
  playerCount: number,
  teamCount: TeamCount,
): number[] {
  if (!isValidTeamCount(playerCount, teamCount)) return []
  const minimumSize = Math.floor(playerCount / teamCount)
  const largerTeamCount = playerCount % teamCount
  return Array.from(
    { length: teamCount },
    (_, index) => minimumSize + (index < largerTeamCount ? 1 : 0),
  )
}

export function buildTeamIds(teamCount: TeamCount): TeamId[] {
  if (!Number.isInteger(teamCount) || teamCount < 1) return []
  return Array.from(
    { length: teamCount },
    (_, index): TeamId => `team-${index + 1}`,
  )
}

export function isTeamIdForCount(value: unknown, teamCount: TeamCount): value is TeamId {
  return typeof value === 'string' && buildTeamIds(teamCount).some((teamId) => teamId === value)
}

export interface TeamPreview {
  id: TeamId
  name: string
  players: Player[]
}

export type TeamAssignmentResult =
  | { kind: 'success'; assignment: TeamAssignment }
  | { kind: 'invalid'; reason: TeamAssignmentInvalidReason }

export type TeamAssignmentValidation =
  | { kind: 'valid' }
  | { kind: 'invalid'; reason: TeamAssignmentInvalidReason }

export type TeamAssignmentInvalidReason =
  | 'invalid-roster'
  | 'invalid-team-count'
  | 'invalid-team-set'
  | 'unassigned-player'
  | 'unknown-player'
  | 'duplicate-player'
  | 'insufficient-team-size'
  | 'unbalanced'

export type TeamAssignmentDraft = Readonly<Record<string, TeamId | undefined>>
export type RandomSource = () => number

const RANDOM_DRAW_ATTEMPTS = 4

function createEmptyMemberships(teamCount: TeamCount): TeamMembership[] {
  return buildTeamIds(teamCount).map((teamId) => ({ teamId, playerIds: [] }))
}

function getAssignmentSignature(assignment: TeamAssignment) {
  return assignment.teams
    .map((team) => `${team.teamId}:${[...team.playerIds].sort().join(',')}`)
    .join('|')
}

function distributePlayerIds(playerIds: string[], teamCount: TeamCount): TeamAssignment {
  const teams = createEmptyMemberships(teamCount)
  const sizes = deriveBalancedTeamSizes(playerIds.length, teamCount)
  let playerIndex = 0

  teams.forEach((team, teamIndex) => {
    team.playerIds.push(...playerIds.slice(playerIndex, playerIndex + sizes[teamIndex]))
    playerIndex += sizes[teamIndex]
  })
  return { teams }
}

function shufflePlayerIds(playerIds: string[], random: RandomSource) {
  const shuffled = [...playerIds]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = random()
    const unit = Number.isFinite(randomValue)
      ? Math.min(Math.max(randomValue, 0), 0.9999999999999999)
      : 0
    const swapIndex = Math.floor(unit * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

export function validateTeamAssignmentDraft(
  players: Player[],
  teamCount: TeamCount,
  draft: TeamAssignmentDraft,
): TeamAssignmentValidation {
  if (!isRosterValid(players)) return { kind: 'invalid', reason: 'invalid-roster' }
  if (!isValidTeamCount(players.length, teamCount)) {
    return { kind: 'invalid', reason: 'invalid-team-count' }
  }

  const rosterIds = new Set(players.map((player) => player.id))
  if (Object.keys(draft).some((playerId) => !rosterIds.has(playerId))) {
    return { kind: 'invalid', reason: 'unknown-player' }
  }
  for (const player of players) {
    const teamId = draft[player.id]
    if (!teamId) return { kind: 'invalid', reason: 'unassigned-player' }
    if (!isTeamIdForCount(teamId, teamCount)) {
      return { kind: 'invalid', reason: 'invalid-team-set' }
    }
  }

  const teamSizes = buildTeamIds(teamCount).map(
    (teamId) => players.filter((player) => draft[player.id] === teamId).length,
  )
  if (teamSizes.some((size) => size < MIN_PLAYERS_PER_TEAM)) {
    return { kind: 'invalid', reason: 'insufficient-team-size' }
  }
  if (Math.max(...teamSizes) - Math.min(...teamSizes) > 1) {
    return { kind: 'invalid', reason: 'unbalanced' }
  }
  return { kind: 'valid' }
}

export function validateTeamAssignment(
  players: Player[],
  teamCount: TeamCount,
  assignment: TeamAssignment,
): TeamAssignmentValidation {
  if (!isRosterValid(players)) return { kind: 'invalid', reason: 'invalid-roster' }
  if (!isValidTeamCount(players.length, teamCount)) {
    return { kind: 'invalid', reason: 'invalid-team-count' }
  }

  const expectedTeamIds = buildTeamIds(teamCount)
  const receivedTeamIds = assignment.teams.map((team) => team.teamId)
  if (
    receivedTeamIds.length !== expectedTeamIds.length ||
    new Set(receivedTeamIds).size !== receivedTeamIds.length ||
    expectedTeamIds.some((teamId) => !receivedTeamIds.includes(teamId))
  ) {
    return { kind: 'invalid', reason: 'invalid-team-set' }
  }

  const rosterIds = players.map((player) => player.id)
  const rosterIdSet = new Set(rosterIds)
  const assignedIds = assignment.teams.flatMap((team) => team.playerIds)
  if (assignedIds.some((playerId) => !rosterIdSet.has(playerId))) {
    return { kind: 'invalid', reason: 'unknown-player' }
  }
  if (new Set(assignedIds).size !== assignedIds.length) {
    return { kind: 'invalid', reason: 'duplicate-player' }
  }
  if (
    assignedIds.length !== rosterIds.length ||
    rosterIds.some((playerId) => !assignedIds.includes(playerId))
  ) {
    return { kind: 'invalid', reason: 'unassigned-player' }
  }

  const teamSizes = assignment.teams.map((team) => team.playerIds.length)
  if (teamSizes.some((size) => size < MIN_PLAYERS_PER_TEAM)) {
    return { kind: 'invalid', reason: 'insufficient-team-size' }
  }
  if (Math.max(...teamSizes) - Math.min(...teamSizes) > 1) {
    return { kind: 'invalid', reason: 'unbalanced' }
  }
  return { kind: 'valid' }
}

export function createBalancedTeamAssignment(
  players: Player[],
  teamCount: TeamCount,
): TeamAssignmentResult {
  if (!isRosterValid(players)) return { kind: 'invalid', reason: 'invalid-roster' }
  if (!isValidTeamCount(players.length, teamCount)) {
    return { kind: 'invalid', reason: 'invalid-team-count' }
  }
  return {
    kind: 'success',
    assignment: distributePlayerIds(
      players.map((player) => player.id),
      teamCount,
    ),
  }
}

export function createTeamAssignmentFromDraft(
  players: Player[],
  teamCount: TeamCount,
  draft: TeamAssignmentDraft,
): TeamAssignmentResult {
  const validation = validateTeamAssignmentDraft(players, teamCount, draft)
  if (validation.kind === 'invalid') return validation

  const teams = createEmptyMemberships(teamCount)
  const membershipById = new Map(teams.map((team) => [team.teamId, team]))
  for (const player of players) {
    const teamId = draft[player.id]
    const membership = teamId ? membershipById.get(teamId) : undefined
    if (!membership) return { kind: 'invalid', reason: 'invalid-team-set' }
    membership.playerIds.push(player.id)
  }
  return { kind: 'success', assignment: { teams } }
}

export function createRandomTeamAssignment(
  players: Player[],
  teamCount: TeamCount,
  random: RandomSource,
  previousAssignment?: TeamAssignment,
): TeamAssignmentResult {
  if (!isRosterValid(players)) return { kind: 'invalid', reason: 'invalid-roster' }
  if (!isValidTeamCount(players.length, teamCount)) {
    return { kind: 'invalid', reason: 'invalid-team-count' }
  }

  const previousSignature =
    previousAssignment && validateTeamAssignment(players, teamCount, previousAssignment).kind === 'valid'
      ? getAssignmentSignature(previousAssignment)
      : undefined
  const playerIds = players.map((player) => player.id)

  for (let attempt = 0; attempt < RANDOM_DRAW_ATTEMPTS; attempt += 1) {
    const shuffledIds = shufflePlayerIds(playerIds, random)
    const assignment = distributePlayerIds(shuffledIds, teamCount)
    if (getAssignmentSignature(assignment) !== previousSignature) {
      return { kind: 'success', assignment }
    }
  }

  const rotatedIds = [...playerIds.slice(1), playerIds[0]]
  return { kind: 'success', assignment: distributePlayerIds(rotatedIds, teamCount) }
}

export function resolveTeamAssignment(
  players: Player[],
  teamCount: TeamCount,
  assignment: TeamAssignment,
): { kind: 'success'; teams: TeamPreview[] } | { kind: 'invalid'; reason: TeamAssignmentInvalidReason } {
  const validation = validateTeamAssignment(players, teamCount, assignment)
  if (validation.kind === 'invalid') return validation

  const playersById = new Map(players.map((player) => [player.id, player]))
  const teams: TeamPreview[] = []
  for (const [index, membership] of assignment.teams.entries()) {
    const teamPlayers: Player[] = []
    for (const playerId of membership.playerIds) {
      const player = playersById.get(playerId)
      if (!player) return { kind: 'invalid', reason: 'unknown-player' }
      teamPlayers.push(player)
    }
    teams.push({ id: membership.teamId, name: `Equipo ${index + 1}`, players: teamPlayers })
  }
  return { kind: 'success', teams }
}
