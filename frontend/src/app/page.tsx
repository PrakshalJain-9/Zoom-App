"use client";

import React, { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import ActionButtons from "@/components/ActionButtons";
import UpcomingMeetings from "@/components/UpcomingMeetings";
import JoinMeetingModal from "@/components/JoinMeetingModal";
import ScheduleMeetingModal from "@/components/ScheduleMeetingModal";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { createMeeting } from "@/lib/api";

export default function Dashboard() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [refreshMeetingsTrigger, setRefreshMeetingsTrigger] = useState(0);
  const router = useRouter();

  useEffect(() => {
    setCurrentTime(new Date());
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
        host_id: "host@zoomclone.com", // Default mock user
        meeting_code: code
      });
      router.push(`/meeting/${meeting.meeting_code}?name=Host&host=true`);
    } catch (error) {
      console.error("Failed to start new meeting", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 flex flex-col lg:flex-row gap-6 mt-4">
        {/* Left Column */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Time & Background Header */}
          <div className="relative h-64 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between p-6 text-white">
            {/* Background Image / Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-800 z-0" />
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=2070&auto=format&fit=crop')] opacity-30 mix-blend-overlay bg-cover bg-center z-0" />
            
            <div className="relative z-10">
              <h1 className="text-5xl font-light tracking-tight mb-2">
                {currentTime ? format(currentTime, "h:mm") : "--:--"}
                <span className="text-2xl ml-1">{currentTime ? format(currentTime, "a") : ""}</span>
              </h1>
              <p className="text-lg font-medium opacity-90">{currentTime ? format(currentTime, "EEEE, MMMM d") : "Loading..."}</p>
            </div>
          </div>

          {/* Action Buttons Grid */}
          <div className="pt-2 flex flex-col gap-5">
            <ActionButtons 
              onNewMeeting={handleNewMeeting}
              onJoinMeeting={() => setIsJoinOpen(true)}
              onScheduleMeeting={() => setIsScheduleOpen(true)}
            />

          </div>
        </div>

        {/* Right Column */}
        <div className="w-full lg:w-[380px]">
          {/* passing a key to force refresh when a meeting is scheduled */}
          <UpcomingMeetings key={refreshMeetingsTrigger} />
        </div>
      </main>

      <JoinMeetingModal 
        isOpen={isJoinOpen} 
        onClose={() => setIsJoinOpen(false)} 
      />
      
      <ScheduleMeetingModal 
        isOpen={isScheduleOpen} 
        onClose={() => setIsScheduleOpen(false)}
        onScheduled={() => setRefreshMeetingsTrigger(prev => prev + 1)}
      />
    </div>
  );
}
