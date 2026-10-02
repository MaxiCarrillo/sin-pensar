import { CARD_CATALOG_SIZE } from '../constants/card-draft.ts'
import type { GameCard } from '../types/card-draft.ts'

export interface CardCatalogIntegrity {
  valid: boolean
  errors: string[]
}

function normalizeRecordValue(value: string) {
  return value.trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase('es')
}

function getRecordSignature(card: GameCard) {
  return [
    card.title.value,
    card.title.subtype,
    card.character.value,
    card.character.subtype,
    card.everything.value,
    card.everything.subtype,
    card.keyword,
  ]
    .map(normalizeRecordValue)
    .join('\u001f')
}

export function validateCardCatalog(cards: readonly GameCard[]): CardCatalogIntegrity {
  const errors: string[] = []

  if (cards.length !== CARD_CATALOG_SIZE) {
    errors.push(`Expected ${CARD_CATALOG_SIZE} cards, received ${cards.length}.`)
  }

  const ids = cards.map((card) => card.id)
  if (new Set(ids).size !== ids.length) errors.push('Card IDs must be unique.')

  cards.forEach((card, index) => {
    const expectedId = `card-${String(index + 1).padStart(3, '0')}`
    if (card.id !== expectedId) {
      errors.push(`Expected ${expectedId} at position ${index + 1}, received ${card.id}.`)
    }

    const requiredValues = [
      card.title.value,
      card.title.subtype,
      card.character.value,
      card.character.subtype,
      card.everything.value,
      card.everything.subtype,
      card.keyword,
    ]
    if (requiredValues.some((value) => !value.trim())) {
      errors.push(`${card.id} contains a blank required field.`)
    }
  })

  const signatures = cards.map(getRecordSignature)
  if (new Set(signatures).size !== signatures.length) {
    errors.push('Card content records must be unique, excluding their IDs.')
  }

  return { valid: errors.length === 0, errors }
}

export function assertCardCatalogIntegrity(cards: readonly GameCard[]) {
  const integrity = validateCardCatalog(cards)
  if (!integrity.valid) throw new Error(integrity.errors.join('\n'))
}
