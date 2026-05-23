import { Routes, Route, Navigate } from 'react-router-dom';
import MapPage from './pages/MapPage';
import DashboardPage from './pages/DashboardPage';
import AlertsPage from './pages/AlertsPage';
import AboutPage from './pages/AboutPage';
import HelpPage from './pages/HelpPage';
import AppShell from './components/AppShell';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/peta" replace />} />
        <Route path="/peta" element={<MapPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/:kabupatenId" element={<DashboardPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/panduan" element={<HelpPage />} />
        <Route path="/tentang" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/peta" replace />} />
      </Routes>
    </AppShell>
  );
}
