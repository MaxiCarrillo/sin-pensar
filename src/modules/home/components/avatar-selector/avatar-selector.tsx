import { AVATAR_OPTIONS } from '@/shared/constants/setup'
import type { AvatarId } from '@/shared/types/setup'

import styles from './avatar-selector.module.css'

interface AvatarSelectorProps {
  value: AvatarId
  onChange: (avatar: AvatarId) => void
}

export function AvatarSelector({ value, onChange }: AvatarSelectorProps) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>Elegí tu avatar</legend>
      <div className={styles.options}>
        {AVATAR_OPTIONS.map((avatar, index) => (
          <label className={styles.option} key={avatar.id}>
            <input
              className={styles.radio}
              type="radio"
              name="avatar"
              value={avatar.id}
              checked={value === avatar.id}
              onChange={() => onChange(avatar.id)}
            />
            <span className={`${styles.avatar} ${styles[`avatar${index + 1}`]}`} aria-hidden="true">
              {avatar.symbol}
            </span>
            <span className={styles.name}>{avatar.label}</span>
            <span className={styles.selection} aria-hidden="true">
              {value === avatar.id ? '✓ Elegido' : 'Elegir'}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
