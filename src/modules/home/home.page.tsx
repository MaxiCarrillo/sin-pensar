import { MailOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'

import { AvatarInput, Footer } from '@/modules/common'
import { MAX_NAME_LENGTH } from '@/shared/constants/setup'
import { useSetupStore } from '@/shared/store/setup.store'

import { ContactDrawer } from './components/contact-drawer/contact-drawer'
import styles from './home.module.css'

function HomePage() {
  const navigate = useNavigate()
  const { avatar, nickname, initializeProfile, setAvatar, setNickname } = useSetupStore(
    useShallow((state) => ({
      avatar: state.avatar,
      nickname: state.nickname,
      initializeProfile: state.initializeProfile,
      setAvatar: state.setAvatar,
      setNickname: state.setNickname,
    })),
  )
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

      <main className={styles.homeContainer}>
        <section className={styles.homeSection} aria-labelledby="home-title">
          <div className={styles.logoMark} aria-hidden="true">
            <span>?</span>
          </div>
          <hgroup>
            <h1 id="home-title">Sin Pensar</h1>
            <p>El juego ideal para tus juntadas. Entrá y jugá.</p>
          </hgroup>

          <form className={styles.form} onSubmit={handleSubmit}>
            <AvatarInput
              avatar={avatar}
              nickname={nickname}
              onAvatarChange={setAvatar}
              onNicknameChange={setNickname}
              maxLength={MAX_NAME_LENGTH}
            />

            <Button
              className={styles.playButton}
              type="primary"
              htmlType="submit"
              size="large"
              disabled={!canPlay}
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
