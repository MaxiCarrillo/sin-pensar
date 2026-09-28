import {
  ArrowLeftOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  QuestionOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Button, Divider, Input, Tooltip, type InputRef } from 'antd'
import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'

import { AppDrawer } from '@/modules/common'
import { MAX_NAME_LENGTH, MIN_PLAYERS } from '@/shared/constants/setup'
import { useSetupStore } from '@/shared/store/setup.store'
import type { Player } from '@/shared/types/setup'

import styles from './players.module.css'

const EMPTY_NAME_MESSAGE = 'El nombre no puede estar vacío'

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase('es')
}

function getDuplicateName(players: Player[], playerId: string | null, name: string) {
  const trimmedName = name.trim()
  if (!trimmedName) return undefined

  const normalizedName = normalizeName(trimmedName)
  return players.some(
    (player) => player.id !== playerId && normalizeName(player.name) === normalizedName,
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

function PlayersPage() {
  const navigate = useNavigate()
  const { nickname, players, addPlayer, removePlayer, renamePlayer } = useSetupStore(
    useShallow((state) => ({
      nickname: state.nickname,
      players: state.players,
      addPlayer: state.addPlayer,
      removePlayer: state.removePlayer,
      renamePlayer: state.renamePlayer,
    })),
  )
  const [name, setName] = useState('')
  const [newNameTouched, setNewNameTouched] = useState(false)
  const [playerDrafts, setPlayerDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(players.map((player) => [player.id, player.name])),
  )
  const [helpOpen, setHelpOpen] = useState(false)
  const inputRef = useRef<InputRef>(null)
  const missingPlayers = Math.max(MIN_PLAYERS - players.length, 0)
  const playerErrors = Object.fromEntries(
    players.map((player) => {
      const draft = playerDrafts[player.id] ?? player.name
      return [player.id, getNameError(players, player.id, draft)]
    }),
  )
  const hasInvalidDraft = Object.values(playerErrors).some(Boolean)
  const hasUncommittedDraft = players.some(
    (player) => (playerDrafts[player.id] ?? player.name) !== player.name,
  )
  const canBuildTeams = missingPlayers === 0 && !hasInvalidDraft && !hasUncommittedDraft
  const newNameError = newNameTouched ? getNameError(players, null, name) : undefined
  const teamValidationMessage = missingPlayers
    ? getMissingPlayersMessage(missingPlayers)
    : hasInvalidDraft
      ? 'Corregí los nombres de los jugadores antes de armar equipos.'
      : hasUncommittedDraft
        ? 'Confirmá los nombres editados con Enter o al salir del campo.'
        : undefined

  if (!nickname.trim() || players.length === 0) {
    return <Navigate to="/" replace />
  }

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNewNameTouched(true)
    const result = addPlayer(name)

    if (result.kind === 'empty') {
      inputRef.current?.focus()
      return
    }

    if (result.kind === 'duplicate') {
      inputRef.current?.focus()
      return
    }

    setPlayerDrafts((drafts) => ({ ...drafts, [result.player.id]: result.player.name }))
    setName('')
    setNewNameTouched(false)
    inputRef.current?.focus()
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

      <main className={styles.main}>
        <form className={styles.form} onSubmit={handleAdd} noValidate>
          <div className={styles.entryArea}>
            <ul className={styles.playerList} aria-label="Jugadores">
              {players.map((player) => (
                <li key={player.id} className={styles.playerRow}>
                  <div className={styles.playerField}>
                    <label className="visually-hidden" htmlFor={`player-${player.id}`}>
                      Nombre de {player.name}
                    </label>
                    <Input
                      allowClear
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
                  <Tooltip title={`Eliminar a ${player.name}`}>
                    <Button
                      className={styles.removeButton}
                      size="large"
                      icon={<MinusCircleOutlined />}
                      aria-label={`Eliminar a ${player.name}`}
                      htmlType="button"
                      onClick={() => handleRemove(player)}
                    />
                  </Tooltip>
                </li>
              ))}
            </ul>

            <div className={styles.playerField}>
              <label className="visually-hidden" htmlFor="player-name">Nombre del jugador</label>
              <Input
                allowClear
                ref={inputRef}
                className={styles.playerInput}
                id="player-name"
                name="player-name"
                size="large"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="off"
                placeholder="Ingresar nombre"
                prefix={<UserOutlined />}
                showCount
                status={newNameError ? 'error' : undefined}
                required
                aria-describedby={newNameError ? 'new-player-error' : undefined}
                aria-invalid={newNameError ? true : undefined}
                onBlur={() => setNewNameTouched(true)}
                onChange={(event) => setName(event.target.value)}
              />
              {newNameError ? (
                <span id="new-player-error" className={styles.validationMessage} role="alert">
                  {newNameError}
                </span>
              ) : null}
            </div>
            <Button
              className={styles.addButton}
              htmlType="submit"
              type="dashed"
              size="large"
              icon={<PlusOutlined />}
              block
            >
              Agregar jugador
            </Button>
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
              onClick={() => toast.info('La configuración estará disponible próximamente.')}
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
                  onClick={() => toast.info('La creación de equipos estará disponible próximamente.')}
                >
                  Armar equipos
                </Button>
              </span>
            </Tooltip>
          </footer>
        </form>
      </main>
    </div>
  )
}

export default PlayersPage
