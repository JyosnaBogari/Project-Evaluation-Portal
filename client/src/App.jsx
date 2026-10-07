import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import useAuth from './hooks/useAuth';

// Layout Imports
import AuthLayout from './layouts/AuthLayout';
import DashboardLayout from './layouts/DashboardLayout';
import ProtectedRoute from './layouts/ProtectedRoute';

// Page Imports
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import StudentDashboard from './pages/student/Dashboard';
import SubmitProject from './pages/student/SubmitProject';
import FacultyDashboard from './pages/faculty/Dashboard';
import AdminDashboard from './pages/admin/Dashboard';
import ManageUsers from './pages/admin/ManageUsers';
import ManageDeadlines from './pages/admin/ManageDeadlines';
import InvitationPage from './pages/student/InvitationPage';

// Dispatcher Component for Root Route based on role
const DashboardDispatcher = () => {
  const { user } = useAuth();
  if (user?.role === 'student') return <StudentDashboard />;
  if (user?.role === 'faculty') return <FacultyDashboard />;
  if (user?.role === 'admin') return <AdminDashboard />;
  return null;
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Guest/Auth Routes */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>

            {/* Public invitation route for email links */}
            <Route path="/team-invitations/:token" element={<InvitationPage />} />

            {/* Authenticated Dashboard Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              {/* Root route loads matching dashboard dynamically */}
              <Route index element={<DashboardDispatcher />} />
              
              {/* Student Only Paths */}
              <Route
                path="submit"
                element={
                  <ProtectedRoute allowedRoles={['student']}>
                    <SubmitProject />
                  </ProtectedRoute>
                }
              />

              {/* Admin Only Paths */}
              <Route
                path="users"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <ManageUsers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="deadlines"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <ManageDeadlines />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Catch-all Redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
