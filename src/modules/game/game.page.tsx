import { Button } from 'antd'
import { useEffect, useState, type CSSProperties } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'

import { CARD_CATALOG_BY_ID, CARD_IDS } from '@/shared/catalog/card-catalog'
import {
  getCurrentGameplayCardId,
  getCurrentTurnParticipant,
  getGameplayTurnDurationSeconds,
  getScoreForTeam,
  getWinningTeams,
  validateGameplaySetup,
} from '@/shared/domain/gameplay'
import { isRosterValid, validateTeamAssignment } from '@/shared/domain/setup'
import { useGameplayStore } from '@/shared/store/gameplay.store'
import { useSetupStore } from '@/shared/store/setup.store'
import type { CardId } from '@/shared/types/card-draft'
import {
  GAMEPLAY_PHASES,
  GAMEPLAY_STAGES,
  type CurrentTurnParticipant,
  type GameplayState,
  type GameplayTeamScore,
  type GameplayTransitionResult,
} from '@/shared/types/gameplay'
import type { Player } from '@/shared/types/setup'

import { GameplayCard } from './components/gameplay-card/gameplay-card'
import { LightningAttributionChooser } from './components/lightning-attribution-chooser/lightning-attribution-chooser'
import { concealActiveGameplayForRoute } from './game-route-privacy'
import type { SwipeDecision } from './swipe'
import styles from './game.module.css'
import { useGameplayTimer } from './use-gameplay-timer'

interface HandoffViewProps {
  game: Extract<GameplayState, { phase: 'handoff' | 'concealed-active' }>
  participant: CurrentTurnParticipant
  playerName: string
  onReveal: () => void
}

function HandoffView({ game, participant, playerName, onReveal }: HandoffViewProps) {
  const stage = GAMEPLAY_STAGES[game.stageIndex]
  const score = getScoreForTeam(game.scores, participant.team.id)
  const isResuming = game.phase === GAMEPLAY_PHASES.concealedActive
  const isLightning = stage.kind === 'lightning'
  const stageDuration = getGameplayTurnDurationSeconds(stage, game.turnDuration)

  return (
    <main className={`${styles.page} ${styles.handoffPage}`}>
      <section className={styles.handoff} aria-labelledby="game-handoff-player">
        <div className={styles.handoffContent}>
          <p className={styles.turnLabel}>Turno de:</p>
          <h1 id="game-handoff-player">{playerName}</h1>
          <p className={styles.privacyInstruction}>
            {isLightning
              ? 'Controla el dispositivo. Todos pueden acertar y la carta se mantiene oculta hasta continuar.'
              : isResuming
                ? 'La carta sigue oculta. El tiempo original no se reiniciará al continuar.'
                : 'Pasá el dispositivo. La carta se mostrará solo cuando esta persona toque el botón.'}
          </p>
          <div className={styles.stageSummary}>
            <p className={styles.stageLabel}>{stage.label}</p>
            <strong>{stage.rule}</strong>
            <span>{isResuming ? 'Turno en curso' : `${stageDuration} segundos`}</span>
          </div>
          <dl className={styles.turnSummary}>
            <div>
              <dt>{isLightning ? 'Control' : 'Equipo'}</dt>
              <dd>{isLightning ? playerName : participant.team.name}</dd>
            </div>
            <div>
              <dt>Cartas</dt>
              <dd>{game.pendingCardIds.length}</dd>
            </div>
            <div>
              <dt>{isLightning ? 'Participan' : 'Puntaje'}</dt>
              <dd>{isLightning ? 'Todos' : score}</dd>
            </div>
          </dl>
        </div>
        <Button className={styles.bottomButton} type="primary" size="large" block onClick={onReveal}>
          {isResuming ? 'Continuar turno' : 'Tocá para ver la carta'}
        </Button>
      </section>
    </main>
  )
}

interface ActiveTurnViewProps {
  game: Extract<GameplayState, { phase: 'active-turn' | 'lightning-attribution' }>
  participant: CurrentTurnParticipant
  players: readonly Player[]
  statusMessage: string
  onDecision: (
    decision: SwipeDecision,
    cardId: CardId,
    decidedAt: number,
  ) => GameplayTransitionResult
  onAwardLightningAttribution: (
    cardId: CardId,
    playerId: string,
    resolvedAt: number,
  ) => GameplayTransitionResult
  onCancelLightningAttribution: (
    cardId: CardId,
    resolvedAt: number,
  ) => GameplayTransitionResult
  onExpire: (now: number) => GameplayTransitionResult
}

function ActiveTurnView({
  game,
  participant,
  players,
  statusMessage,
  onDecision,
  onAwardLightningAttribution,
  onCancelLightningAttribution,
  onExpire,
}: ActiveTurnViewProps) {
  const [attributionChooserCardId, setAttributionChooserCardId] = useState<CardId | null>(null)
  const stage = GAMEPLAY_STAGES[game.stageIndex]
  const isAwaitingAttribution = game.phase === GAMEPLAY_PHASES.lightningAttribution
  const cardId = getCurrentGameplayCardId(game)
  const card = cardId ? CARD_CATALOG_BY_ID.get(cardId) : undefined
  const score = getScoreForTeam(game.scores, participant.team.id)
  const { progress, remainingSeconds, liveAnnouncement } = useGameplayTimer({
    startedAt: game.startedAt,
    deadline: game.deadline,
    frozenAt: isAwaitingAttribution ? game.pendingAttribution.decidedAt : null,
    onExpire,
  })
  const pageStyle = {
    '--timer-progress-scale': progress,
    '--stage-background-color': stage.backgroundColor,
    '--stage-action-color': stage.actionColor,
  } as CSSProperties

  if (!card) {
    return (
      <main className={`${styles.page} ${styles.handoffPage}`}>
        <section className={styles.centeredState} role="alert">
          <h1>No se pudo mostrar la carta</h1>
          <p>Volvé a la preparación para iniciar una partida válida.</p>
        </section>
      </main>
    )
  }

  return (
    <main className={`${styles.page} ${styles.activePage}`} style={pageStyle}>
      <section className={styles.activeTurn} aria-labelledby="active-stage-title">
        <header className={styles.activeHeader}>
          <div>
            <p id="active-stage-title" className={styles.activeStage}>
              {stage.label} · {stage.rule}
            </p>
            <p className={styles.activeTeam}>
              {stage.kind === 'lightning'
                ? 'JUEGAN TODOS'
                : `${participant.team.name} · ${score} puntos`}
            </p>
          </div>
          <p className={styles.timer} aria-label={`${remainingSeconds} segundos restantes`}>
            {remainingSeconds}s
          </p>
        </header>
        <GameplayCard
          card={card}
          cardRegionClassName={styles.cardViewport}
          disabled={isAwaitingAttribution}
          onDecision={(decision, decisionCardId, decidedAt) => {
            if (decision === 'correct') setAttributionChooserCardId(null)
            return onDecision(decision, decisionCardId, decidedAt)
          }}
          onDecisionInteractionComplete={(decision, decisionCardId) => {
            if (decision === 'correct') setAttributionChooserCardId(decisionCardId)
          }}
        />
        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {statusMessage}
        </p>
        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {liveAnnouncement}
        </p>
        {isAwaitingAttribution ? (
          <LightningAttributionChooser
            cardId={game.pendingAttribution.cardId}
            open={attributionChooserCardId === game.pendingAttribution.cardId}
            players={players}
            teams={game.teams}
            onAward={onAwardLightningAttribution}
            onCancel={onCancelLightningAttribution}
          />
        ) : null}
      </section>
    </main>
  )
}

interface ScoreTableProps {
  scores: readonly GameplayTeamScore[]
  game: GameplayState
  caption: string
}

function ScoreTable({ scores, game, caption }: ScoreTableProps) {
  return (
    <table className={styles.scoreTable}>
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Equipo</th>
          <th scope="col">Puntos</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((score) => (
          <tr key={score.teamId}>
            <th scope="row">
              {game.teams.find((team) => team.id === score.teamId)?.name ?? 'Equipo'}
            </th>
            <td>{score.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function GamePage() {
  const navigate = useNavigate()
  const {
    nickname,
    ownerPlayerId,
    players,
    turnDuration,
    mainDeckCardCount,
    teamCount,
    teamAssignment,
    cardDraft,
    clearCardDraft,
  } = useSetupStore(
    useShallow((state) => ({
      nickname: state.nickname,
      ownerPlayerId: state.ownerPlayerId,
      players: state.players,
      turnDuration: state.turnDuration,
      mainDeckCardCount: state.mainDeckCardCount,
      teamCount: state.teamCount,
      teamAssignment: state.teamAssignment,
      cardDraft: state.cardDraft,
      clearCardDraft: state.clearCardDraft,
    })),
  )
  const {
    game,
    startTurn,
    markCorrect,
    beginLightningAttribution,
    awardLightningAttribution,
    cancelLightningAttribution,
    passCard,
    expireTurn,
    shuffleRemaining,
    prepareNextStage,
    showResults,
  } = useGameplayStore(
    useShallow((state) => ({
      game: state.game,
      startTurn: state.startTurn,
      markCorrect: state.markCorrect,
      beginLightningAttribution: state.beginLightningAttribution,
      awardLightningAttribution: state.awardLightningAttribution,
      cancelLightningAttribution: state.cancelLightningAttribution,
      passCard: state.passCard,
      expireTurn: state.expireTurn,
      shuffleRemaining: state.shuffleRemaining,
      prepareNextStage: state.prepareNextStage,
      showResults: state.showResults,
    })),
  )
  const [statusMessage, setStatusMessage] = useState('')
  const [blockInitialActiveCard, setBlockInitialActiveCard] = useState(
    () =>
      game?.phase === GAMEPLAY_PHASES.activeTurn ||
      game?.phase === GAMEPLAY_PHASES.lightningAttribution,
  )

  useEffect(() => {
    concealActiveGameplayForRoute(useGameplayStore)
    return () => {
      concealActiveGameplayForRoute(useGameplayStore)
    }
  }, [])

  const hasOwner =
    Boolean(nickname.trim()) &&
    ownerPlayerId !== null &&
    players.some((player) => player.id === ownerPlayerId)
  const hasValidRoster = isRosterValid(players)
  const hasValidTeams =
    hasValidRoster &&
    validateTeamAssignment(players, teamCount, teamAssignment).kind === 'valid'
  const setupValidation =
    ownerPlayerId && cardDraft
      ? validateGameplaySetup({
          ownerPlayerId,
          players,
          turnDuration,
          mainDeckCardCount,
          teamCount,
          teamAssignment,
          cardDraft,
          knownCardIds: CARD_IDS,
        })
      : null

  if (!hasOwner) return <Navigate to="/" replace />
  if (!hasValidRoster) return <Navigate to="/players" replace />
  if (!hasValidTeams) return <Navigate to="/teams" replace />
  if (!cardDraft) return <Navigate to="/teams" replace />
  if (!setupValidation || setupValidation.kind === 'rejected') {
    return <Navigate to={cardDraft.phase === 'complete' ? '/teams' : '/cards'} replace />
  }
  if (!game || game.setupKey !== setupValidation.setupKey) {
    return <Navigate to="/cards" replace />
  }

  const participant = getCurrentTurnParticipant(game)
  const currentPlayer = participant
    ? players.find((player) => player.id === participant.playerId)
    : undefined
  if (!participant || !currentPlayer) return <Navigate to="/cards" replace />

  if (
    blockInitialActiveCard &&
    (game.phase === GAMEPLAY_PHASES.activeTurn ||
      game.phase === GAMEPLAY_PHASES.lightningAttribution)
  ) {
    return (
      <main className={`${styles.page} ${styles.handoffPage}`}>
        <section className={styles.centeredState} aria-live="polite">
          <p className={styles.stageLabel}>PRIVACIDAD</p>
          <h1>Ocultando la carta</h1>
          <p>La partida volverá al pase privado sin cambiar cartas ni puntajes.</p>
        </section>
      </main>
    )
  }

  const handleReveal = () => {
    setBlockInitialActiveCard(false)
    const result = startTurn(Date.now())
    setStatusMessage(
      result.kind === 'success'
        ? ''
        : 'No se pudo iniciar el turno.',
    )
  }

  const handleDecision = (decision: SwipeDecision, cardId: CardId, decidedAt: number) => {
    const stage = GAMEPLAY_STAGES[game.stageIndex]
    const result =
      decision === 'correct'
        ? stage.kind === 'lightning'
          ? beginLightningAttribution(cardId, decidedAt)
          : markCorrect(cardId, decidedAt)
        : passCard(cardId, decidedAt)
    if (result.kind === 'rejected') {
      if (result.reason !== 'invalid-phase' && result.reason !== 'stale-card') {
        setStatusMessage('No se pudo aplicar esa acción.')
      }
      return result
    }
    if (result.state.phase === GAMEPLAY_PHASES.timeExpired) {
      setStatusMessage('El tiempo terminó antes de resolver la carta.')
      return result
    }
    if (result.state.phase === GAMEPLAY_PHASES.lightningAttribution) {
      setStatusMessage('Acierto registrado. Elegí quién acertó.')
      return result
    }
    const nextScore = getScoreForTeam(result.state.scores, participant.team.id)
    setStatusMessage(
      decision === 'correct'
        ? `Acierto. ${participant.team.name} tiene ${nextScore} puntos.`
        : 'Carta pasada. Sigue disponible en este turno.',
    )
    return result
  }

  const handleAwardLightningAttribution = (
    cardId: CardId,
    playerId: string,
    resolvedAt: number,
  ) => {
    const result = awardLightningAttribution(cardId, playerId, resolvedAt)
    if (result.kind === 'rejected') {
      if (result.reason !== 'invalid-phase' && result.reason !== 'stale-card') {
        setStatusMessage('No se pudo atribuir el acierto.')
      }
      return result
    }

    const player = players.find((candidate) => candidate.id === playerId)
    const scoringTeam = result.state.teams.find((team) => team.playerIds.includes(playerId))
    if (player && scoringTeam) {
      const nextScore = getScoreForTeam(result.state.scores, scoringTeam.id)
      setStatusMessage(
        `Acierto de ${player.name}. ${scoringTeam.name} tiene ${nextScore} puntos.`,
      )
    }
    return result
  }

  const handleCancelLightningAttribution = (cardId: CardId, resolvedAt: number) => {
    const result = cancelLightningAttribution(cardId, resolvedAt)
    if (result.kind === 'success') {
      setStatusMessage('Atribución cancelada. El turno continúa.')
    } else if (result.reason !== 'invalid-phase' && result.reason !== 'stale-card') {
      setStatusMessage('No se pudo cancelar la atribución.')
    }
    return result
  }

  const handleReturnToSetup = (path: '/' | '/players') => {
    clearCardDraft()
    navigate(path)
  }

  switch (game.phase) {
    case GAMEPLAY_PHASES.handoff:
    case GAMEPLAY_PHASES.concealedActive:
      return (
        <HandoffView
          game={game}
          participant={participant}
          playerName={currentPlayer.name}
          onReveal={handleReveal}
        />
      )
    case GAMEPLAY_PHASES.activeTurn:
    case GAMEPLAY_PHASES.lightningAttribution:
      return (
        <ActiveTurnView
          game={game}
          participant={participant}
          players={players}
          statusMessage={statusMessage}
          onDecision={handleDecision}
          onAwardLightningAttribution={handleAwardLightningAttribution}
          onCancelLightningAttribution={handleCancelLightningAttribution}
          onExpire={expireTurn}
        />
      )
    case GAMEPLAY_PHASES.timeExpired:
      return (
        <main className={`${styles.page} ${styles.timeoutPage}`}>
          <section className={styles.terminalState} aria-labelledby="time-expired-title">
            <div className={styles.terminalContent}>
              <p>{participant.team.name}</p>
              <h1 id="time-expired-title">SE ACABÓ EL TIEMPO</h1>
              <span>La carta visible sigue en el mazo.</span>
            </div>
            <Button
              className={`${styles.bottomButton} ${styles.timeoutButton}`}
              size="large"
              block
              onClick={() => shuffleRemaining(Math.random)}
            >
              Mezclar mazo
            </Button>
          </section>
        </main>
      )
    case GAMEPLAY_PHASES.stageComplete: {
      const completedStage = GAMEPLAY_STAGES[game.stageIndex]
      const nextStage = GAMEPLAY_STAGES[game.stageIndex + 1]
      return (
        <main className={`${styles.page} ${styles.stageCompletePage}`}>
          <section className={styles.scrollableState} aria-labelledby="stage-complete-title">
            <div className={styles.stateCopy}>
              <p className={styles.stageLabel}>{completedStage.label}</p>
              <h1 id="stage-complete-title">{completedStage.name} terminada</h1>
              <p>
                Sigue {nextStage.name}: <strong>{nextStage.rule}</strong>.
              </p>
            </div>
            <ScoreTable scores={game.scores} game={game} caption="Puntajes acumulados" />
            <Button
              className={styles.bottomButton}
              type="primary"
              size="large"
              block
              onClick={() => prepareNextStage(Math.random)}
            >
              Preparar {nextStage.name}
            </Button>
          </section>
        </main>
      )
    }
    case GAMEPLAY_PHASES.gameComplete:
      return (
        <main className={`${styles.page} ${styles.gameCompletePage}`}>
          <section className={styles.terminalState} aria-labelledby="game-complete-title">
            <div className={styles.terminalContent}>
              <h1 id="game-complete-title">FIN DE LA PARTIDA</h1>
              <p>Los puntajes de las cuatro etapas están listos.</p>
            </div>
            <Button
              className={`${styles.bottomButton} ${styles.gameCompleteButton}`}
              size="large"
              block
              onClick={showResults}
            >
              Ver equipo ganador
            </Button>
          </section>
        </main>
      )
    case GAMEPLAY_PHASES.results: {
      const winners = getWinningTeams(game)
      const winnerNames = winners.map((winner) => winner.name).join(' y ')
      return (
        <main className={`${styles.page} ${styles.resultsPage}`}>
          <section className={styles.scrollableState} aria-labelledby="results-title">
            <div className={styles.stateCopy}>
              <p className={styles.stageLabel}>RESULTADOS</p>
              <h1 id="results-title">
                {winners.length > 1 ? '¡Hay empate!' : '¡Equipo ganador!'}
              </h1>
              <p className={styles.winnerNames}>{winnerNames}</p>
            </div>
            <ScoreTable scores={game.scores} game={game} caption="Resultados finales" />
            <div className={styles.resultActions}>
              <Button type="primary" size="large" block onClick={() => handleReturnToSetup('/players')}>
                Preparar otra partida
              </Button>
              <Button size="large" block onClick={() => handleReturnToSetup('/')}>
                Volver al inicio
              </Button>
            </div>
          </section>
        </main>
      )
    }
  }
}

export default GamePage
