import { Button, Carousel, type CarouselRef } from 'antd'
import { useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { AppDrawer } from '@/modules/common'
import { CARD_DEAL_SIZE } from '@/shared/constants/card-draft'
import type { MainDeckCardCount } from '@/shared/constants/setup'

import { createHelpSteps, type HelpStep } from './help-drawer-content'
import styles from './help-drawer.module.css'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

interface HelpDrawerProps {
  mainDeckCardCount: MainDeckCardCount
  open: boolean
  onClose: () => void
}

function subscribeToReducedMotion(onChange: () => void) {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
  mediaQuery.addEventListener('change', onChange)
  return () => mediaQuery.removeEventListener('change', onChange)
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  )
}

function HelpSlide({
  step,
  index,
  total,
  isCurrent,
}: {
  step: HelpStep
  index: number
  total: number
  isCurrent: boolean
}) {
  return (
    <section
      className={styles.slide}
      role="group"
      aria-roledescription="diapositiva"
      aria-label={`Paso ${index + 1} de ${total}: ${step.title}`}
      tabIndex={isCurrent ? 0 : -1}
    >
      <h3>{step.title}</h3>
      <p className={styles.introduction}>{step.introduction}</p>
      <div className={styles.sections}>
        {step.sections.map((section, sectionIndex) => (
          <div className={styles.section} key={`${step.id}-${sectionIndex}`}>
            {section.label ? <h4>{section.label}</h4> : null}
            {section.text ? <p>{section.text}</p> : null}
            {section.items ? (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

export function HelpDrawer({ mainDeckCardCount, open, onClose }: HelpDrawerProps) {
  const steps = useMemo(
    () => createHelpSteps(mainDeckCardCount, CARD_DEAL_SIZE),
    [mainDeckCardCount],
  )
  const carouselRef = useRef<CarouselRef>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const prefersReducedMotion = usePrefersReducedMotion()
  const isLastStep = currentStep === steps.length - 1

  const handleClose = () => {
    carouselRef.current?.goTo(0, true)
    setCurrentStep(0)
    onClose()
  }

  return (
    <AppDrawer
      open={open}
      title="Ayuda"
      description="Aprendé a preparar la partida y qué cambia en cada ronda."
      contentClassName={styles.drawerContent}
      size="min(42rem, 90dvh)"
      onClose={handleClose}
    >
      <div className={styles.helpLayout}>
        <div className={styles.progress}>
          <p aria-live="polite" aria-atomic="true">
            Paso {currentStep + 1} de {steps.length}
          </p>
          <ol className={styles.stepIndicator} aria-label="Progreso de la ayuda">
            {steps.map((step, index) => (
              <li
                key={step.id}
                aria-current={index === currentStep ? 'step' : undefined}
                aria-label={`Paso ${index + 1}: ${step.title}${index === currentStep ? ', actual' : ''}`}
              >
                {index + 1}
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.carouselRegion}>
          <Carousel
            ref={carouselRef}
            className={styles.carousel}
            dots={false}
            infinite={false}
            speed={prefersReducedMotion ? 0 : 300}
            waitForAnimate
            afterChange={setCurrentStep}
          >
            {steps.map((step, index) => (
              <HelpSlide
                key={step.id}
                step={step}
                index={index}
                total={steps.length}
                isCurrent={index === currentStep}
              />
            ))}
          </Carousel>
        </div>

        <footer className={styles.actions} aria-label="Navegación de la ayuda">
          <Button
            size="large"
            disabled={currentStep === 0}
            aria-label="Ir al paso anterior"
            onClick={() => carouselRef.current?.prev()}
          >
            Anterior
          </Button>
          <Button
            type="primary"
            size="large"
            aria-label={isLastStep ? 'Cerrar la ayuda' : 'Ir al paso siguiente'}
            onClick={isLastStep ? handleClose : () => carouselRef.current?.next()}
          >
            {isLastStep ? 'Entendido' : 'Siguiente'}
          </Button>
        </footer>
      </div>
    </AppDrawer>
  )
}
