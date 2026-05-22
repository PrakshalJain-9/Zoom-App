import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('participant_id');
      }
    }
    return Promise.reject(error);
  }
);


export const createMeeting = async (data: any) => {
  const response = await api.post('/meetings', data);
  return response.data;
};

export const getMeetings = async () => {
  const response = await api.get('/meetings');
  return response.data;
};

export const getMeeting = async (meetingCode: string) => {
  const response = await api.get(`/meetings/${meetingCode}`);
  return response.data;
};

export const joinMeeting = async (meetingCode: string, displayName: string, isHost: boolean = false, participantId?: string | null, signal?: AbortSignal) => {
  const response = await api.post(`/meetings/${meetingCode}/join`, { display_name: displayName, is_host: isHost, participant_id: participantId }, { signal });
  return response.data;
};

export const getMeetingChat = async (meetingCode: string, signal?: AbortSignal) => {
  const response = await api.get(`/meetings/${meetingCode}/chat`, { signal });
  return response.data;
};

