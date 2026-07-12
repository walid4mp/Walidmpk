import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';

let socket: Socket | null = null;

export function getSocket(token: string) {
  if (!socket) {
    socket = io(API_URL, { auth: { token } });
  }
  return socket;
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
}
