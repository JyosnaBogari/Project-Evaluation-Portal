import React, { useState } from 'react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import {
  LayoutDashboard,
  UploadCloud,
  Users,
  Calendar,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  FileCheck
} from 'lucide-react';

export default function DashboardLayout() {
  const { user, logoutUser, isStudent, isFaculty, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logoutUser();
    navigate('/login');
  };

  const getNavigationLinks = () => {
    const links = [];
    if (isStudent) {
      links.push(
        { path: '/', label: 'Overview', icon: LayoutDashboard },
        { path: '/submit', label: 'Submit Project', icon: UploadCloud }
      );
    } else if (isFaculty) {
      links.push(
        { path: '/', label: 'Review Queue', icon: FileCheck }
      );
    } else if (isAdmin) {
      links.push(
        { path: '/', label: 'System Analytics', icon: LayoutDashboard },
        { path: '/users', label: 'Manage Users', icon: Users },
        { path: '/deadlines', label: 'Manage Deadlines', icon: Calendar }
      );
    }
    return links;
  };

  const navigation = getNavigationLinks();

  return (
    <div className="min-h-screen flex bg-[var(--bg-app)] text-[var(--text-primary)]">
      {/* Desktop Sidebar (Left Panel) */}
      <aside className="hidden md:flex md:flex-col md:w-64 glass-panel border-r border-slate-200 dark:border-slate-900 shrink-0">
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-900">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md">
              P
            </div>
            <span className="font-bold tracking-tight text-lg bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
              EvalPortal
            </span>
          </div>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                    : 'text-[var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-900'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer Area */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-900">
          <button
            onClick={handleLogout}
            className="flex items-center w-full gap-3 px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-500/5 hover:text-red-400 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Logout Session
          </button>
        </div>
      </aside>

      {/* Mobile Drawer (Overlay) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-black/50 backdrop-blur-sm">
          <div className="w-64 glass-panel flex flex-col h-full animate-in slide-in-from-left duration-200">
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-900">
              <span className="font-bold">EvalPortal</span>
              <button onClick={() => setMobileOpen(false)} className="p-1 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>
            <nav className="flex-1 px-4 py-6 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-[var(--text-secondary)] hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-900">
              <button
                onClick={handleLogout}
                className="flex items-center w-full gap-3 px-4 py-3 text-sm font-medium text-red-500 rounded-xl transition-all"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-900 glass-panel shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1 rounded-lg md:hidden hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="hidden md:block">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Welcome back, <strong className="text-[var(--text-primary)]">{user?.name}</strong>
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-900 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all"
              aria-label="Toggle Theme"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4 text-slate-700" />
              ) : (
                <Sun className="w-4 h-4 text-yellow-400" />
              )}
            </button>

            {/* Profile indicator */}
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-900">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold">{user?.name}</p>
                <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                  {user?.role}
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center font-bold text-blue-500 select-none">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        {/* Content Panel Area */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
