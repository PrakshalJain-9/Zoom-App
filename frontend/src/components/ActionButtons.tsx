import React from 'react';
import { Video, Plus, Calendar } from 'lucide-react';

interface ActionButtonsProps {
  onNewMeeting: () => void;
  onJoinMeeting: () => void;
  onScheduleMeeting: () => void;
}

export default function ActionButtons({ onNewMeeting, onJoinMeeting, onScheduleMeeting }: ActionButtonsProps) {
  return (
    <div className="flex justify-center md:justify-start gap-6 flex-wrap">
      {/* New Meeting */}
      <div className="flex flex-col items-center gap-2 group cursor-pointer" onClick={onNewMeeting}>
        <div className="w-[84px] h-[84px] rounded-[24px] bg-zoom-orange hover:bg-zoom-orange-hover flex items-center justify-center shadow-md transition-colors">
          <Video size={40} className="text-white" fill="white" />
        </div>
        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">New Meeting</span>
      </div>

      {/* Join */}
      <div className="flex flex-col items-center gap-2 group cursor-pointer" onClick={onJoinMeeting}>
        <div className="w-[84px] h-[84px] rounded-[24px] bg-zoom-blue hover:bg-zoom-blue-hover flex items-center justify-center shadow-md transition-colors">
          <Plus size={44} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Join</span>
      </div>

      {/* Schedule */}
      <div className="flex flex-col items-center gap-2 group cursor-pointer" onClick={onScheduleMeeting}>
        <div className="w-[84px] h-[84px] rounded-[24px] bg-zoom-blue hover:bg-zoom-blue-hover flex items-center justify-center shadow-md transition-colors">
          <Calendar size={36} className="text-white" />
        </div>
        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Schedule</span>
      </div>
    </div>
  );
}
