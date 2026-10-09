import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CloseOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'

import { AppDrawer } from '@/modules/common'
import { CARD_IDS } from '@/shared/catalog/card-catalog'
import {
  buildTeamIds,
  createBalancedTeamAssignment,
  createRandomTeamAssignment,
  createTeamAssignmentFromDraft,
  deriveBalancedTeamSizes,
  isRosterValid,
  validateTeamAssignment,
  type TeamAssignmentDraft,
  type TeamAssignmentInvalidReason,
} from '@/shared/domain/setup'
import { useSetupStore } from '@/shared/store/setup.store'
import type { Player, TeamAssignment, TeamId } from '@/shared/types/setup'

import styles from './teams.module.css'

const TEAM_HEADER_CLASSES = [styles.teamPrimary, styles.teamTertiary, styles.teamSecondary]

function createAssignmentDraft(assignment: TeamAssignment): TeamAssignmentDraft {
  return Object.fromEntries(
    assignment.teams.flatMap((team) =>
      team.playerIds.map((playerId) => [playerId, team.teamId]),
    ),
  )
}

function createInitialDraft(
  players: Player[],
  teamCount: number,
  assignment: TeamAssignment,
): TeamAssignmentDraft {
  if (validateTeamAssignment(players, teamCount, assignment).kind === 'valid') {
    return createAssignmentDraft(assignment)
  }
  const balanced = createBalancedTeamAssignment(players, teamCount)
  return balanced.kind === 'success' ? createAssignmentDraft(balanced.assignment) : {}
}

function getValidationMessage(reason: TeamAssignmentInvalidReason) {
  switch (reason) {
    case 'unassigned-player':
      return 'Todavía hay jugadores sin equipo.'
    case 'insufficient-team-size':
      return 'Cada equipo debe tener al menos 2 jugadores.'
    case 'unbalanced':
      return 'La diferencia entre el equipo más grande y el más pequeño no puede superar 1 jugador.'
    case 'duplicate-player':
      return 'Un jugador no puede aparecer en más de un equipo.'
    default:
      return 'La distribución no coincide con los jugadores y equipos actuales.'
  }
}

function getPlayerTeamLabel(teamId: TeamId | undefined, teamIds: TeamId[]) {
  if (!teamId) return 'Sin equipo'
  const index = teamIds.indexOf(teamId)
  return index >= 0 ? `Equipo ${index + 1}` : 'Sin equipo'
}

function TeamsPage() {
  const navigate = useNavigate()
  const {
    nickname,
    ownerPlayerId,
    players,
    teamCount,
    teamAssignment,
    commitTeamAssignment,
    startCardDraft,
  } = useSetupStore(
    useShallow((state) => ({
      nickname: state.nickname,
      ownerPlayerId: state.ownerPlayerId,
      players: state.players,
      teamCount: state.teamCount,
      teamAssignment: state.teamAssignment,
      commitTeamAssignment: state.commitTeamAssignment,
      startCardDraft: state.startCardDraft,
    })),
  )
  const teamIds = buildTeamIds(teamCount)
  const targetSizes = deriveBalancedTeamSizes(players.length, teamCount)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [assignmentDraft, setAssignmentDraft] = useState<TeamAssignmentDraft>(() =>
    createInitialDraft(players, teamCount, teamAssignment),
  )
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [hasRandomized, setHasRandomized] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const hasOwner =
    Boolean(nickname.trim()) &&
    ownerPlayerId !== null &&
    players.some((player) => player.id === ownerPlayerId)
  const draftResult = createTeamAssignmentFromDraft(players, teamCount, assignmentDraft)
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId)

  if (!hasOwner) return <Navigate to="/" replace />
  if (!isRosterValid(players)) return <Navigate to="/players" replace />

  const selectPlayer = (player: Player) => {
    setSelectedPlayerId(player.id)
    setDrawerOpen(false)
    setStatusMessage(`${player.name} está seleccionado.`)
  }

  const moveSelectedPlayer = (teamId: TeamId) => {
    if (!selectedPlayer) return
    const previousTeamId = assignmentDraft[selectedPlayer.id]
    const nextDraft = { ...assignmentDraft, [selectedPlayer.id]: teamId }
    const nextAssignment = createTeamAssignmentFromDraft(players, teamCount, nextDraft)
    setAssignmentDraft(nextDraft)
    setSelectedPlayerId(null)

    if (nextAssignment.kind === 'invalid') {
      setStatusMessage(
        `${selectedPlayer.name} ${previousTeamId ? 'se movió' : 'se asignó'} en el borrador.`,
      )
      return
    }
    if (commitTeamAssignment(nextAssignment.assignment).kind === 'invalid') {
      setStatusMessage('No se pudo aplicar la distribución completa.')
      return
    }
    setStatusMessage('La distribución completa y equilibrada se aplicó automáticamente.')
  }

  const removeFromTeam = (player: Player) => {
    const nextDraft = { ...assignmentDraft, [player.id]: undefined }
    setAssignmentDraft(nextDraft)
    setSelectedPlayerId(player.id)
    setStatusMessage(`${player.name} quedó sin equipo. Elegí un equipo de destino.`)
  }

  const handleRandomAssignment = () => {
    const result = createRandomTeamAssignment(players, teamCount, Math.random, teamAssignment)
    if (
      result.kind === 'invalid' ||
      commitTeamAssignment(result.assignment).kind === 'invalid'
    ) {
      setStatusMessage('No se pudo crear una distribución válida.')
      return
    }
    setAssignmentDraft(createAssignmentDraft(result.assignment))
    setSelectedPlayerId(null)
    setHasRandomized(true)
    setDrawerOpen(false)
    setStatusMessage('Se creó y aplicó una nueva distribución equilibrada al azar.')
  }

  const handleStartCardDraft = () => {
    if (draftResult.kind === 'invalid') {
      setStatusMessage(getValidationMessage(draftResult.reason))
      return
    }
    if (commitTeamAssignment(draftResult.assignment).kind === 'invalid') {
      setStatusMessage('No se pudo confirmar la distribución antes de elegir cartas.')
      return
    }
    const startResult = startCardDraft(CARD_IDS, Math.random)
    if (startResult.kind === 'rejected') {
      setStatusMessage('No se pudo preparar un reparto privado con la configuración actual.')
      return
    }
    navigate('/cards')
  }

  const validationMessage =
    draftResult.kind === 'invalid'
      ? getValidationMessage(draftResult.reason)
      : 'La distribución está completa y equilibrada.'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Tooltip title="Volver a jugadores">
          <Button
            className={styles.backButton}
            type="primary"
            shape="circle"
            icon={<ArrowLeftOutlined />}
            aria-label="Volver a jugadores"
            onClick={() => navigate('/players')}
          />
        </Tooltip>
        <h1>ARMAR EQUIPOS</h1>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>

      <AppDrawer
        open={drawerOpen}
        title="Elegir jugador"
        description="Sorteá los equipos o seleccioná a quién querés asignar o mover."
        onClose={() => setDrawerOpen(false)}
      >
        <div className={styles.drawerContent}>
          <Button size="large" block onClick={handleRandomAssignment}>
            {hasRandomized ? 'Volver a sortear' : 'Sortear al azar'}
          </Button>
          <ul className={styles.playerPicker} aria-label="Jugadores disponibles">
            {players.map((player) => {
              const isSelected = player.id === selectedPlayerId
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    className={styles.playerOption}
                    aria-pressed={isSelected}
                    onClick={() => selectPlayer(player)}
                  >
                    <span className={styles.playerOptionText}>
                      <strong>{player.name}</strong>
                      <span>{getPlayerTeamLabel(assignmentDraft[player.id], teamIds)}</span>
                    </span>
                    <span className={styles.selectionState}>
                      {isSelected ? (
                        <>
                          <CheckCircleFilled aria-hidden="true" /> Seleccionado
                        </>
                      ) : (
                        'Seleccionar'
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <Button size="large" block onClick={() => navigate('/players')}>
            Corregir jugadores
          </Button>
        </div>
      </AppDrawer>

      <main className={styles.main}>
        <div className={styles.assignmentStatus} role="status" aria-live="polite">
          <p>
            {selectedPlayer
              ? `${selectedPlayer.name}: elegí un equipo de destino.`
              : statusMessage || 'Elegí un jugador desde la lista para asignarlo o moverlo.'}
          </p>
          <p
            id="assignment-validation"
            className={draftResult.kind === 'invalid' ? styles.requirement : styles.validStatus}
          >
            {validationMessage}
          </p>
        </div>

        <section
          className={styles.teamsSection}
          aria-label="Distribución por equipos editable"
        >
          {teamIds.map((teamId, index) => {
            const teamPlayers = players.filter((player) => assignmentDraft[player.id] === teamId)
            const selectedTeamId = selectedPlayer ? assignmentDraft[selectedPlayer.id] : undefined
            const isSelectedDestination = selectedTeamId === teamId
            return (
              <article key={teamId} className={styles.teamCard}>
                <header className={`${styles.teamHeader} ${TEAM_HEADER_CLASSES[index % 3]}`}>
                  <h2>Equipo {index + 1}</h2>
                  <span>
                    {teamPlayers.length} / {targetSizes[index]} jugadores
                  </span>
                </header>
                {teamPlayers.length > 0 ? (
                  <ul className={styles.teamPlayers}>
                    {teamPlayers.map((player) => (
                      <li key={player.id}>
                        <span>{player.name}</span>
                        <Tooltip title={`Quitar a ${player.name} del Equipo ${index + 1}`}>
                          <Button
                            className={styles.removePlayerButton}
                            type="text"
                            shape="circle"
                            icon={<CloseOutlined />}
                            aria-label={`Quitar a ${player.name} del Equipo ${index + 1}`}
                            onClick={() => removeFromTeam(player)}
                          />
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.emptyTeam}>Este equipo todavía no tiene jugadores.</p>
                )}
                {selectedPlayer ? (
                  <Button
                    className={styles.assignButton}
                    size="large"
                    disabled={isSelectedDestination}
                    onClick={() => moveSelectedPlayer(teamId)}
                  >
                    {isSelectedDestination
                      ? `${selectedPlayer.name} ya está aquí`
                      : selectedTeamId
                        ? 'Mover aquí'
                        : 'Asignar aquí'}
                  </Button>
                ) : null}
              </article>
            )
          })}
        </section>

        <section className={styles.actions} aria-label="Acciones de equipos">
          <Button
            size="large"
            icon={<TeamOutlined />}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            Lista de jugadores
          </Button>
          <Button
            type="primary"
            size="large"
            disabled={draftResult.kind === 'invalid'}
            aria-describedby="card-selection-help"
            onClick={handleStartCardDraft}
          >
            Elegir cartas
          </Button>
          <p id="card-selection-help" className={styles.actionHelp}>
            {draftResult.kind === 'invalid'
              ? validationMessage
              : 'Cada jugador recibirá 10 cartas y las elegirá en privado.'}
          </p>
        </section>
      </main>
    </div>
  )
}

export default TeamsPage
