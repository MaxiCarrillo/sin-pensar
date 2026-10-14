import { Button } from 'antd'

import { AppDrawer } from '@/modules/common'
import type { CardId } from '@/shared/types/card-draft'
import type { GameplayTeam } from '@/shared/types/gameplay'
import type { Player } from '@/shared/types/setup'

import styles from './lightning-attribution-chooser.module.css'

interface LightningAttributionChooserProps {
  cardId: CardId
  open: boolean
  players: readonly Player[]
  teams: readonly GameplayTeam[]
  onAward: (cardId: CardId, playerId: string, resolvedAt: number) => void
  onCancel: (cardId: CardId, resolvedAt: number) => void
}

interface LightningPlayerChoice {
  player: Player
  team: GameplayTeam
}

function getLightningPlayerChoices(
  players: readonly Player[],
  teams: readonly GameplayTeam[],
): LightningPlayerChoice[] {
  const playersById = new Map(players.map((player) => [player.id, player]))
  return teams.flatMap((team) =>
    team.playerIds.flatMap((playerId) => {
      const player = playersById.get(playerId)
      return player ? [{ player, team }] : []
    }),
  )
}

export function LightningAttributionChooser({
  cardId,
  open,
  players,
  teams,
  onAward,
  onCancel,
}: LightningAttributionChooserProps) {
  const choices = getLightningPlayerChoices(players, teams)
  const cancel = () => onCancel(cardId, Date.now())

  return (
    <AppDrawer
      open={open}
      title="¿Quién acertó?"
      description="Elegí al jugador para sumar un punto a su equipo."
      onClose={cancel}
    >
      <div className={styles.content}>
        <ul className={styles.playerList} aria-label="Jugadores que pueden recibir el acierto">
          {choices.map(({ player, team }) => (
            <li key={player.id}>
              <button
                type="button"
                className={styles.playerButton}
                aria-label={`Atribuir acierto a ${player.name}, ${team.name}`}
                onClick={() => onAward(cardId, player.id, Date.now())}
              >
                <strong>{player.name}</strong>
                <span>{team.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <Button className={styles.cancelButton} size="large" block onClick={cancel}>
          Cancelar
        </Button>
      </div>
    </AppDrawer>
  )
}
