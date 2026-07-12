import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

interface Props {
  socket: Socket | null;
  targetUserId?: string | null;
}

export function VoiceChatPanel({ socket, targetUserId }: Props) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputId, setInputId] = useState('');
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((entries) => {
      const audioInputs = entries.filter((entry) => entry.kind === 'audioinput');
      setDevices(audioInputs);
      if (audioInputs[0]) setInputId(audioInputs[0].deviceId);
    });
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onSignal = async ({ fromUserId, payload }: any) => {
      if (targetUserId && fromUserId !== targetUserId) return;
      if (!peerRef.current) await joinVoice();
      const peer = peerRef.current!;
      if (payload.offer) {
        await peer.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('voice:signal', { targetUserId: fromUserId, payload: { answer } });
      }
      if (payload.answer) await peer.setRemoteDescription(new RTCSessionDescription(payload.answer));
      if (payload.candidate) await peer.addIceCandidate(payload.candidate);
    };
    socket.on('voice:signal', onSignal);
    return () => {
      socket.off('voice:signal', onSignal);
    };
  }, [socket, targetUserId]);

  const joinVoice = async () => {
    try {
      setError('');
      if (!socket || !targetUserId) return;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('المتصفح لا يدعم الصوت');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true, deviceId: inputId || undefined } });
      streamRef.current = stream;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.onicecandidate = (event) => {
        if (event.candidate) socket.emit('voice:signal', { targetUserId, payload: { candidate: event.candidate } });
      };
      peer.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
      };

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('voice:signal', { targetUserId, payload: { offer } });
      setJoined(true);
    } catch (joinError) {
      setError((joinError as Error).message);
      leaveVoice();
    }
  };

  useEffect(() => {
    if (!joined || !analyserRef.current) return;
    let frame = 0;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    const tick = () => {
      analyserRef.current?.getByteFrequencyData(data);
      const volume = data.reduce((sum, value) => sum + value, 0) / data.length;
      setSpeaking(volume > 18 && !muted);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [joined, muted]);

  const leaveVoice = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    peerRef.current?.close();
    audioContextRef.current?.close();
    streamRef.current = null;
    peerRef.current = null;
    analyserRef.current = null;
    audioContextRef.current = null;
    setJoined(false);
    setSpeaking(false);
  };

  const toggleMute = () => {
    setMuted((value) => {
      const next = !value;
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  };

  const status = useMemo(() => {
    if (!targetUserId) return 'اختر لاعبًا لبدء الصوت';
    if (!joined) return 'غير متصل';
    if (speaking) return 'جارٍ التحدث';
    return muted ? 'مكتوم' : 'متصل';
  }, [joined, muted, speaking, targetUserId]);

  return (
    <section className="voice-panel card">
      <div className="section-header">
        <div>
          <h3>المحادثة الصوتية</h3>
          <p>{status}</p>
        </div>
        <span className={`voice-indicator ${speaking ? 'active' : ''}`} />
      </div>
      <label className="field">
        <span>جهاز الإدخال</span>
        <select value={inputId} onChange={(event) => setInputId(event.target.value)}>
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</option>
          ))}
        </select>
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="inline-actions">
        {!joined ? <button className="btn" type="button" onClick={joinVoice} disabled={!targetUserId}>انضمام</button> : <button className="btn danger" type="button" onClick={leaveVoice}>مغادرة</button>}
        <button className="btn secondary" type="button" onClick={toggleMute} disabled={!joined}>{muted ? 'فتح الميكروفون' : 'كتم الميكروفون'}</button>
      </div>
    </section>
  );
}
