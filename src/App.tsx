import { Navigate, Route, Routes } from 'react-router-dom'
import Library from './screens/Library'
import Player from './screens/Player'
import Import from './screens/Import'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Library />} />
      <Route path="/play/:id" element={<Player />} />
      <Route path="/import" element={<Import />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
