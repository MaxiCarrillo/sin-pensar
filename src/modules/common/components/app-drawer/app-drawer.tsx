import { Drawer, type DrawerProps } from 'antd'
import { useId, type ReactNode } from 'react'

import styles from './app-drawer.module.css'

interface AppDrawerProps {
  open: boolean
  title: string
  description?: string
  contentClassName?: string
  visuallyHiddenTitle?: boolean
  size?: DrawerProps['size']
  onClose: () => void
  children: ReactNode
}

export function AppDrawer({
  open,
  title,
  description,
  contentClassName,
  visuallyHiddenTitle = false,
  size,
  onClose,
  children,
}: AppDrawerProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <Drawer
      aria-describedby={description ? descriptionId : undefined}
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
        {visuallyHiddenTitle ? (
          <h2 className="visually-hidden" id={titleId}>
            {title}
          </h2>
        ) : (
          <hgroup className={styles.drawerHeader}>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </hgroup>
        )}
        {children}
      </div>
    </Drawer>
  )
}
