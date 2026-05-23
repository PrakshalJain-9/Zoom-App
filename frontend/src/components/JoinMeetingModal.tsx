import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface JoinMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function JoinMeetingModal({ isOpen, onClose }: JoinMeetingModalProps) {
  const [meetingCode, setMeetingCode] = useState('');
  const [displayName, setDisplayName] = useState('PJ');
  const router = useRouter();

  if (!isOpen) return null;

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (meetingCode.trim() && displayName.trim()) {
      // In a real app, we might validate the code here first via API
      router.push(`/meeting/${meetingCode.trim()}?name=${encodeURIComponent(displayName.trim())}`);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      {/* Slide up on mobile, centered card on sm+ */}
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in duration-200">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[#eee]">
          <h2 className="text-[15px] font-bold text-gray-800">Join Meeting</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleJoin} className="p-5">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting ID or Link</label>
              <input 
                type="text" 
                required
                value={meetingCode}
                onChange={(e) => setMeetingCode(e.target.value)}
                placeholder="Enter meeting ID"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0b5cff] focus:border-[#0b5cff] outline-none transition-all text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input 
                type="text" 
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0b5cff] focus:border-[#0b5cff] outline-none transition-all text-sm"
              />
            </div>
            
            <div className="pt-1 space-y-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-[#0b5cff]" />
                <span className="text-sm text-gray-600">Remember my name for future meetings</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-[#0b5cff]" />
                <span className="text-sm text-gray-600">Do not connect to audio</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 accent-[#0b5cff]" />
                <span className="text-sm text-gray-600">Turn off my video</span>
              </label>
            </div>
          </div>
          
          <div className="mt-6 flex gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition-colors text-sm border border-gray-200"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={!meetingCode.trim() || !displayName.trim()}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-lg font-medium text-white bg-[#0b5cff] hover:bg-[#094dd6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
