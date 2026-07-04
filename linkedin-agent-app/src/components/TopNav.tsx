'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Linkedin, Sun, Moon, CheckCheck, Trash2, X, BarChart3, LayoutDashboard } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/context/NotificationContext';
import type { AppPage } from '@/app/page';

const TopNav = ({ activePage, onNavigate }: { activePage: AppPage; onNavigate: (p: AppPage) => void }) => {
  const { theme, toggleTheme } = useTheme();
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Recompute panel position whenever it opens
  const openPanel = useCallback(() => {
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + 8,                        // 8px gap below the button
        right: window.innerWidth - rect.right,       // flush-right with button
      });
    }
    setShowNotifications(true);
  }, []);

  const closePanel = useCallback(() => setShowNotifications(false), []);

  const handleBellClick = () => {
    if (showNotifications) {
      closePanel();
    } else {
      openPanel();
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!showNotifications) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node)
      ) {
        closePanel();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifications, closePanel]);

  const typeDot: Record<string, string> = {
    success: 'bg-emerald-500',
    info: 'bg-blue-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  };
  const typeBg: Record<string, string> = {
    success: 'rgba(16,185,129,0.12)',
    info: 'rgba(59,130,246,0.12)',
    warning: 'rgba(245,158,11,0.12)',
    error: 'rgba(239,68,68,0.12)',
  };
  const typeColor: Record<string, string> = {
    success: '#10b981',
    info: '#3b82f6',
    warning: '#f59e0b',
    error: '#ef4444',
  };

  const formatTime = (date: Date) => {
    const m = Math.round((Date.now() - date.getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    return `${Math.round(m / 60)}h ago`;
  };

  return (
    <>
      {/* ── Navigation Bar ── */}
      <nav
        className="flex items-center justify-between px-5 py-3 mb-6 rounded-2xl"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          boxShadow: '0 1px 12px rgba(0,0,0,0.06)',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 mr-8 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-crex-blue to-blue-700 flex items-center justify-center shadow-md">
            <Linkedin className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>
            AI Publisher
          </span>
        </div>

        {/* Nav Links */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto custom-scrollbar mr-4 pb-1 md:pb-0">
          {[
            { id: 'dashboard' as AppPage, label: 'Dashboard', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
            { id: 'analytics' as AppPage, label: 'Analytics & AI', icon: <BarChart3 className="w-3.5 h-3.5" /> },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                activePage === item.id
                  ? 'bg-crex-blue text-white shadow-sm shadow-blue-300/40'
                  : 'hover:opacity-80'
              }`}
              style={activePage !== item.id ? { color: 'var(--text-muted)' } : {}}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 hover:opacity-80"
            style={{
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              color: 'var(--text-muted)',
            }}
          >
            {theme === 'light'
              ? <Moon className="w-3.5 h-3.5" />
              : <Sun className="w-3.5 h-3.5 text-yellow-400" />
            }
            <span className="text-xs">{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>

          {/* Bell */}
          <button
            ref={bellRef}
            onClick={handleBellClick}
            className="relative p-2.5 rounded-xl transition-all duration-150 hover:opacity-80"
            style={{
              background: showNotifications ? '#1668e8' : 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              color: showNotifications ? 'white' : 'var(--text-muted)',
            }}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[17px] h-[17px] bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center px-0.5 border-2"
                style={{ borderColor: 'var(--card-bg)' }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* ── Notification Panel (fixed, tracks bell button position) ── */}
      {showNotifications && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[9999] w-[360px] rounded-2xl overflow-hidden"
          style={{
            top: panelPos.top,
            right: panelPos.right,
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.16), 0 4px 16px rgba(0,0,0,0.08)',
          }}
        >
          {/* Panel Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--card-border)' }}
          >
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-crex-blue" />
              <span className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-crex-blue/10 text-crex-blue text-[10px] font-bold rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <IconBtn onClick={markAllRead} title="Mark all read"><CheckCheck className="w-3.5 h-3.5" /></IconBtn>
              <IconBtn onClick={clearAll} title="Clear all" danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
              <IconBtn onClick={closePanel} title="Close"><X className="w-3.5 h-3.5" /></IconBtn>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-72 overflow-y-auto custom-scrollbar divide-y" style={{ borderColor: 'var(--card-border)' }}>
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--input-bg)' }}>
                  <Bell className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>All caught up!</span>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className="flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-opacity hover:opacity-75"
                  style={{ background: n.read ? 'transparent' : 'var(--input-bg)' }}
                >
                  {/* Icon badge */}
                  <div
                    className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{ background: typeBg[n.type] }}
                  >
                    <div className={`w-2 h-2 rounded-full ${typeDot[n.type]}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-xs font-semibold truncate" style={{ color: typeColor[n.type] }}>
                        {n.title}
                      </span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {formatTime(n.timestamp)}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {n.message}
                    </p>
                  </div>

                  {!n.read && (
                    <div className="w-1.5 h-1.5 bg-crex-blue rounded-full flex-shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div
              className="px-4 py-2.5 border-t"
              style={{ borderColor: 'var(--card-border)', background: 'var(--input-bg)' }}
            >
              <button
                onClick={markAllRead}
                className="text-xs font-semibold text-crex-blue hover:underline"
              >
                Mark all as read
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

const IconBtn = ({
  onClick, title, danger = false, children
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded-lg transition-colors ${
      danger ? 'hover:bg-red-50 hover:text-red-500' : 'hover:bg-gray-100'
    }`}
    style={{ color: 'var(--text-muted)' }}
  >
    {children}
  </button>
);

export default TopNav;
