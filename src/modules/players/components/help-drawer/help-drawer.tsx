import {
  AimOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  FolderOpenOutlined,
  MessageOutlined,
  SoundOutlined,
  StopOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Carousel, ConfigProvider, theme, type CarouselRef } from 'antd'
import { useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { AppDrawer } from '@/modules/common'
import { CARD_DEAL_SIZE } from '@/shared/constants/card-draft'
import type { MainDeckCardCount } from '@/shared/constants/setup'

import {
  createHelpSteps,
  type HelpIconKey,
  type HelpStep,
} from './help-drawer-content'
import styles from './help-drawer.module.css'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const HELP_ICONS = {
  category: AppstoreOutlined,
  decks: FolderOpenOutlined,
  lightning: ThunderboltOutlined,
  objective: AimOutlined,
  'round-one': SoundOutlined,
  'round-three': StopOutlined,
  'round-two': MessageOutlined,
  summary: CheckCircleOutlined,
  teams: TeamOutlined,
} satisfies Record<HelpIconKey, typeof AimOutlined>

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
  const StepIcon = HELP_ICONS[step.icon]

  return (
    <section
      className={styles.slide}
      data-accent={step.accent}
      role="group"
      aria-roledescription="diapositiva"
      aria-label={`Paso ${index + 1} de ${total}: ${step.title}`}
      tabIndex={isCurrent ? 0 : -1}
    >
      <div className={styles.slideContent}>
        <hgroup className={styles.slideHeader}>
          <h3>{step.title}</h3>
          <p>{step.introduction}</p>
        </hgroup>
        <div className={styles.visual} aria-hidden="true">
          <StepIcon />
        </div>
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
      </div>
    </section>
  )
}

export function HelpDrawer({ mainDeckCardCount, open, onClose }: HelpDrawerProps) {
  const { token } = theme.useToken()
  const steps = useMemo(
    () => createHelpSteps(mainDeckCardCount, CARD_DEAL_SIZE),
    [mainDeckCardCount],
  )
  const carouselTheme = useMemo(
    () => ({ components: { Carousel: { colorBgContainer: token.colorPrimary } } }),
    [token.colorPrimary],
  )
  const carouselRef = useRef<CarouselRef>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const prefersReducedMotion = usePrefersReducedMotion()

  const handleClose = () => {
    carouselRef.current?.goTo(0, true)
    setCurrentStep(0)
    onClose()
  }

  return (
    <AppDrawer
      open={open}
      title="Ayuda"
      contentClassName={styles.drawerContent}
      visuallyHiddenTitle
      size="min(42rem, 90dvh)"
      onClose={handleClose}
    >
      <div className={styles.helpLayout}>
        <ConfigProvider theme={carouselTheme}>
          <Carousel
            arrows
            infinite={false}
            className={styles.carousel}
            rootClassName={styles.carouselRoot}
            ref={carouselRef}
            speed={prefersReducedMotion ? 0 : 300}
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
        </ConfigProvider>
      </div>
    </AppDrawer>
  )
}
