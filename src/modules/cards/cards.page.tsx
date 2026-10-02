import { CheckCircleFilled } from '@ant-design/icons'
import { Button } from 'antd'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'

import { CARD_CATALOG_BY_ID, CARD_IDS } from '@/shared/catalog/card-catalog'
import { CARD_CATALOG_SIZE, CARD_DEAL_SIZE } from '@/shared/constants/card-draft'
import {
  createCardDraftSetupKey,
  getCardDraftSessionErrors,
} from '@/shared/domain/card-draft'
import {
  getTeamAssignmentSignature,
  isRosterValid,
  validateTeamAssignment,
} from '@/shared/domain/setup'
import { useSetupStore } from '@/shared/store/setup.store'
import { CARD_DRAFT_PHASES, type CardId } from '@/shared/types/card-draft'

import { DraftCard, type DraftCardSelection } from './components/draft-card/draft-card'
import styles from './cards.module.css'

function CardsPage() {
  const navigate = useNavigate()
  const {
    nickname,
    ownerPlayerId,
    players,
    mainDeckCardCount,
    teamCount,
    teamAssignment,
    cardDraft,
    revealCardDraft,
    toggleMainCard,
    confirmMainCards,
    editMainCards,
    toggleLightningCard,
    saveCurrentPlayerDraft,
  } = useSetupStore(
    useShallow((state) => ({
      nickname: state.nickname,
      ownerPlayerId: state.ownerPlayerId,
      players: state.players,
      mainDeckCardCount: state.mainDeckCardCount,
      teamCount: state.teamCount,
      teamAssignment: state.teamAssignment,
      cardDraft: state.cardDraft,
      revealCardDraft: state.revealCardDraft,
      toggleMainCard: state.toggleMainCard,
      confirmMainCards: state.confirmMainCards,
      editMainCards: state.editMainCards,
      toggleLightningCard: state.toggleLightningCard,
      saveCurrentPlayerDraft: state.saveCurrentPlayerDraft,
    })),
  )
  const [revealedPlayerIndex, setRevealedPlayerIndex] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')

  const hasOwner =
    Boolean(nickname.trim()) &&
    ownerPlayerId !== null &&
    players.some((player) => player.id === ownerPlayerId)
  const hasValidRoster =
    isRosterValid(players) && players.length * CARD_DEAL_SIZE <= CARD_CATALOG_SIZE
  const hasValidTeams =
    hasValidRoster &&
    validateTeamAssignment(players, teamCount, teamAssignment).kind === 'valid'
  const setupKey = hasOwner
    ? createCardDraftSetupKey({
        ownerPlayerId,
        players,
        mainDeckCardCount,
        teamAssignmentSignature: getTeamAssignmentSignature(teamAssignment),
      })
    : ''
  const draftErrors =
    cardDraft && hasOwner
      ? getCardDraftSessionErrors(
          cardDraft,
          setupKey,
          players.map((player) => player.id),
          CARD_IDS,
        )
      : ['missing-draft']

  if (!hasOwner) return <Navigate to="/" replace />
  if (!hasValidRoster) return <Navigate to="/players" replace />
  if (!hasValidTeams || !cardDraft || draftErrors.length > 0) {
    return <Navigate to="/teams" replace />
  }

  if (cardDraft.phase === CARD_DRAFT_PHASES.complete) {
    return (
      <main className={styles.page}>
        <section className={styles.completion} aria-labelledby="draft-complete-title">
          <CheckCircleFilled className={styles.completionIcon} aria-hidden="true" />
          <div className={styles.completionCopy}>
            <p className={styles.eyebrow}>SELECCIÓN COMPLETA</p>
            <h1 id="draft-complete-title">Las cartas están listas</h1>
            <p>
              Todos guardaron sus cartas privadas. Volvé a la preparación sin mostrar ninguna
              selección.
            </p>
          </div>
          <div className={styles.completionActions}>
            <Button type="primary" size="large" block onClick={() => navigate('/teams')}>
              Volver a equipos
            </Button>
            <Button size="large" block onClick={() => navigate('/')}>
              Ir al inicio
            </Button>
          </div>
        </section>
      </main>
    )
  }

  const currentPlayerDraft = cardDraft.playerDrafts[cardDraft.currentPlayerIndex]
  const currentPlayer = players[cardDraft.currentPlayerIndex]
  if (!currentPlayerDraft || !currentPlayer) return <Navigate to="/teams" replace />

  const privateCardsAreUnlocked =
    cardDraft.phase !== CARD_DRAFT_PHASES.handoff &&
    revealedPlayerIndex === cardDraft.currentPlayerIndex

  const handleReveal = () => {
    if (cardDraft.phase !== CARD_DRAFT_PHASES.handoff) {
      setFeedback('')
      setRevealedPlayerIndex(cardDraft.currentPlayerIndex)
      return
    }

    const revealResult = revealCardDraft()
    if (revealResult.kind === 'rejected') {
      setFeedback('No se pudieron mostrar las cartas en este momento.')
      return
    }
    setFeedback('')
    setRevealedPlayerIndex(revealResult.session.currentPlayerIndex)
  }

  if (!privateCardsAreUnlocked) {
    return (
      <main className={styles.page}>
        <section className={styles.handoff} aria-labelledby="handoff-player">
          <div className={styles.handoffContent}>
            <p className={styles.turnLabel}>Turno de:</p>
            <h1 id="handoff-player">{currentPlayer.name}</h1>
            <p className={styles.privacyInstruction}>
              Pasá el dispositivo a esta persona. Solo ella debe ver la siguiente pantalla.
            </p>
            <div className={styles.deckSummary}>
              <span>MAZO PRINCIPAL</span>
              <strong>{mainDeckCardCount} cartas</strong>
            </div>
            {feedback ? (
              <p className={styles.handoffError} role="alert">
                {feedback}
              </p>
            ) : null}
          </div>
          <Button
            className={styles.revealButton}
            type="primary"
            size="large"
            block
            onClick={handleReveal}
          >
            Elegir {mainDeckCardCount} cartas
          </Button>
        </section>
      </main>
    )
  }

  const selectedMainCount = currentPlayerDraft.selectedMainCardIds.length
  const isChoosingMain = cardDraft.phase === CARD_DRAFT_PHASES.selectingMain
  const mainQuotaIsComplete = selectedMainCount === mainDeckCardCount

  const handleMainCardToggle = (cardId: CardId, wasSelected: boolean) => {
    const result = toggleMainCard(cardId)
    if (result.kind === 'success') {
      setFeedback(wasSelected ? 'Carta principal quitada.' : 'Carta principal seleccionada.')
      return
    }
    setFeedback(
      result.reason === 'main-quota-reached'
        ? 'Quitá una carta principal antes de elegir otra.'
        : 'Esa acción no está disponible en esta etapa.',
    )
  }

  const handleConfirmMain = () => {
    const result = confirmMainCards()
    if (result.kind === 'rejected') {
      setFeedback(
        result.reason === 'main-quota-incomplete'
          ? `Elegí exactamente ${mainDeckCardCount} cartas principales.`
          : 'No se pudo confirmar la selección principal.',
      )
      return
    }
    setFeedback('')
  }

  if (isChoosingMain) {
    const remainingMainCount = mainDeckCardCount - selectedMainCount
    const mainInstruction = mainQuotaIsComplete
      ? 'La selección principal está completa.'
      : `Elegí ${remainingMainCount} carta${remainingMainCount === 1 ? '' : 's'} principal${remainingMainCount === 1 ? '' : 'es'} más.`

    return (
      <main className={styles.page}>
        <section className={styles.selectionLayout} aria-labelledby="main-selection-title">
          <header className={styles.selectionHeader}>
            <p className={styles.eyebrow}>SELECCIÓN PRINCIPAL</p>
            <h1 id="main-selection-title">{currentPlayer.name}</h1>
            <p className={styles.progress}>
              {selectedMainCount} / {mainDeckCardCount}
            </p>
            <p className={styles.instruction}>{mainInstruction}</p>
            <p className={styles.feedback} role="status" aria-live="polite">
              {feedback}
            </p>
          </header>

          <div className={styles.cardScroller}>
            <ul className={styles.cardList} aria-label="Cartas para la selección principal">
              {currentPlayerDraft.dealCardIds.map((cardId) => {
                const card = CARD_CATALOG_BY_ID.get(cardId)
                if (!card) return null
                const selection: DraftCardSelection =
                  currentPlayerDraft.selectedMainCardIds.includes(cardId) ? 'main' : 'none'
                const ineligibleReason =
                  mainQuotaIsComplete && selection === 'none'
                    ? 'Quitá una principal para habilitar esta carta.'
                    : undefined

                return (
                  <li key={card.id}>
                    <DraftCard
                      card={card}
                      selection={selection}
                      ineligibleReason={ineligibleReason}
                      onSelect={() => handleMainCardToggle(card.id, selection === 'main')}
                    />
                  </li>
                )
              })}
            </ul>
          </div>

          <footer className={styles.selectionActions} aria-label="Acciones principales">
            <Button
              type="primary"
              size="large"
              block
              disabled={!mainQuotaIsComplete}
              aria-describedby="main-selection-help"
              onClick={handleConfirmMain}
            >
              Continuar a Relámpago
            </Button>
            <p id="main-selection-help" className={styles.saveHelp}>
              Elegí exactamente {mainDeckCardCount} cartas principales para continuar.
            </p>
          </footer>
        </section>
      </main>
    )
  }

  const lightningCandidateCardIds = currentPlayerDraft.dealCardIds.filter(
    (cardId) => !currentPlayerDraft.selectedMainCardIds.includes(cardId),
  )
  const isReady = cardDraft.phase === CARD_DRAFT_PHASES.ready
  const lightningSelectedCount = currentPlayerDraft.lightningCardId ? 1 : 0

  const handleLightningCardToggle = (cardId: CardId, wasSelected: boolean) => {
    const result = toggleLightningCard(cardId)
    if (result.kind === 'success') {
      setFeedback(wasSelected ? 'Carta Relámpago quitada.' : 'Carta Relámpago seleccionada.')
      return
    }
    setFeedback(
      result.reason === 'lightning-must-be-distinct'
        ? 'La carta Relámpago debe ser distinta de las cartas principales.'
        : 'Esa acción no está disponible en esta etapa.',
    )
  }

  const handleEditMain = () => {
    const result = editMainCards()
    if (result.kind === 'success') {
      setFeedback('Seleccioná nuevamente tus cartas principales.')
    }
  }

  const handleSave = () => {
    const result = saveCurrentPlayerDraft()
    if (result.kind === 'rejected') {
      setFeedback('Elegí una carta Relámpago antes de guardar.')
      return
    }
    setFeedback('')
    setRevealedPlayerIndex(null)
  }

  return (
    <main className={styles.page}>
      <section className={styles.selectionLayout} aria-labelledby="lightning-selection-title">
        <header className={styles.selectionHeader}>
          <p className={styles.eyebrow}>SELECCIÓN RELÁMPAGO</p>
          <h1 id="lightning-selection-title">Carta Relámpago de {currentPlayer.name}</h1>
          <p className={`${styles.progress} ${styles.lightningProgress}`}>
            {lightningSelectedCount} / 1
          </p>
          <p className={styles.instruction}>
            Elegí 1 carta entre las que no seleccionaste como principales.
          </p>
          <p className={styles.feedback} role="status" aria-live="polite">
            {feedback}
          </p>
        </header>

        <div className={styles.cardScroller}>
          <ul className={styles.cardList} aria-label="Cartas disponibles para Relámpago">
            {lightningCandidateCardIds.map((cardId) => {
              const card = CARD_CATALOG_BY_ID.get(cardId)
              if (!card) return null
              const selection: DraftCardSelection =
                currentPlayerDraft.lightningCardId === cardId ? 'lightning' : 'none'

              return (
                <li key={card.id}>
                  <DraftCard
                    card={card}
                    selection={selection}
                    onSelect={() =>
                      handleLightningCardToggle(card.id, selection === 'lightning')
                    }
                  />
                </li>
              )
            })}
          </ul>
        </div>

        <footer className={styles.selectionActions} aria-label="Acciones de Relámpago">
          <Button size="large" block onClick={handleEditMain}>
            Cambiar principales
          </Button>
          <Button
            type="primary"
            size="large"
            block
            disabled={!isReady}
            aria-describedby="lightning-selection-help"
            onClick={handleSave}
          >
            Guardar selección
          </Button>
          <p id="lightning-selection-help" className={styles.saveHelp}>
            {isReady
              ? 'Se guardará y ocultará la selección antes del próximo turno.'
              : 'Elegí 1 carta Relámpago para guardar.'}
          </p>
        </footer>
      </section>
    </main>
  )
}

export default CardsPage
