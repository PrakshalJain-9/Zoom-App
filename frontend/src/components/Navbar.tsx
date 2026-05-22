import React from 'react';
import { Search, Grid, Settings, MessageSquare, Video, Calendar, Phone, Users, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-4 py-2 border-b border-zoom-border bg-white sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-zoom-blue font-bold text-2xl tracking-tight">
          Zoom<span className="text-zoom-text font-medium text-lg ml-1">Clone</span>
        </Link>
        
        <div className="hidden md:flex items-center space-x-1">
          <NavItem icon={<Video size={18} />} label="Home" active />
          <NavItem icon={<MessageSquare size={18} />} label="Team Chat" />
          <NavItem icon={<Calendar size={18} />} label="Meetings" />
          <NavItem icon={<Users size={18} />} label="Contacts" />
          <NavItem icon={<MoreHorizontal size={18} />} label="More" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative hidden lg:flex items-center">
          <Search className="absolute left-2.5 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Search" 
            className="pl-9 pr-4 py-1.5 bg-gray-100 border-transparent rounded-full text-sm focus:bg-white focus:border-zoom-blue focus:ring-1 focus:ring-zoom-blue outline-none transition-all w-64"
          />
        </div>

        <div className="flex items-center gap-3">
          <button className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors">
            <Settings size={20} />
          </button>
          
          <button className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-zoom-blue font-semibold text-sm hover:ring-2 hover:ring-offset-1 hover:ring-zoom-blue transition-all">
            PJ
          </button>
        </div>
      </div>
    </nav>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <button className={`flex flex-col items-center justify-center px-4 py-1 rounded-md transition-colors ${active ? 'text-zoom-blue' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}>
      <div className="mb-0.5">{icon}</div>
      <span className="text-[10px] font-semibold">{label}</span>
    </button>
  );
}
