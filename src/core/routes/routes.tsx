import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import CardsPage from '@/modules/cards/cards.page'
import HomePage from '@/modules/home/home.page'
import PlayersPage from '@/modules/players/players.page'
import TeamsPage from '@/modules/teams/teams.page'

function RoutesProvider() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/teams" element={<TeamsPage />} />
        <Route path="/cards" element={<CardsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default RoutesProvider
