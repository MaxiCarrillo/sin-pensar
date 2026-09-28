import {
  ArrowLeftOutlined,
  MinusOutlined,
  PlusOutlined,
  QuestionOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Input, Tooltip, type InputRef } from 'antd'
import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'

import { AppDrawer } from '@/modules/common'
import { MAX_NAME_LENGTH, MIN_PLAYERS } from '@/shared/constants/setup'
import { useSetupStore } from '@/shared/store/setup.store'
import type { Player } from '@/shared/types/setup'

import styles from './players.module.css'

interface StatusMessage {
  kind: 'error' | 'info'
  text: string
}

function PlayersPage() {
  const navigate = useNavigate()
  const { nickname, players, addPlayer, removePlayer } = useSetupStore(
    useShallow((state) => ({
      nickname: state.nickname,
      players: state.players,
      addPlayer: state.addPlayer,
      removePlayer: state.removePlayer,
    })),
  )
  const [name, setName] = useState('')
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const inputRef = useRef<InputRef>(null)
  const canBuildTeams = players.length >= MIN_PLAYERS

  if (!nickname.trim()) {
    return <Navigate to="/" replace />
  }

  const handleAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = addPlayer(name)

    if (result.kind === 'empty') {
      setStatus({ kind: 'error', text: 'Escribí un nombre antes de agregar al jugador.' })
      inputRef.current?.focus()
      return
    }

    if (result.kind === 'duplicate') {
      setStatus({ kind: 'error', text: `${result.name} ya está en la lista.` })
      inputRef.current?.focus()
      return
    }

    setName('')
    setStatus({ kind: 'info', text: `${result.player.name} fue agregado.` })
    inputRef.current?.focus()
  }

  const handleRemove = (player: Player) => {
    removePlayer(player.id)
    setStatus({ kind: 'info', text: `${player.name} fue eliminado.` })
  }

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Tooltip title="Volver al inicio">
          <Button
            className={`${styles.iconButton} ${styles.backButton}`}
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
            className={`${styles.iconButton} ${styles.helpButton}`}
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

      <AppDrawer open={helpOpen} title="Cómo jugar" closeLabel="Cerrar ayuda" onClose={() => setHelpOpen(false)}>
        <p className={styles.helpContent}>Las instrucciones detalladas se agregarán próximamente.</p>
      </AppDrawer>

      <main className={styles.main}>
        <section className={styles.roster} aria-labelledby="roster-title">
          <div className={styles.sectionHeading}>
            <h2 id="roster-title">Lista de jugadores</h2>
            <span aria-label={`${players.length} jugadores`}>{players.length}</span>
          </div>

          {players.length > 0 ? (
            <ul className={styles.playerList}>
              {players.map((player) => (
                <li key={player.id}>
                  <span title={player.name}>{player.name}</span>
                  <Tooltip title={`Eliminar a ${player.name}`}>
                    <Button
                      className={styles.removeButton}
                      type="primary"
                      shape="circle"
                      icon={<MinusOutlined />}
                      aria-label={`Eliminar a ${player.name}`}
                      onClick={() => handleRemove(player)}
                    />
                  </Tooltip>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyState}>Todavía no hay jugadores. Agregá el primero para continuar.</p>
          )}

          <form className={styles.addForm} onSubmit={handleAdd} noValidate>
            <label htmlFor="player-name">Nombre del jugador</label>
            <Input
              ref={inputRef}
              className={styles.playerInput}
              id="player-name"
              name="player-name"
              size="large"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              placeholder="Escribí un nombre"
              aria-describedby="player-name-help player-status"
              aria-invalid={status?.kind === 'error'}
              onChange={(event) => {
                setName(event.target.value)
                setStatus(null)
              }}
            />
            <span id="player-name-help" className={styles.inputHelp}>{name.length}/{MAX_NAME_LENGTH} caracteres</span>
            <Button
              className={styles.addButton}
              htmlType="submit"
              size="large"
              icon={<PlusOutlined />}
            >
              Agregar jugador
            </Button>
          </form>

          <p
            id="player-status"
            className={`${styles.status} ${status?.kind === 'error' ? styles.error : ''}`}
            role={status?.kind === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {status?.text ?? ''}
          </p>
        </section>

        <section className={styles.actions} aria-label="Acciones de preparación">
          <p id="team-requirement">
            {canBuildTeams
              ? 'Requisito mínimo alcanzado.'
              : `Se necesitan al menos ${MIN_PLAYERS} jugadores. Faltan ${MIN_PLAYERS - players.length}.`}
          </p>
          <div className={styles.actionButtons}>
            <Button
              className={styles.settingsButton}
              size="large"
              icon={<SettingOutlined />}
              onClick={() => setStatus({ kind: 'info', text: 'La configuración estará disponible próximamente.' })}
            >
              Configuración
            </Button>
            <Tooltip title={canBuildTeams ? undefined : 'Se necesitan al menos cuatro jugadores'}>
              <span className={styles.buttonWrapper}>
                <Button
                  className={styles.teamsButton}
                  type="primary"
                  size="large"
                  icon={<TeamOutlined />}
                  disabled={!canBuildTeams}
                  aria-describedby="team-requirement"
                  onClick={() => setStatus({ kind: 'info', text: 'La creación de equipos estará disponible próximamente.' })}
                >
                  Armar equipos
                </Button>
              </span>
            </Tooltip>
          </div>
        </section>
      </main>
    </div>
  )
}

export default PlayersPage
