"use client";

import React, { useState, useEffect } from "react";
import JoinMeetingModal from "@/components/JoinMeetingModal";
import ScheduleMeetingModal from "@/components/ScheduleMeetingModal";
import UpcomingMeetings from "@/components/UpcomingMeetings";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { createMeeting } from "@/lib/api";
import {
  Video, Plus, Calendar, Home, MessageSquare,
  Users, Settings, Search, Clock, ChevronLeft,
  ChevronRight, FileText, Monitor, Star, Bell, Upload,
  MoreHorizontal
} from "lucide-react";

// ─── Desktop Sidebar Nav Item ─────────────────────────────────────────────────
function SideNavItem({ icon, label, active = false }: {
  icon: React.ReactNode; label: string; active?: boolean;
}) {
  return (
    <button className={`w-full flex flex-col items-center justify-center py-3 px-1 gap-1 transition-all duration-100
      ${active ? "text-[#0b5cff] bg-[#e8f0fe]" : "text-[#555] hover:bg-[#f0f0f0] hover:text-[#222]"}`}>
      {icon}
      <span className={`text-[10px] font-medium leading-none ${active ? "text-[#0b5cff]" : "text-[#666]"}`}>
        {label}
      </span>
    </button>
  );
}

// ─── Mobile Bottom Tab Item ───────────────────────────────────────────────────
function BottomTab({ icon, label, active = false, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center justify-center flex-1 py-2 gap-0.5 transition-colors
        ${active ? "text-[#0b5cff]" : "text-[#888]"}`}>
      {icon}
      {label && <span className="text-[10px] font-medium">{label}</span>}
    </button>
  );
}

// ─── Action Card ──────────────────────────────────────────────────────────────
function ActionCard({ icon, label, color, onClick }: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button onClick={onClick}
        className={`w-14 h-14 ${color} rounded-2xl flex items-center justify-center shadow-sm active:scale-95 transition-transform`}>
        {icon}
      </button>
      <span className="text-[11px] font-medium text-[#333] text-center leading-tight">{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const router = useRouter();

  useEffect(() => {
    setCurrentTime(new Date());
    setCalendarDate(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleNewMeeting = async () => {
    try {
      const code = Math.random().toString(36).substring(2, 12);
      const meeting = await createMeeting({
        title: "Instant Meeting", duration: 60, is_instant: true,
        host_id: "host@zoomclone.com", meeting_code: code,
      });
      router.push(`/meeting/${meeting.meeting_code}?name=Host&host=true`);
    } catch (error) {
      console.error("Failed to start new meeting", error);
    }
  };

  const goToPrevDay = () => {
    const d = new Date(calendarDate); d.setDate(d.getDate() - 1); setCalendarDate(d);
  };
  const goToNextDay = () => {
    const d = new Date(calendarDate); d.setDate(d.getDate() + 1); setCalendarDate(d);
  };

  return (
    <div className="flex h-[100dvh] bg-white overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ═══════════════════════════════════════════════════════════════════════
          LEFT SIDEBAR — only rendered on large screens (lg = 1024px+).
          On mobile/tablet we use the bottom tab bar instead.
          Using display:none (hidden) is far more reliable than transform-based
          slide-in/out on mobile browsers which ignore translate on fixed elements.
      ═══════════════════════════════════════════════════════════════════════ */}
      <aside className="hidden lg:flex w-[68px] flex-shrink-0 flex-col bg-white border-r border-[#e5e5e5]">
        {/* Logo */}
        <div className="h-[54px] flex items-center justify-center border-b border-[#e5e5e5]">
          <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
            <rect width="40" height="40" rx="8" fill="#0b5cff" />
            <path d="M6 14C6 12.343 7.343 11 9 11H22C23.657 11 25 12.343 25 14V26C25 27.657 23.657 29 22 29H9C7.343 29 6 27.657 6 26V14Z" fill="white" />
            <path d="M26 17.2L33.2 12.4A1 1 0 0135 13.2V26.8A1 1 0 0133.2 27.6L26 22.8V17.2Z" fill="white" />
          </svg>
        </div>
        <nav className="flex-1 flex flex-col pt-1">
          <SideNavItem icon={<Home size={20} />} label="Home" active />
          <SideNavItem icon={<MessageSquare size={20} />} label="Chat" />
          <SideNavItem icon={<Video size={20} />} label="Meetings" />
          <SideNavItem icon={<Users size={20} />} label="Contacts" />
          <SideNavItem icon={<Clock size={20} />} label="Scheduler" />
          <SideNavItem icon={<Star size={20} />} label="Hub" />
          <SideNavItem icon={<Upload size={20} />} label="Clips" />
          <SideNavItem icon={<MoreHorizontal size={20} />} label="More" />
        </nav>
        <div className="pb-2 border-t border-[#e5e5e5]">
          <SideNavItem icon={<Settings size={20} />} label="Settings" />
        </div>
      </aside>

      {/* ── Main content column ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top Header ── */}
        <header className="h-[54px] flex-shrink-0 flex items-center justify-between px-4 border-b border-[#e5e5e5] bg-white z-10">
          {/* Logo visible only on mobile (sidebar hides it on desktop) */}
          <div className="flex items-center gap-2">
            <div className="lg:hidden w-7 h-7 flex-shrink-0">
              <svg viewBox="0 0 40 40" fill="none" className="w-7 h-7">
                <rect width="40" height="40" rx="8" fill="#0b5cff" />
                <path d="M6 14C6 12.343 7.343 11 9 11H22C23.657 11 25 12.343 25 14V26C25 27.657 23.657 29 22 29H9C7.343 29 6 27.657 6 26V14Z" fill="white" />
                <path d="M26 17.2L33.2 12.4A1 1 0 0135 13.2V26.8A1 1 0 0133.2 27.6L26 22.8V17.2Z" fill="white" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-[#333]">Zoom Clone</span>
          </div>

          {/* Search — hidden on small, visible md+ */}
          <div className="hidden md:flex flex-1 max-w-[360px] mx-6">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input type="text" placeholder="Search" className="w-full pl-8 pr-4 py-1.5 bg-[#f3f3f3] rounded-full text-sm placeholder-gray-400 focus:bg-white focus:ring-1 focus:ring-[#0b5cff] outline-none transition-all" />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button className="md:hidden p-2 rounded-full hover:bg-gray-100 text-gray-500"><Search size={17} /></button>
            <button className="p-2 rounded-full hover:bg-gray-100 text-gray-500"><Bell size={17} /></button>
            <div className="w-8 h-8 rounded-full bg-[#0b5cff] flex items-center justify-center text-white text-xs font-bold ml-1 cursor-pointer">PJ</div>
          </div>
        </header>

        {/* ── Scrollable body ── */}
        <main className="flex-1 overflow-y-auto bg-[#f7f7f7]">
          {/* pb-20 on mobile gives room above the bottom nav bar */}
          <div className="max-w-[820px] mx-auto px-4 py-6 pb-24 lg:pb-8">

            {/* Clock */}
            <div className="text-center mb-6">
              <div className="text-[48px] sm:text-[56px] font-light text-[#222] leading-none tracking-tight">
                {currentTime ? format(currentTime, "HH:mm") : "--:--"}
              </div>
              <div className="text-[13px] sm:text-[15px] text-[#666] mt-1 font-normal">
                {currentTime ? format(currentTime, "EEEE, MMMM d, yyyy") : ""}
              </div>
            </div>

            {/* ── Action buttons ────────────────────────────────────────────
                Mobile: 4 equal columns (New meeting, Join, Schedule, More)
                Desktop: 5 buttons in a row
            ─────────────────────────────────────────────────────────────── */}
            <div className="mb-8">
              {/* Mobile row — 4 key actions only */}
              <div className="grid grid-cols-4 gap-2 sm:hidden">
                <ActionCard icon={<Video size={22} className="text-white" fill="white" />} label="New meeting" color="bg-[#ff742e]" onClick={handleNewMeeting} />
                <ActionCard icon={<Plus size={26} className="text-white" strokeWidth={2.5} />} label="Join" color="bg-[#0b5cff]" onClick={() => setIsJoinOpen(true)} />
                <ActionCard icon={<Calendar size={22} className="text-white" />} label="Schedule" color="bg-[#0b5cff]" onClick={() => setIsScheduleOpen(true)} />
                <ActionCard icon={<Monitor size={20} className="text-white" />} label="Share" color="bg-[#0b5cff]" onClick={() => {}} />
              </div>
              {/* Desktop row — all 5 */}
              <div className="hidden sm:flex justify-center gap-6 lg:gap-8">
                <ActionCard icon={<Video size={28} className="text-white" fill="white" />} label="New meeting" color="bg-[#ff742e]" onClick={handleNewMeeting} />
                <ActionCard icon={<Plus size={32} className="text-white" strokeWidth={2.5} />} label="Join" color="bg-[#0b5cff]" onClick={() => setIsJoinOpen(true)} />
                <ActionCard icon={<Calendar size={26} className="text-white" />} label="Schedule" color="bg-[#0b5cff]" onClick={() => setIsScheduleOpen(true)} />
                <ActionCard icon={<Monitor size={24} className="text-white" />} label="Share screen" color="bg-[#0b5cff]" onClick={() => {}} />
                <ActionCard icon={<FileText size={24} className="text-white" />} label="My notes" color="bg-[#0b5cff]" onClick={() => {}} />
              </div>
            </div>

            {/* ── Meetings card ── */}
            <div className="bg-white rounded-xl border border-[#e5e5e5] shadow-sm overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e5e5e5]">
                {/* + button */}
                <button onClick={() => setIsScheduleOpen(true)} className="text-[#0b5cff] hover:text-[#094dd6] transition-colors flex-shrink-0">
                  <Plus size={18} />
                </button>

                {/* Date navigator — compact format on mobile */}
                <div className="flex items-center gap-1 flex-1 justify-center">
                  <button onClick={goToPrevDay} className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0">
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-[12px] sm:text-[13px] font-medium text-[#444] text-center whitespace-nowrap px-1">
                    {calendarDate ? format(calendarDate, "MMM d, yyyy") : ""}
                  </span>
                  <button onClick={goToNextDay} className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0">
                    <ChevronRight size={15} />
                  </button>
                </div>

                {/* Today button */}
                <button
                  onClick={() => setCalendarDate(new Date())}
                  className="text-[11px] font-medium px-2.5 py-1 rounded border border-[#ddd] text-[#333] hover:bg-gray-50 transition-colors flex-shrink-0">
                  Today
                </button>
              </div>

              {/* Meetings list */}
              <div className="min-h-[220px]">
                <UpcomingMeetings key={refreshTrigger} />
              </div>

              {/* Footer link */}
              <div className="border-t border-[#e5e5e5] px-4 py-3">
                <button className="flex items-center gap-1.5 text-sm text-[#333] hover:text-[#0b5cff] font-medium transition-colors group">
                  <Monitor size={14} className="text-gray-400 group-hover:text-[#0b5cff]" />
                  Open recordings
                  <ChevronRight size={13} className="text-gray-400 group-hover:text-[#0b5cff]" />
                </button>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MOBILE BOTTOM NAV BAR — hidden on lg+ screens where sidebar is shown.
          Five tabs: Home | Chat | [+ FAB] | Contacts | Settings
      ═══════════════════════════════════════════════════════════════════════ */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[#e5e5e5] flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <BottomTab icon={<Home size={20} />} label="Home" active />
        <BottomTab icon={<MessageSquare size={20} />} label="Chat" />

        {/* Centre FAB — New meeting */}
        <div className="flex-1 flex items-center justify-center py-1.5">
          <button
            onClick={handleNewMeeting}
            className="w-12 h-12 bg-[#0b5cff] rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform -mt-5">
            <Video size={20} className="text-white" fill="white" />
          </button>
        </div>

        <BottomTab icon={<Users size={20} />} label="Contacts" />
        <BottomTab icon={<Settings size={20} />} label="Settings" />
      </nav>

      {/* Modals */}
      <JoinMeetingModal isOpen={isJoinOpen} onClose={() => setIsJoinOpen(false)} />
      <ScheduleMeetingModal isOpen={isScheduleOpen} onClose={() => setIsScheduleOpen(false)} onScheduled={() => setRefreshTrigger(p => p + 1)} />
    </div>
  );
}
