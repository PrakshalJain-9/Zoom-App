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
  Users, MoreHorizontal, Settings, Search,
  Clock, ChevronLeft, ChevronRight,
  FileText, Monitor, Star, Bell, Upload, Menu, X
} from "lucide-react";

// ─── Left Sidebar Nav Item ──────────────────────────────────────────────────
function SideNavItem({
  icon, label, active = false, badge
}: {
  icon: React.ReactNode; label: string; active?: boolean; badge?: number;
}) {
  return (
    <button
      className={`w-full flex flex-col items-center justify-center py-3 px-1 gap-1 relative transition-all duration-100 group
        ${active
          ? "text-[#0b5cff] bg-[#e8f0fe]"
          : "text-[#555] hover:bg-[#f0f0f0] hover:text-[#222]"
        }`}
    >
      <div className="relative">
        {icon}
        {badge && badge > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 bg-[#0b5cff] text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
            {badge}
          </span>
        ) : null}
      </div>
      <span className={`text-[10px] font-medium leading-none ${active ? "text-[#0b5cff]" : "text-[#666]"}`}>
        {label}
      </span>
    </button>
  );
}

// ─── Bottom Mobile Nav Item ──────────────────────────────────────────────────
function BottomNavItem({
  icon, label, active = false, onClick
}: {
  icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center flex-1 py-2 gap-0.5 transition-all
        ${active ? "text-[#0b5cff]" : "text-[#888]"}`}
    >
      {icon}
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

// ─── Action Button Card ─────────────────────────────────────────────────────
function ActionCard({
  icon, label, color, onClick
}: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className={`w-14 h-14 sm:w-[68px] sm:h-[68px] ${color} rounded-[18px] sm:rounded-[20px] flex items-center justify-center shadow-sm hover:brightness-90 active:scale-95 transition-all duration-100`}
      >
        {icon}
      </button>
      <span className="text-[11px] sm:text-[13px] font-medium text-[#333] whitespace-nowrap text-center">{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
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
        title: "Instant Meeting",
        duration: 60,
        is_instant: true,
        host_id: "host@zoomclone.com",
        meeting_code: code,
      });
      router.push(`/meeting/${meeting.meeting_code}?name=Host&host=true`);
    } catch (error) {
      console.error("Failed to start new meeting", error);
    }
  };

  const goToPrevDay = () => {
    const d = new Date(calendarDate);
    d.setDate(d.getDate() - 1);
    setCalendarDate(d);
  };
  const goToNextDay = () => {
    const d = new Date(calendarDate);
    d.setDate(d.getDate() + 1);
    setCalendarDate(d);
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Left Sidebar — hidden on mobile, shown on lg+ ── */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-[68px] flex-shrink-0 flex flex-col bg-white border-r border-[#e5e5e5]
        transform transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        {/* Logo */}
        <div className="h-[54px] flex items-center justify-center border-b border-[#e5e5e5]">
          <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8">
            <rect width="40" height="40" rx="8" fill="#0b5cff" />
            <path d="M6 14C6 12.343 7.343 11 9 11H22C23.657 11 25 12.343 25 14V26C25 27.657 23.657 29 22 29H9C7.343 29 6 27.657 6 26V14Z" fill="white" />
            <path d="M26 17.2L33.2 12.4A1 1 0 0135 13.2V26.8A1 1 0 0133.2 27.6L26 22.8V17.2Z" fill="white" />
          </svg>
        </div>

        {/* Nav items */}
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

        {/* Bottom settings */}
        <div className="pb-2 border-t border-[#e5e5e5]">
          <SideNavItem icon={<Settings size={20} />} label="Settings" />
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top Bar */}
        <header className="h-[54px] flex-shrink-0 flex items-center justify-between px-4 sm:px-5 border-b border-[#e5e5e5] bg-white z-10">
          {/* Mobile hamburger + title */}
          <div className="flex items-center gap-2">
            <button
              className="lg:hidden p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="text-[13px] font-semibold text-[#333]">Zoom Clone</span>
          </div>

          {/* Search bar — hidden on small mobile, visible sm+ */}
          <div className="hidden sm:flex flex-1 max-w-[320px] lg:max-w-[420px] mx-4 lg:mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                type="text"
                placeholder="Search"
                className="w-full pl-9 pr-4 py-1.5 bg-[#f3f3f3] border border-transparent rounded-full text-sm text-[#333] placeholder-gray-400 focus:bg-white focus:border-[#0b5cff] focus:ring-1 focus:ring-[#0b5cff] outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Search icon on tiny screens */}
            <button className="sm:hidden p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
              <Search size={18} />
            </button>
            <button className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
              <Bell size={18} />
            </button>
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-[#0b5cff] flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-[#0b5cff] transition-all ml-0.5">
              PJ
            </div>
          </div>
        </header>

        {/* ── Body ── */}
        <main className="flex-1 overflow-y-auto bg-[#f7f7f7]">
          {/* Add bottom padding on mobile to clear the bottom nav bar */}
          <div className="max-w-[860px] mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 lg:pb-8">

            {/* Time display */}
            <div className="text-center mb-6 sm:mb-8">
              <div className="text-[42px] sm:text-[56px] font-light text-[#222] leading-none tracking-tight">
                {currentTime ? format(currentTime, "HH:mm") : "--:--"}
              </div>
              <div className="text-[13px] sm:text-[15px] text-[#666] mt-1.5 font-normal">
                {currentTime ? format(currentTime, "EEEE, MMMM d, yyyy") : ""}
              </div>
            </div>

            {/* Action buttons row — 3 cols on tiny, 5 on sm+ */}
            <div className="grid grid-cols-3 sm:flex sm:justify-center gap-4 sm:gap-8 mb-8 sm:mb-10 px-2 sm:px-0">
              <ActionCard
                icon={<Video size={26} className="text-white" fill="white" />}
                label="New meeting"
                color="bg-[#ff742e]"
                onClick={handleNewMeeting}
              />
              <ActionCard
                icon={<Plus size={30} className="text-white" strokeWidth={2.5} />}
                label="Join"
                color="bg-[#0b5cff]"
                onClick={() => setIsJoinOpen(true)}
              />
              <ActionCard
                icon={<Calendar size={24} className="text-white" />}
                label="Schedule"
                color="bg-[#0b5cff]"
                onClick={() => setIsScheduleOpen(true)}
              />
              {/* Hide last two cards on tiny screens to keep 3-per-row clean */}
              <div className="hidden sm:block">
                <ActionCard
                  icon={<Monitor size={22} className="text-white" />}
                  label="Share screen"
                  color="bg-[#0b5cff]"
                  onClick={() => {}}
                />
              </div>
              <div className="hidden sm:block">
                <ActionCard
                  icon={<FileText size={22} className="text-white" />}
                  label="My notes"
                  color="bg-[#0b5cff]"
                  onClick={() => {}}
                />
              </div>
            </div>

            {/* Calendar/Meetings section */}
            <div className="bg-white rounded-xl border border-[#e5e5e5] shadow-sm overflow-hidden">
              {/* Header bar */}
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[#e5e5e5]">
                <button
                  onClick={() => setIsScheduleOpen(true)}
                  className="flex items-center gap-1.5 text-[#0b5cff] hover:text-[#094dd6] text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  <span className="hidden sm:inline">Schedule</span>
                </button>

                {/* Date navigator */}
                <div className="flex items-center gap-1.5">
                  <button onClick={goToPrevDay} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[13px] font-medium text-[#444] min-w-[120px] sm:min-w-[160px] text-center">
                    {calendarDate ? format(calendarDate, "EEE, MMM d, yyyy") : ""}
                  </span>
                  <button onClick={goToNextDay} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>

                <button
                  onClick={() => { setCalendarDate(new Date()); }}
                  className="text-xs font-medium px-2.5 py-1 rounded border border-[#d0d0d0] text-[#333] hover:bg-gray-50 transition-colors"
                >
                  Today
                </button>
              </div>

              {/* Meetings list */}
              <div className="min-h-[240px] sm:min-h-[280px]">
                <UpcomingMeetings key={refreshTrigger} />
              </div>

              {/* Footer */}
              <div className="border-t border-[#e5e5e5] px-4 sm:px-5 py-3">
                <button className="flex items-center gap-1.5 text-sm text-[#333] hover:text-[#0b5cff] font-medium transition-colors group">
                  <Monitor size={15} className="text-gray-400 group-hover:text-[#0b5cff] transition-colors" />
                  Open recordings
                  <ChevronRight size={13} className="text-gray-400 group-hover:text-[#0b5cff] transition-colors" />
                </button>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Nav bar (replaces sidebar on phones) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex bg-white border-t border-[#e5e5e5] safe-area-inset-bottom">
        <BottomNavItem icon={<Home size={20} />} label="Home" active />
        <BottomNavItem icon={<MessageSquare size={20} />} label="Chat" />
        <BottomNavItem
          icon={<div className="w-10 h-10 bg-[#0b5cff] rounded-full flex items-center justify-center -mt-4 shadow-lg">
            <Video size={18} className="text-white" fill="white" />
          </div>}
          label=""
          onClick={handleNewMeeting}
        />
        <BottomNavItem icon={<Users size={20} />} label="Contacts" />
        <BottomNavItem icon={<Settings size={20} />} label="Settings" />
      </nav>

      {/* Modals */}
      <JoinMeetingModal isOpen={isJoinOpen} onClose={() => setIsJoinOpen(false)} />
      <ScheduleMeetingModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        onScheduled={() => setRefreshTrigger((p) => p + 1)}
      />
    </div>
  );
}
