import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  MinusCircleOutlined,
  PlusOutlined,
  QuestionOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Button, Divider, Input, Radio, Tooltip, type InputRef } from 'antd'
import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'

import { AppDrawer } from '@/modules/common'
import {
  isMainDeckCardCount,
  isTurnDuration,
  MAIN_DECK_CARD_OPTIONS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TURN_DURATION_OPTIONS,
} from '@/shared/constants/setup'
import {
  deriveBalancedTeamSizes,
  deriveValidTeamCounts,
  isRosterValid,
  isValidTeamCount,
  normalizePlayerName,
} from '@/shared/domain/setup'
import { useSetupStore } from '@/shared/store/setup.store'
import type { Player, TeamCount } from '@/shared/types/setup'

import styles from './players.module.css'

const EMPTY_NAME_MESSAGE = 'El nombre no puede estar vacío'

interface SettingsOptionCardProps {
  disabled?: boolean
  selected: boolean
  supportingText?: string
  value: number
  valueText: string
}

function SettingsOptionCard({
  disabled,
  selected,
  supportingText,
  value,
  valueText,
}: SettingsOptionCardProps) {
  return (
    <Radio
      className={styles.optionCard}
      classNames={{
        icon: styles.optionCardRadio,
        label: styles.optionCardLabel,
      }}
      disabled={disabled}
      value={value}
    >
      <span className={styles.optionCardContent}>
        {selected ? (
          <span className={styles.optionCardSelectedIndicator}>
            <CheckCircleFilled aria-hidden="true" />
            <span className="visually-hidden">Seleccionado</span>
          </span>
        ) : null}
        <span className={styles.optionCardValue}>{valueText}</span>
        {supportingText ? (
          <span className={styles.optionCardSupportingText}>{supportingText}</span>
        ) : null}
      </span>
    </Radio>
  )
}

function getDuplicateName(players: Player[], playerId: string | null, name: string) {
  const trimmedName = name.trim()
  if (!trimmedName) return undefined

  const normalizedName = normalizePlayerName(trimmedName)
  return players.some(
    (player) => player.id !== playerId && normalizePlayerName(player.name) === normalizedName,
  )
    ? `${trimmedName} ya está en la lista.`
    : undefined
}

function getNameError(players: Player[], playerId: string | null, name: string) {
  if (!name.trim()) return EMPTY_NAME_MESSAGE
  return getDuplicateName(players, playerId, name)
}

function getMissingPlayersMessage(missingPlayers: number) {
  return missingPlayers === 1
    ? 'Se necesita al menos 1 jugador más.'
    : `Se necesitan al menos ${missingPlayers} jugadores más.`
}

function getTeamSizeSummary(playerCount: number, teamCount: TeamCount) {
  const sizes = deriveBalancedTeamSizes(playerCount, teamCount)
  const smallestTeamSize = Math.min(...sizes)
  const largestTeamSize = Math.max(...sizes)

  return smallestTeamSize === largestTeamSize
    ? `${smallestTeamSize} jugadores por equipo`
    : `${smallestTeamSize}–${largestTeamSize} jugadores por equipo`
}

function PlayersPage() {
  const navigate = useNavigate()
  const {
    nickname,
    players,
    turnDuration,
    mainDeckCardCount,
    teamCount,
    addPlayer,
    removePlayer,
    renamePlayer,
    setTurnDuration,
    setMainDeckCardCount,
    setTeamCount,
  } = useSetupStore(
    useShallow((state) => ({
      nickname: state.nickname,
      players: state.players,
      turnDuration: state.turnDuration,
      mainDeckCardCount: state.mainDeckCardCount,
      teamCount: state.teamCount,
      addPlayer: state.addPlayer,
      removePlayer: state.removePlayer,
      renamePlayer: state.renamePlayer,
      setTurnDuration: state.setTurnDuration,
      setMainDeckCardCount: state.setMainDeckCardCount,
      setTeamCount: state.setTeamCount,
    })),
  )
  const [playerDrafts, setPlayerDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(players.map((player) => [player.id, player.name])),
  )
  const [helpOpen, setHelpOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [durationDraft, setDurationDraft] = useState(turnDuration)
  const [cardCountDraft, setCardCountDraft] = useState(mainDeckCardCount)
  const [teamCountDraft, setTeamCountDraft] = useState<TeamCount>(teamCount)
  const inputRefs = useRef<Record<string, InputRef | null>>({})
  const missingPlayers = Math.max(MIN_PLAYERS - players.length, 0)
  const hasReachedPlayerLimit = players.length >= MAX_PLAYERS
  const isRosterWithinCapacity = players.length <= MAX_PLAYERS
  const draftPlayers = players.map((player) => ({
    ...player,
    name: playerDrafts[player.id] ?? player.name,
  }))
  const playerErrors = Object.fromEntries(
    draftPlayers.map((player) => {
      const draft = playerDrafts[player.id] ?? player.name
      return [player.id, getNameError(draftPlayers, player.id, draft)]
    }),
  )
  const hasInvalidDraft = Object.values(playerErrors).some(Boolean)
  const hasUncommittedDraft = players.some(
    (player) => (playerDrafts[player.id] ?? player.name) !== player.name,
  )
  const canBuildTeams =
    missingPlayers === 0 &&
    isRosterWithinCapacity &&
    !hasInvalidDraft &&
    !hasUncommittedDraft
  const hasFinalizedRoster = canBuildTeams && isRosterValid(players)
  const validTeamCounts = hasFinalizedRoster ? deriveValidTeamCounts(players.length) : []
  const teamValidationMessage = missingPlayers
    ? getMissingPlayersMessage(missingPlayers)
    : !isRosterWithinCapacity
      ? `La lista admite hasta ${MAX_PLAYERS} jugadores.`
      : hasInvalidDraft
        ? 'Corregí los nombres de los jugadores antes de armar equipos.'
        : hasUncommittedDraft
          ? 'Confirmá los nombres editados con Enter o al salir del campo.'
          : undefined

  if (!nickname.trim() || players.length === 0) {
    return <Navigate to="/" replace />
  }

  const handleAdd = () => {
    const result = addPlayer()
    if (result.kind === 'limit-reached') return
    const { player } = result
    setPlayerDrafts((drafts) => ({ ...drafts, [player.id]: player.name }))
    requestAnimationFrame(() => inputRefs.current[player.id]?.focus())
  }

  const handleRemove = (player: Player) => {
    removePlayer(player.id)
    setPlayerDrafts((drafts) => {
      const nextDrafts = { ...drafts }
      delete nextDrafts[player.id]
      return nextDrafts
    })
  }

  const handleDraftChange = (playerId: string, value: string) => {
    setPlayerDrafts((drafts) => ({ ...drafts, [playerId]: value }))
  }

  const handleRename = (player: Player) => {
    const draft = playerDrafts[player.id] ?? player.name
    const result = renamePlayer(player.id, draft)
    if (result.kind !== 'updated') return

    setPlayerDrafts((drafts) => ({
      ...drafts,
      [player.id]: result.player.name,
    }))
  }

  const handleOpenSettings = () => {
    setDurationDraft(turnDuration)
    setCardCountDraft(mainDeckCardCount)
    setTeamCountDraft(teamCount)
    setSettingsOpen(true)
  }

  const handleSaveSettings = () => {
    setTurnDuration(durationDraft)
    setMainDeckCardCount(cardCountDraft)
    if (isValidTeamCount(players.length, teamCountDraft)) setTeamCount(teamCountDraft)
    setSettingsOpen(false)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Tooltip title="Volver al inicio">
          <Button
            className={styles.backButton}
            type="primary"
            shape="circle"
            icon={<ArrowLeftOutlined />}
            aria-label="Volver al inicio"
            onClick={() => navigate('/')}
          />
        </Tooltip>
        <h1>JUGADORES</h1>
        <Tooltip title="Ayuda">
          <Button
            className={styles.helpButton}
            type="primary"
            shape="circle"
            icon={<QuestionOutlined />}
            aria-label="Abrir ayuda"
            aria-haspopup="dialog"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen(true)}
          />
        </Tooltip>
      </header>

      <AppDrawer
        open={helpOpen}
        title="Cómo jugar"
        description="Conocé los pasos para preparar la partida."
        onClose={() => setHelpOpen(false)}
      >
        <p className={styles.helpContent}>Las instrucciones detalladas se agregarán próximamente.</p>
      </AppDrawer>

      <AppDrawer
        open={settingsOpen}
        title="Configuración"
        description="Elegí cómo se preparará la partida."
        onClose={() => setSettingsOpen(false)}
      >
        <div className={styles.settingsContent}>
          <fieldset className={styles.settingsGroup}>
            <legend>Tiempo por turno</legend>
            <Radio.Group
              block
              aria-label="Tiempo por turno"
              className={`${styles.optionCardGrid} ${styles.threeColumnOptionGrid}`}
              name="turn-duration"
              value={durationDraft}
              onChange={(event) => {
                if (isTurnDuration(event.target.value)) setDurationDraft(event.target.value)
              }}
            >
              {TURN_DURATION_OPTIONS.map((option) => (
                <SettingsOptionCard
                  key={option.value}
                  selected={durationDraft === option.value}
                  value={option.value}
                  valueText={`${option.value}s`}
                />
              ))}
            </Radio.Group>
          </fieldset>
          <fieldset className={styles.settingsGroup}>
            <legend>Cartas para el mazo principal</legend>
            <Radio.Group
              block
              aria-label="Cartas para el mazo principal"
              className={`${styles.optionCardGrid} ${styles.threeColumnOptionGrid}`}
              name="main-deck-card-count"
              value={cardCountDraft}
              onChange={(event) => {
                if (isMainDeckCardCount(event.target.value)) {
                  setCardCountDraft(event.target.value)
                }
              }}
            >
              {MAIN_DECK_CARD_OPTIONS.map((option) => (
                <SettingsOptionCard
                  key={option.value}
                  selected={cardCountDraft === option.value}
                  supportingText="cartas de 10"
                  value={option.value}
                  valueText={String(option.value)}
                />
              ))}
            </Radio.Group>
          </fieldset>
          <fieldset className={styles.settingsGroup}>
            <legend>Cantidad de equipos</legend>
            {validTeamCounts.length > 0 ? (
              <Radio.Group
                block
                aria-label="Cantidad de equipos"
                className={`${styles.optionCardGrid} ${styles.teamOptionGrid}`}
                name="team-count"
                value={teamCountDraft}
                onChange={(event) => {
                  if (isValidTeamCount(players.length, event.target.value)) {
                    setTeamCountDraft(event.target.value)
                  }
                }}
              >
                {validTeamCounts.map((count) => (
                  <SettingsOptionCard
                    key={count}
                    selected={teamCountDraft === count}
                    supportingText={getTeamSizeSummary(players.length, count)}
                    value={count}
                    valueText={String(count)}
                  />
                ))}
              </Radio.Group>
            ) : (
              <p className={styles.settingsRequirement} role="status">
                Las opciones de equipos estarán disponibles cuando completes una lista válida de
                al menos 4 jugadores, sin nombres vacíos ni repetidos.
              </p>
            )}
          </fieldset>
          <Button type="primary" size="large" block onClick={handleSaveSettings}>
            Guardar configuración
          </Button>
        </div>
      </AppDrawer>

      <main className={styles.main}>
        <div className={styles.form}>
          <div className={styles.entryArea}>
            <ul className={styles.playerList} aria-label="Jugadores">
              {players.map((player) => (
                <li key={player.id} className={styles.playerRow}>
                  <div className={styles.playerField}>
                    <label className="visually-hidden" htmlFor={`player-${player.id}`}>
                      {player.name ? `Nombre de ${player.name}` : 'Nombre del nuevo jugador'}
                    </label>
                    <Input
                      allowClear
                      ref={(input) => {
                        inputRefs.current[player.id] = input
                      }}
                      className={styles.playerInput}
                      id={`player-${player.id}`}
                      name={`player-${player.id}`}
                      size="large"
                      value={playerDrafts[player.id] ?? player.name}
                      maxLength={MAX_NAME_LENGTH}
                      autoComplete="off"
                      prefix={<UserOutlined />}
                      showCount
                      status={playerErrors[player.id] ? 'error' : undefined}
                      required
                      aria-describedby={playerErrors[player.id] ? `player-${player.id}-error` : undefined}
                      aria-invalid={playerErrors[player.id] ? true : undefined}
                      onBlur={() => handleRename(player)}
                      onChange={(event) => handleDraftChange(player.id, event.target.value)}
                      onPressEnter={(event) => {
                        event.preventDefault()
                        handleRename(player)
                      }}
                    />
                    {playerErrors[player.id] ? (
                      <span
                        id={`player-${player.id}-error`}
                        className={styles.validationMessage}
                        role="alert"
                      >
                        {playerErrors[player.id]}
                      </span>
                    ) : null}
                  </div>
                  <Tooltip title={player.name ? `Eliminar a ${player.name}` : 'Eliminar jugador vacío'}>
                    <Button
                      className={styles.removeButton}
                      size="large"
                      shape="circle"
                      icon={<MinusCircleOutlined />}
                      aria-label={player.name ? `Eliminar a ${player.name}` : 'Eliminar jugador vacío'}
                      htmlType="button"
                      onClick={() => handleRemove(player)}
                    />
                  </Tooltip>
                </li>
              ))}
            </ul>

            <Button
              className={styles.addButton}
              htmlType="button"
              type="dashed"
              size="large"
              icon={<PlusOutlined />}
              block
              disabled={hasReachedPlayerLimit}
              aria-describedby={hasReachedPlayerLimit ? 'player-limit' : undefined}
              onClick={handleAdd}
            >
              Agregar jugador
            </Button>
            {hasReachedPlayerLimit ? (
              <p id="player-limit" className={styles.playerLimit} role="status">
                Alcanzaste el máximo de {MAX_PLAYERS} jugadores para repartir 10 cartas por persona.
              </p>
            ) : null}
            {teamValidationMessage ? (
              <p id="team-requirement" className={styles.teamValidation} role="status">
                {teamValidationMessage}
              </p>
            ) : null}
          </div>

          <footer className={styles.actions} aria-label="Acciones de preparación">
            <Divider className={styles.actionsDivider} />
            <Button
              className={styles.settingsButton}
              size="large"
              htmlType="button"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
              onClick={handleOpenSettings}
            >
              Configuración
            </Button>
            <Tooltip title={canBuildTeams ? undefined : teamValidationMessage}>
              <span className={styles.buttonWrapper}>
                <Button
                  className={styles.teamsButton}
                  type="primary"
                  size="large"
                  htmlType="button"
                  disabled={!canBuildTeams}
                  aria-describedby={teamValidationMessage ? 'team-requirement' : undefined}
                  onClick={() => navigate('/teams')}
                >
                  Armar equipos
                </Button>
              </span>
            </Tooltip>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default PlayersPage
