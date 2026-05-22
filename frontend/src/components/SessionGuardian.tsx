"use client";
import { useEffect } from 'react';
import { api } from '@/lib/api';

export default function SessionGuardian({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const initializeGlobalSession = async () => {
      if (!localStorage.getItem('token')) {
        try {
          const response = await api.post('/auth/anonymous-session');
          localStorage.setItem('token', response.data.access_token);
        } catch (error) {
          console.error("Failed to initialize anonymous session", error);
        }
      }
    };
    initializeGlobalSession();
  }, []);

  return <>{children}</>;
}