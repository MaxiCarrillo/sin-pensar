import { CloseOutlined } from '@ant-design/icons'
import { Button, Drawer } from 'antd'
import type { ReactNode } from 'react'

import styles from './app-drawer.module.css'

interface AppDrawerProps {
  open: boolean
  title: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
}

export function AppDrawer({ open, title, closeLabel, onClose, children }: AppDrawerProps) {
  return (
    <Drawer
      classNames={{
        body: styles.body,
        header: styles.header,
        mask: styles.mask,
        section: styles.section,
        wrapper: styles.wrapper,
      }}
      closable={false}
      destroyOnHidden
      extra={(
        <Button
          className={styles.closeButton}
          type="text"
          shape="circle"
          icon={<CloseOutlined />}
          aria-label={closeLabel}
          onClick={onClose}
        />
      )}
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      mask={{ enabled: true, blur: true, closable: true }}
      open={open}
      placement="bottom"
      size="large"
      title={title}
      onClose={onClose}
    >
      {children}
    </Drawer>
  )
}
