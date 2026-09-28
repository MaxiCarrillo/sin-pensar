import { ArrowRightOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Input, Tooltip } from 'antd'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'

import { Footer } from '@/modules/common'
import { MAX_NAME_LENGTH } from '@/shared/constants/setup'
import { useSetupStore } from '@/shared/store/setup.store'

import { AvatarSelector } from './components/avatar-selector/avatar-selector'
import { ContactDrawer } from './components/contact-drawer/contact-drawer'
import styles from './home.module.css'

function HomePage() {
  const navigate = useNavigate()
  const { avatar, savedNickname, initializeProfile, setAvatar } = useSetupStore(
    useShallow((state) => ({
      avatar: state.avatar,
      savedNickname: state.nickname,
      initializeProfile: state.initializeProfile,
      setAvatar: state.setAvatar,
    })),
  )
  const [nickname, setNickname] = useState(savedNickname)
  const [contactOpen, setContactOpen] = useState(false)
  const trimmedNickname = nickname.trim()
  const canPlay = trimmedNickname.length > 0

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canPlay) return

    initializeProfile(trimmedNickname)
    navigate('/players')
  }

  return (
    <div className={styles.page}>
      <Tooltip title="Contacto">
        <Button
          className={styles.contactButton}
          type="primary"
          shape="circle"
          size="large"
          icon={<MailOutlined />}
          aria-label="Abrir contacto"
          aria-haspopup="dialog"
          aria-expanded={contactOpen}
          onClick={() => setContactOpen(true)}
        />
      </Tooltip>

      <ContactDrawer open={contactOpen} onClose={() => setContactOpen(false)} />

      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="home-title">
          <header className={styles.hero}>
            <div className={styles.logoMark} aria-hidden="true"><span>?</span></div>
            <h1 id="home-title">SIN PENSAR</h1>
            <p>El juego ideal para tus juntadas. Entrá y jugá.</p>
          </header>

          <form className={styles.form} onSubmit={handleSubmit}>
            <AvatarSelector value={avatar} onChange={setAvatar} />

            <div className={styles.inputGroup}>
              <label htmlFor="nickname">Tu apodo</label>
              <Input
                className={styles.nicknameInput}
                id="nickname"
                name="nickname"
                size="large"
                value={nickname}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="nickname"
                placeholder="Escribí tu apodo"
                prefix={<UserOutlined />}
                aria-describedby="nickname-help"
                required
                onChange={(event) => setNickname(event.target.value)}
              />
              <span id="nickname-help" className={styles.inputHelp}>
                {nickname.length}/{MAX_NAME_LENGTH} caracteres
              </span>
            </div>

            <Button
              className={styles.playButton}
              type="primary"
              htmlType="submit"
              size="large"
              disabled={!canPlay}
              icon={<ArrowRightOutlined />}
              iconPosition="end"
            >
              Jugar
            </Button>
          </form>
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default HomePage
