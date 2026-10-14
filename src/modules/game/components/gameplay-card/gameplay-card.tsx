import { Button } from 'antd';
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

import type { CardId, GameCard } from '@/shared/types/card-draft';
import type { GameplayTransitionResult } from '@/shared/types/gameplay';

import { getKeyboardDecision, getSwipeDecision, type SwipeDecision } from '../../swipe';
import styles from './gameplay-card.module.css';

interface GameplayCardProps {
    card: GameCard;
    disabled?: boolean;
    onDecision: (decision: SwipeDecision, cardId: CardId, decidedAt: number) => GameplayTransitionResult;
    onDecisionAnimationComplete?: (decision: SwipeDecision, cardId: CardId) => void;
}

type DecisionOrigin = 'pointer' | 'button' | 'keyboard';

interface DragPosition {
    x: number;
    y: number;
}

interface GameplayCardVisual {
    readonly id: CardId;
    readonly title: Readonly<GameCard['title']>;
    readonly character: Readonly<GameCard['character']>;
    readonly everything: Readonly<GameCard['everything']>;
    readonly keyword: string;
}

interface OutgoingCardSnapshot {
    readonly card: GameplayCardVisual;
    readonly decidedAt: number;
    readonly decision: SwipeDecision;
    readonly decisionOrigin: DecisionOrigin;
    readonly origin: Readonly<DragPosition>;
}

interface ActivePointer {
    id: number;
    startX: number;
    startY: number;
}

const POINTER_DECISION_ANIMATION_MS = 180;
const CONTROL_DECISION_ANIMATION_MS = 320;
const RESTING_POSITION: DragPosition = { x: 0, y: 0 };

function getCardRotation(x: number) {
    return Math.max(-8, Math.min(8, x / 24));
}

function getCardOpacity(y: number) {
    return Math.max(0.18, 1 - Math.abs(y) / 520);
}

function createOutgoingCardSnapshot(
    card: GameCard,
    decision: SwipeDecision,
    decisionOrigin: DecisionOrigin,
    origin: DragPosition,
    decidedAt: number,
): OutgoingCardSnapshot {
    return {
        card: {
            id: card.id,
            title: { ...card.title },
            character: { ...card.character },
            everything: { ...card.everything },
            keyword: card.keyword,
        },
        decidedAt,
        decision,
        decisionOrigin,
        origin: { ...origin },
    };
}

function GameplayCardContents({ card }: { card: GameplayCardVisual }) {
    return (
        <>
            <span className={styles.cardCap} aria-hidden="true" />
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
        </>
    );
}

export function GameplayCard({
    card,
    disabled = false,
    onDecision,
    onDecisionAnimationComplete,
}: GameplayCardProps) {
    const instructionId = useId();
    const cardRef = useRef<HTMLElement>(null);
    const activePointerRef = useRef<ActivePointer | null>(null);
    const resolvingRef = useRef(false);
    const animationTimerRef = useRef<number | null>(null);
    const [dragPosition, setDragPosition] = useState<DragPosition>(RESTING_POSITION);
    const [isDragging, setIsDragging] = useState(false);
    const [isResolving, setIsResolving] = useState(false);
    const [outgoingCard, setOutgoingCard] = useState<OutgoingCardSnapshot | null>(null);

    useEffect(() => {
        return () => {
            if (animationTimerRef.current !== null) window.clearTimeout(animationTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!disabled && !isResolving) cardRef.current?.focus();
    }, [card.id, disabled, isResolving]);

    const completeDecision = (decision: SwipeDecision | null, cardId: CardId) => {
        if (!resolvingRef.current) return;
        if (animationTimerRef.current !== null) {
            window.clearTimeout(animationTimerRef.current);
            animationTimerRef.current = null;
        }
        activePointerRef.current = null;
        resolvingRef.current = false;
        setIsResolving(false);
        setOutgoingCard(null);
        if (decision) onDecisionAnimationComplete?.(decision, cardId);
    };

    const commitDecision = (
        decision: SwipeDecision,
        decisionOrigin: DecisionOrigin,
        origin: DragPosition,
    ) => {
        if (disabled || resolvingRef.current) return;
        resolvingRef.current = true;
        const decidedAt = Date.now();
        setOutgoingCard(createOutgoingCardSnapshot(card, decision, decisionOrigin, origin, decidedAt));
        setIsResolving(true);
        setIsDragging(false);
        setDragPosition(RESTING_POSITION);
        const result = onDecision(decision, card.id, decidedAt);
        if (result.kind === 'rejected') {
            completeDecision(null, card.id);
            return;
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            completeDecision(decision, card.id);
            return;
        }

        const animationDuration =
            decisionOrigin === 'pointer'
                ? POINTER_DECISION_ANIMATION_MS
                : CONTROL_DECISION_ANIMATION_MS;
        animationTimerRef.current = window.setTimeout(
            () => completeDecision(decision, card.id),
            animationDuration,
        );
    };

    const releasePointer = (event: PointerEvent<HTMLElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
        if (disabled || resolvingRef.current || !event.isPrimary || event.button !== 0) {
            return;
        }
        activePointerRef.current = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
        };
        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
        const activePointer = activePointerRef.current;
        if (!activePointer || activePointer.id !== event.pointerId || resolvingRef.current) return;
        setDragPosition({
            x: event.clientX - activePointer.startX,
            y: event.clientY - activePointer.startY,
        });
    };

    const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
        const activePointer = activePointerRef.current;
        if (!activePointer || activePointer.id !== event.pointerId || resolvingRef.current) return;
        const decision = getSwipeDecision(event.clientX - activePointer.startX, event.clientY - activePointer.startY);
        activePointerRef.current = null;
        setIsDragging(false);
        releasePointer(event);
        if (decision) {
            commitDecision(decision, 'pointer', {
                x: event.clientX - activePointer.startX,
                y: event.clientY - activePointer.startY,
            });
            return;
        }
        setDragPosition(RESTING_POSITION);
    };

    const handlePointerCancel = (event: PointerEvent<HTMLElement>) => {
        if (activePointerRef.current?.id !== event.pointerId || resolvingRef.current) return;
        activePointerRef.current = null;
        setIsDragging(false);
        releasePointer(event);
        setDragPosition(RESTING_POSITION);
    };

    const handleLostPointerCapture = (event: PointerEvent<HTMLElement>) => {
        if (activePointerRef.current?.id !== event.pointerId || resolvingRef.current) return;
        activePointerRef.current = null;
        setIsDragging(false);
        setDragPosition(RESTING_POSITION);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const decision = getKeyboardDecision(event.key, event.repeat);
        if (decision) commitDecision(decision, 'keyboard', RESTING_POSITION);
    };

    const cardStyle = {
        '--card-translate-x': `${dragPosition.x}px`,
        '--card-translate-y': `${dragPosition.y}px`,
        '--card-rotation': `${getCardRotation(dragPosition.x)}deg`,
        '--card-opacity': `${getCardOpacity(dragPosition.y)}`,
    } as CSSProperties;
    const outgoingCardStyle = outgoingCard
        ? ({
              '--outgoing-card-opacity': `${getCardOpacity(outgoingCard.origin.y)}`,
              '--outgoing-card-rotation': `${getCardRotation(outgoingCard.origin.x)}deg`,
              '--outgoing-card-x': `${outgoingCard.origin.x}px`,
              '--outgoing-card-y': `${outgoingCard.origin.y}px`,
          } as CSSProperties)
        : undefined;

    return (
        <div className={styles.interaction}>
            <p id={instructionId} className={styles.instruction}>
                Deslizá hacia abajo para acertar o hacia arriba para pasar.
            </p>
            <div className={styles.cardStack}>
                <article
                    ref={cardRef}
                    className={`${styles.card} ${isDragging ? styles.dragging : ''} ${isResolving || disabled ? styles.locked : ''}`}
                    style={cardStyle}
                    tabIndex={isResolving || disabled ? -1 : 0}
                    aria-disabled={isResolving || disabled}
                    aria-label={`${card.title.value}, ${card.character.value}, ${card.everything.value}, palabra clave ${card.keyword}`}
                    aria-describedby={instructionId}
                    aria-keyshortcuts="ArrowDown ArrowUp"
                    onKeyDown={handleKeyDown}
                    onLostPointerCapture={handleLostPointerCapture}
                    onPointerCancel={handlePointerCancel}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    <GameplayCardContents card={card} />
                </article>
                {outgoingCard ? (
                    <article
                        key={`${outgoingCard.card.id}-${outgoingCard.decidedAt}`}
                        className={`${styles.card} ${styles.outgoingCard} ${
                            outgoingCard.decision === 'correct' ? styles.outgoingCorrect : styles.outgoingPass
                        } ${
                            outgoingCard.decisionOrigin === 'pointer' ? '' : styles.outgoingControlOrigin
                        }`}
                        style={outgoingCardStyle}
                        aria-hidden="true"
                    >
                        <GameplayCardContents card={outgoingCard.card} />
                    </article>
                ) : null}
            </div>
            <div className={styles.actions} aria-label="Acciones de la carta">
                <Button
                    className={styles.passButton}
                    size="large"
                    disabled={isResolving || disabled}
                    aria-keyshortcuts="ArrowUp"
                    onClick={() => commitDecision('pass', 'button', RESTING_POSITION)}
                >
                    ↑ Pasar
                </Button>
                <Button
                    className={styles.correctButton}
                    type="primary"
                    size="large"
                    disabled={isResolving || disabled}
                    aria-keyshortcuts="ArrowDown"
                    onClick={() => commitDecision('correct', 'button', RESTING_POSITION)}
                >
                    ↓ Acertó
                </Button>
            </div>
        </div>
    );
}
