import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import CaseView from './pages/CaseView'
import Dashboard from './pages/Dashboard'
import NewCase from './pages/NewCase'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cases/new" element={<NewCase />} />
        <Route path="/cases/:caseId" element={<CaseView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}