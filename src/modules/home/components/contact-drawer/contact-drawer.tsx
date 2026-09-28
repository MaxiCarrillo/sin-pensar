import { GithubFilled, GoogleOutlined, LinkedinFilled } from '@ant-design/icons'
import type { ReactNode } from 'react'

import { AppDrawer } from '@/modules/common'

import styles from './contact-drawer.module.css'

interface ContactDrawerProps {
  open: boolean
  onClose: () => void
}

interface ContactLink {
  title: string
  description: string
  href: string
  external: boolean
  icon: ReactNode
}

const contacts: ContactLink[] = [
  {
    title: 'Email',
    description: 'Envíame un correo',
    href: 'mailto:maxi11carrillo@gmail.com',
    external: false,
    icon: <GoogleOutlined />,
  },
  {
    title: 'GitHub',
    description: 'Mira mi código y mis proyectos',
    href: 'https://github.com/MaxiCarrillo',
    external: true,
    icon: <GithubFilled />,
  },
  {
    title: 'LinkedIn',
    description: 'Conectemos profesionalmente',
    href: 'https://www.linkedin.com/in/maximiliano-joaquin-carrillo/',
    external: true,
    icon: <LinkedinFilled />,
  },
]

export function ContactDrawer({ open, onClose }: ContactDrawerProps) {
  return (
    <AppDrawer open={open} title="Mis redes" closeLabel="Cerrar contacto" onClose={onClose}>
      <p className={styles.description}>Mira mis trabajos y envíame tus sugerencias.</p>
      <ul className={styles.links}>
        {contacts.map((contact) => (
          <li key={contact.title}>
            <a
              href={contact.href}
              target={contact.external ? '_blank' : undefined}
              rel={contact.external ? 'noopener noreferrer' : undefined}
            >
              <span>
                <strong>{contact.title}</strong>
                <small>{contact.description}</small>
              </span>
              <span className={styles.icon} aria-hidden="true">{contact.icon}</span>
            </a>
          </li>
        ))}
      </ul>
    </AppDrawer>
  )
}
