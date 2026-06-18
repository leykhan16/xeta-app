import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'https://xeta-backend.onrender.com';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('xeta_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const registerUser = async (email, username, password, publicKey) => {
  const response = await api.post('/register', {
    email,
    username,
    password,
    public_key: publicKey,
  });
  return response.data;
};

export const loginUser = async (identifier, password) => {
  const response = await api.post('/login', { identifier, password });
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/me');
  return response.data;
};

export const searchUsers = async (query) => {
  const response = await api.get(`/users/search?q=${query}`);
  return response.data;
};

export const getUserPublicKey = async (username) => {
  const response = await api.get(`/users/${username}/key`);
  return response.data;
};

export const sendMessage = async (recipientId, ciphertext, nonce, mediaUrl) => {
  const response = await api.post('/messages', {
    recipient_id: recipientId,
    ciphertext,
    nonce,
    media_url: mediaUrl || null,
  });
  return response.data;
};

export const getMessages = async (conversationId) => {
  const response = await api.get(`/messages/${conversationId}`);
  return response.data;
};

export const getConversations = async () => {
  const response = await api.get('/conversations');
  return response.data;
};

export const updateProfile = async (data) => {
  const response = await api.patch('/me', data);
  return response.data;
};

export const uploadImage = async (uri, mimeType) => {
  const formData = new FormData();
  const filename = uri.split('/').pop();

  formData.append('file', {
    uri,
    name: filename,
    type: mimeType,
  });

  const token = await (await import('expo-secure-store')).getItemAsync('xeta_token');

  const response = await fetch(`${BASE_URL}/media/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Upload failed');
  }

  const data = await response.json();
  return data.url;
};

export const getUserProfile = async (username) => {
  const response = await api.get(`/users/${username}`);
  return response.data;
};
