import { BrowserRouter, Routes, Route } from 'react-router-dom'
import GatedEntrance from './pages/GatedEntrance'
import MainMenu from './pages/MainMenu'
import Predict from './pages/Predict'
import Results from './pages/Results'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GatedEntrance />} />
        <Route path="/main" element={<MainMenu />} />
        <Route path="/predict" element={<Predict />} />
        <Route path="/results" element={<Results />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
