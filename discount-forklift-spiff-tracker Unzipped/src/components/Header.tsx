import React from 'react';
import { Truck, ShieldCheck, LogIn, LogOut, Database } from 'lucide-react';
import { DiscountForkliftLogo } from './DiscountForkliftLogo';

interface HeaderProps {
  currentView: 'rep' | 'admin';
  onNavigate: (view: 'rep' | 'admin') => void;
  adminUser: string | null;
  adminRole?: string | null;
  onAdminLoginClick: () => void;
  onAdminLogout: () => void;
  isNeonConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  adminUser,
  adminRole,
  onAdminLoginClick,
  onAdminLogout,
  isNeonConnected,
}) => {
  return (
    <header className="bg-[#1e1e1e] border-b border-[#383838] text-gray-100 sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Identity */}
          <div className="cursor-pointer group" onClick={() => onNavigate('rep')}>
            <DiscountForkliftLogo size="md" />
          </div>

          {/* Navigation & Admin Auth */}
          <div className="flex items-center space-x-3">
            {/* Database indicator */}
            <div className="hidden sm:flex items-center text-xs text-gray-300 space-x-1.5 px-2.5 py-1 rounded bg-[#292929] border border-[#444444]">
              <Database className={`w-3.5 h-3.5 ${isNeonConnected ? 'text-[#95EA00]' : 'text-amber-400'}`} />
              <span className="text-[11px] font-medium">
                {isNeonConnected ? 'Neon Connected' : 'Neon Preview Mode'}
              </span>
            </div>

            {/* View Switchers */}
            {adminUser ? (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => onNavigate('rep')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    currentView === 'rep'
                      ? 'bg-[#333333] text-white border border-[#525252]'
                      : 'text-gray-300 hover:text-white hover:bg-[#2d2d2d]'
                  }`}
                >
                  Rep Form
                </button>
                <button
                  onClick={() => onNavigate('admin')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    currentView === 'admin'
                      ? 'bg-[#A559BD] hover:bg-[#934da9] text-white shadow-sm'
                      : 'text-gray-300 hover:text-white hover:bg-[#2d2d2d]'
                  }`}
                >
                  Admin Ledger
                </button>

                <div className="hidden md:flex items-center pl-2 text-xs text-gray-300 border-l border-[#444444] space-x-2">
                  <span className="truncate max-w-[160px] text-gray-300 text-[11px] font-mono">{adminUser}</span>
                  {adminRole && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        adminRole === 'Approving Manager'
                          ? 'bg-[#A559BD]/20 text-purple-200 border-[#A559BD]/50'
                          : 'bg-[#95EA00]/15 text-[#95EA00] border-[#95EA00]/30'
                      }`}
                    >
                      {adminRole}
                    </span>
                  )}
                  <button
                    onClick={onAdminLogout}
                    title="Log out"
                    className="text-gray-400 hover:text-rose-400 p-1.5 rounded hover:bg-[#2d2d2d] transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <button
                  onClick={onAdminLoginClick}
                  className="inline-flex items-center space-x-1 text-xs text-gray-300 hover:text-[#95EA00] transition-colors px-3 py-1.5 rounded-lg border border-[#444444] bg-[#292929] hover:bg-[#333333]"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#95EA00]" />
                  <span>Admin Login</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
