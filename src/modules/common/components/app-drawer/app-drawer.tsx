import { Drawer, type DrawerProps } from 'antd'
import { useId, type ReactNode } from 'react'

import styles from './app-drawer.module.css'

interface AppDrawerProps {
  open: boolean
  title: string
  description: string
  contentClassName?: string
  size?: DrawerProps['size']
  onClose: () => void
  children: ReactNode
}

export function AppDrawer({
  open,
  title,
  description,
  contentClassName,
  size,
  onClose,
  children,
}: AppDrawerProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <Drawer
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      closable={false}
      destroyOnHidden
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      size={size}
      keyboard
      open={open}
      placement="bottom"
      onClose={onClose}
    >
      <div className={`${styles.content} ${contentClassName ?? ''}`}>
        <hgroup className={styles.drawerHeader}>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </hgroup>
        {children}
      </div>
    </Drawer>
  )
}
