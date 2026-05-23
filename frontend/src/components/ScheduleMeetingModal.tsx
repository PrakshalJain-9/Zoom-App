import React, { useState } from 'react';
import { X } from 'lucide-react';
import { createMeeting } from '@/lib/api';

interface ScheduleMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

export default function ScheduleMeetingModal({ isOpen, onClose, onScheduled }: ScheduleMeetingModalProps) {
  const [topic, setTopic] = useState('My Meeting');
  const [loading, setLoading] = useState(false);

  const getLocalDateString = (d: Date) => {
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const getLocalTimeString = (d: Date) => {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const [date, setDate] = useState(() => getLocalDateString(new Date()));
  const [time, setTime] = useState(() => getLocalTimeString(new Date()));

  if (!isOpen) return null;

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const scheduledDateTime = new Date(`${date}T${time}`);
      await createMeeting({
        title: topic,
        duration: 60,
        is_instant: false,
        host_id: "host@zoomclone.com", // Matches default seeder
        start_time: scheduledDateTime.toISOString()
      });
      onScheduled();
      onClose();
    } catch (error) {
      console.error("Failed to schedule", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in duration-200">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[#eee]">
          <h2 className="text-[15px] font-bold text-gray-800">Schedule Meeting</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSchedule} className="p-5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Topic</label>
              <input 
                type="text" 
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-zoom-blue focus:border-zoom-blue outline-none transition-all"
              />
            </div>
            
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-zoom-blue focus:border-zoom-blue outline-none transition-all text-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input 
                  type="time" 
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-zoom-blue focus:border-zoom-blue outline-none transition-all text-gray-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Security</label>
              <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4 text-zoom-blue rounded border-gray-300 focus:ring-zoom-blue" />
                  <span className="text-sm text-gray-700 font-medium">Passcode</span>
                  <span className="text-sm text-gray-500 ml-auto border bg-white px-2 py-0.5 rounded">xyz123</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input type="checkbox" defaultChecked className="w-4 h-4 text-zoom-blue rounded border-gray-300 focus:ring-zoom-blue" />
                  <span className="text-sm text-gray-700 font-medium">Waiting Room</span>
                </label>
              </div>
            </div>
          </div>
          
          <div className="mt-6 flex gap-3 pt-4 border-t border-[#eee]">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors text-sm border border-gray-200"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading || !topic.trim()}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-lg font-medium text-white bg-[#0b5cff] hover:bg-[#094dd6] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? 'Scheduling...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
