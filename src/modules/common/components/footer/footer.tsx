import styles from './footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <span>V1.0</span>
      <span>
        Hecho con <span aria-label="amor">❤️</span> por{' '}
        <a href="https://maxicarrillo.github.io/" target="_blank" rel="noopener noreferrer">
          Maxdev
        </a>
      </span>
    </footer>
  )
}
