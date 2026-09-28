import { UserOutlined } from '@ant-design/icons'
import { Input, Tooltip } from 'antd'
import { useId, useState } from 'react'

import { avatarMap } from '@/assets/avatars'
import { AVATAR_OPTIONS } from '@/shared/constants/setup'
import type { AvatarId } from '@/shared/types/setup'

import { AppDrawer } from '../app-drawer/app-drawer'
import styles from './avatar-input.module.css'

interface AvatarInputProps {
  avatar: AvatarId
  nickname: string
  onAvatarChange: (avatar: AvatarId) => void
  onNicknameChange: (value: string) => void
  onNicknameBlur?: () => void
  nicknameStatus?: 'error' | 'warning'
  nicknameHelp?: string
  placeholder?: string
  maxLength?: number
  disabled?: boolean
}

const avatarShapeClasses = [styles.shape1, styles.shape2, styles.shape3, styles.shape4] as const

function getAvatarShapeClass(index: number) {
  return avatarShapeClasses[index % avatarShapeClasses.length] ?? styles.shape1
}

export function AvatarInput({
  avatar,
  nickname,
  onAvatarChange,
  onNicknameChange,
  onNicknameBlur,
  nicknameStatus,
  nicknameHelp,
  placeholder = 'Escribí tu apodo',
  maxLength = 16,
  disabled = false,
}: AvatarInputProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const helpId = useId()
  const matchedAvatarIndex = AVATAR_OPTIONS.findIndex((option) => option.id === avatar)
  const currentAvatarIndex = matchedAvatarIndex >= 0 ? matchedAvatarIndex : 0
  const currentAvatar = AVATAR_OPTIONS[currentAvatarIndex] ?? AVATAR_OPTIONS[0]

  const handleAvatarChange = (nextAvatar: AvatarId) => {
    onAvatarChange(nextAvatar)
    setDrawerOpen(false)
  }

  return (
    <div className={styles.container}>
      <Tooltip title="Cambiar avatar">
        <button
          className={styles.avatarButton}
          type="button"
          disabled={disabled}
          aria-label={`Cambiar avatar. Avatar actual: ${currentAvatar.label}`}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <span className={`${styles.avatar} ${getAvatarShapeClass(currentAvatarIndex)}`}>
            <img className={styles.avatarImage} src={avatarMap[currentAvatar.id]} alt="" />
          </span>
        </button>
      </Tooltip>

      <div className={styles.inputGroup}>
        <label className="visually-hidden" htmlFor="nickname">Tu apodo</label>
        <Input
          allowClear
          className={styles.nicknameInput}
          id="nickname"
          name="nickname"
          size="large"
          value={nickname}
          maxLength={maxLength}
          autoComplete="nickname"
          placeholder={placeholder}
          prefix={<UserOutlined />}
          showCount
          status={nicknameStatus}
          disabled={disabled}
          required
          aria-describedby={nicknameStatus === 'error' && nicknameHelp ? helpId : undefined}
          aria-invalid={nicknameStatus === 'error' ? true : undefined}
          onBlur={onNicknameBlur}
          onChange={(event) => onNicknameChange(event.target.value)}
        />
        {nicknameStatus === 'error' && nicknameHelp ? (
          <span id={helpId} className={`${styles.inputHelp} ${styles.inputError}`} role="alert">
            {nicknameHelp}
          </span>
        ) : null}
      </div>

      <AppDrawer
        open={drawerOpen}
        title="Elegí tu avatar"
        description="Seleccioná el avatar que te representará durante la partida."
        onClose={() => setDrawerOpen(false)}
      >
        <fieldset className={styles.fieldset} disabled={disabled}>
          <legend className="visually-hidden">Avatares disponibles</legend>
          <div className={styles.options}>
            {AVATAR_OPTIONS.map((option, index) => (
              <label className={styles.option} key={option.id}>
                <input
                  className={styles.radio}
                  type="radio"
                  name="avatar"
                  value={option.id}
                  checked={avatar === option.id}
                  onChange={() => handleAvatarChange(option.id)}
                />
                <span className={`${styles.avatar} ${getAvatarShapeClass(index)}`}>
                  <img className={styles.avatarImage} src={avatarMap[option.id]} alt="" />
                </span>
                <span className={styles.name}>{option.label}</span>
                <span className={styles.selection} aria-hidden="true">
                  {avatar === option.id ? '✓ Elegido' : 'Elegir'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </AppDrawer>
    </div>
  )
}
