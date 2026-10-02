import type { GameCard } from '@/shared/types/card-draft'

import styles from './draft-card.module.css'

export type DraftCardSelection = 'main' | 'lightning' | 'none'

interface DraftCardProps {
  card: GameCard
  selection: DraftCardSelection
  ineligibleReason?: string
  onSelect: () => void
}

const SELECTION_LABELS: Record<DraftCardSelection, string> = {
  main: 'Principal',
  lightning: 'Relámpago',
  none: 'No seleccionada',
}

export function DraftCard({ card, selection, ineligibleReason, onSelect }: DraftCardProps) {
  const selectionLabel = SELECTION_LABELS[selection]
  const className = [
    styles.cardButton,
    selection === 'main'
      ? styles.selectedMain
      : selection === 'lightning'
        ? styles.selectedLightning
        : styles.unselected,
    ineligibleReason ? styles.ineligible : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={className}
      aria-label={`${card.title.value}, ${card.character.value}, ${card.everything.value}, palabra clave ${card.keyword}. ${selectionLabel}${ineligibleReason ? `. ${ineligibleReason}` : ''}`}
      aria-pressed={selection !== 'none'}
      aria-disabled={ineligibleReason ? true : undefined}
      onClick={() => {
        if (!ineligibleReason) onSelect()
      }}
    >
      <span className={styles.cardCap} aria-hidden="true" />
      {selection !== 'none' ? (
        <span className={styles.selectionBadge}>{selectionLabel}</span>
      ) : null}

      <span className={`${styles.cardSection} ${styles.titleSection}`}>
        <strong className={styles.sectionValue}>{card.title.value}</strong>
        <span className={styles.sectionSubtype}>{card.title.subtype}</span>
      </span>

      <span className={`${styles.cardSection} ${styles.characterSection}`}>
        <strong className={styles.sectionValue}>{card.character.value}</strong>
        <span className={styles.sectionSubtype}>{card.character.subtype}</span>
      </span>

      <span className={`${styles.cardSection} ${styles.everythingSection}`}>
        <strong className={styles.sectionValue}>{card.everything.value}</strong>
        <span className={styles.sectionSubtype}>{card.everything.subtype}</span>
      </span>

      <span className={`${styles.cardSection} ${styles.keywordSection}`}>
        <span className={styles.keywordLabel}>PALABRA CLAVE</span>
        <strong className={styles.keywordValue}>{card.keyword}</strong>
      </span>
    </button>
  )
}
