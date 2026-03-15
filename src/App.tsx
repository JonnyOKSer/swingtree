import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import GatedEntrance from './pages/GatedEntrance'
import MainMenu from './pages/MainMenu'
import Predict from './pages/Predict'
import Results from './pages/Results'
import Pedigree from './pages/Pedigree'
import Admin from './pages/Admin'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<GatedEntrance />} />
          <Route path="/main" element={<MainMenu />} />
          <Route path="/predict" element={<Predict />} />
          <Route path="/results" element={<Results />} />
          <Route path="/pedigree" element={<Pedigree />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
