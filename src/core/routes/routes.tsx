import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import HomePage from '@/modules/home/home.page'
import PlayersPage from '@/modules/players/players.page'

function RoutesProvider() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default RoutesProvider
