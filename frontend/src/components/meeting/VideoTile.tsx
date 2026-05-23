"use client";

import React, { useEffect, useRef } from 'react';

interface VideoTileProps {
  /** The WebRTC MediaStream to play (local or remote) */
  stream: MediaStream | null;
  /** Whether this stream represents the local participant (needs mirroring and local muting) */
  isLocal: boolean;
  /** Whether video capability is disabled for this participant */
  isVideoOff: boolean;
  /** Optional flag indicating if this participant is speaking (used for layout styling) */
  isSpeaking?: boolean;
  /** Unique key trigger used to force re-binding the stream source to the video element (e.g. after track replacement) */
  streamKey?: number;
}

/**
 * VideoTile Component
 * 
 * Binds a standard WebRTC MediaStream directly to an HTML5 <video> element.
 * Handles autoplay permission policies, playsInline requirements for mobile browsers,
 * mirroring local self-view, and toggling visibility when camera is disabled.
 */
export default function VideoTile({
  stream,
  isLocal,
  isVideoOff,
  isSpeaking,
  streamKey
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Bind the media stream to the video element whenever stream properties change
  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement) {
      // Set the video stream as the source object
      videoElement.srcObject = stream;
      
      if (stream) {
        // Attempt to play the video. WebRTC media streams require autoPlay and playsInline
        videoElement.play().catch(err => {
          // AbortError can occur during rapid track changes or page navigation; ignore it
          if (err.name !== 'AbortError') {
            console.error("Video play error in VideoTile:", err);
          }
        });
      }
    }
  }, [stream, streamKey]);

  return (
    <video
      ref={videoRef}
      autoPlay={true}
      playsInline={true}
      // Local self-view video should always be muted locally to prevent echo feedback loops
      muted={isLocal}
      // scale-x-[-1] mirrors the webcam feed for natural interaction (Zoom style)
      // opacity-0 is used when video is off so we fall back gracefully to the avatar initials view
      className={`absolute inset-0 w-full h-full object-cover bg-gray-900 rounded-lg ${
        isLocal ? 'scale-x-[-1]' : ''
      } ${
        isVideoOff || !stream ? 'pointer-events-none opacity-0 z-0' : 'z-20'
      }`}
    />
  );
}
