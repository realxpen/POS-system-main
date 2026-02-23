import { Routes, Route, Navigate } from 'react-router-dom';
import { ReactElement } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Inventory from './pages/Inventory';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

function RoleRoute({ roles, children }: { roles: Array<'admin' | 'manager' | 'attendant'>; children: ReactElement }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sales" element={<Sales />} />
          <Route
            path="/inventory"
            element={<RoleRoute roles={['admin', 'manager']}><Inventory /></RoleRoute>}
          />
          <Route
            path="/expenses"
            element={<RoleRoute roles={['admin', 'manager']}><Expenses /></RoleRoute>}
          />
          <Route
            path="/reports"
            element={<RoleRoute roles={['admin', 'manager']}><Reports /></RoleRoute>}
          />
          <Route
            path="/settings"
            element={<RoleRoute roles={['admin']}><Settings /></RoleRoute>}
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
