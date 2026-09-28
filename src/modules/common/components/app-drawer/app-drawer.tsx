import { Drawer } from 'antd'
import { useId, type ReactNode } from 'react'

import styles from './app-drawer.module.css'

interface AppDrawerProps {
  open: boolean
  title: string
  description: string
  onClose: () => void
  children: ReactNode
}

export function AppDrawer({ open, title, description, onClose, children }: AppDrawerProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <Drawer
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      closable={false}
      destroyOnHidden
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      keyboard
      open={open}
      placement="bottom"
      onClose={onClose}
    >
      <div className={styles.content}>
        <hgroup className={styles.drawerHeader}>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </hgroup>
        {children}
      </div>
    </Drawer>
  )
}
