"use client";

import React, { useEffect, useState } from 'react';
import { getMeetings, api } from '@/lib/api';
import { format, isToday, isTomorrow } from 'date-fns';
import { Video } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function UpcomingMeetings() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      try {
        const userRes = await api.get('/auth/me');
        setCurrentUser(userRes.data);
      } catch (err: any) {
        console.error("Failed to fetch current user", err);
        // If 401 Unauthorized, the token is stale or invalid (e.g. database was reset)
        if (err.response?.status === 401) {
          console.log("Stale token detected. Re-initializing anonymous session...");
          try {
            // Re-authenticate by creating a new anonymous session
            const authRes = await api.post('/auth/anonymous-session');
            const newToken = authRes.data.access_token;
            if (typeof window !== 'undefined') {
              localStorage.setItem('token', newToken);
            }
            // Retry fetching profile with the new token
            const retryUserRes = await api.get('/auth/me');
            setCurrentUser(retryUserRes.data);
          } catch (authErr) {
            console.error("Failed to re-initialize anonymous session", authErr);
          }
        }
      }
      fetchMeetings();
    };
    init();
  }, []);


  const fetchMeetings = async () => {
    try {
      const data = await getMeetings();
      setMeetings(data);
    } catch (error) {
      console.error("Failed to fetch meetings", error);
    } finally {
      setLoading(false);
    }
  };

  const formatMeetingDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const formatMeetingTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString.endsWith('Z') ? dateString : dateString + 'Z');
    return format(date, 'h:mm a');
  };

  const handleStart = (meetingCode: string) => {
    router.push(`/meeting/${meetingCode}?name=Host&host=true`);
  };

  const now = new Date();

  const sortedUpcoming = [...meetings.filter(m => {
    if (!currentUser || m.host_id !== currentUser.id) return false;
    const startTime = new Date(m.start_time.endsWith('Z') ? m.start_time : m.start_time + 'Z');
    return !m.is_ended && startTime > now;
  })].sort((a, b) => {
    if (!a.start_time || !b.start_time) return 0;
    const aStr = a.start_time.endsWith('Z') ? a.start_time : a.start_time + 'Z';
    const bStr = b.start_time.endsWith('Z') ? b.start_time : b.start_time + 'Z';
    return new Date(aStr).getTime() - new Date(bStr).getTime();
  });

  const sortedPast = [...meetings.filter(m => {
    if (!currentUser || m.host_id !== currentUser.id) return false;
    const startTime = new Date(m.start_time.endsWith('Z') ? m.start_time : m.start_time + 'Z');
    return m.is_ended || startTime <= now;
  })].sort((a, b) => {
    if (!a.start_time || !b.start_time) return 0;
    const aStr = a.start_time.endsWith('Z') ? a.start_time : a.start_time + 'Z';
    const bStr = b.start_time.endsWith('Z') ? b.start_time : b.start_time + 'Z';
    return new Date(bStr).getTime() - new Date(aStr).getTime();
  });

  const currentList = activeTab === 'upcoming' ? sortedUpcoming : sortedPast;

  return (
    <div className="bg-white border border-zoom-border rounded-xl shadow-sm h-[500px] flex flex-col overflow-hidden">
      <div className="px-6 pt-4 border-b border-zoom-border flex flex-col gap-3">
        <div className="flex justify-between items-center px-1">
          <h2 className="font-semibold text-lg text-gray-800">Meetings</h2>
          <button onClick={fetchMeetings} className="text-sm text-zoom-blue hover:text-zoom-blue-hover font-medium">Refresh</button>
        </div>
        <div className="flex border-b border-gray-100 -mx-6 px-6">
          <button 
            onClick={() => setActiveTab('upcoming')}
            className={`flex-1 pb-2 text-center text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'upcoming' 
                ? 'border-zoom-blue text-zoom-blue' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Upcoming ({sortedUpcoming.length})
          </button>
          <button 
            onClick={() => setActiveTab('past')}
            className={`flex-1 pb-2 text-center text-sm font-semibold transition-all border-b-2 ${
              activeTab === 'past' 
                ? 'border-zoom-blue text-zoom-blue' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Past ({sortedPast.length})
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center items-center h-full text-gray-400">Loading...</div>
        ) : currentList.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-full text-gray-500 gap-4">
            <div className="w-48 h-32 bg-gray-100 rounded-lg flex items-center justify-center mb-2">
              <Video size={48} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium">
              {activeTab === 'upcoming' ? 'No upcoming meetings' : 'No past meetings'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {currentList.map((meeting: any) => (
              <div key={meeting.id} className="px-6 py-4 border-b border-zoom-border hover:bg-gray-50 transition-colors group cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      {formatMeetingDate(meeting.start_time)}
                    </span>
                    <span className="text-base font-semibold text-gray-900">
                      {formatMeetingTime(meeting.start_time)}
                    </span>
                    <span className="text-sm text-gray-600 mt-1">{meeting.title}</span>
                    <span className="text-xs text-gray-400 mt-1">Meeting ID: {meeting.meeting_code}</span>
                  </div>
                  {activeTab === 'upcoming' && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStart(meeting.meeting_code);
                      }}
                      className="hidden group-hover:block px-4 py-1.5 bg-zoom-blue text-white rounded-full text-xs font-semibold hover:bg-zoom-blue-hover transition-colors shadow-sm"
                    >
                      Start
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
