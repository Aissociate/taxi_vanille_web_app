import { useState, useRef } from 'react';
import { Camera, Video, Mic, Square, X, Check, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { enqueue, isOnline } from '../lib/offlineQueue';
import type { IncidentType } from '../lib/types';

interface Props {
  onClose: () => void;
  chauffeurId: string;
  userId: string;
  courseId?: string;
}

const INCIDENT_TYPES: { type: IncidentType; label: string; color: string }[] = [
  { type: 'accident', label: 'ACCIDENT', color: '#c0392b' },
  { type: 'panne', label: 'PANNE', color: '#d35400' },
  { type: 'retard', label: 'RETARD', color: '#e74c3c' },
  { type: 'voie_bloquee', label: 'VOIE BLOQUEE', color: '#2c3e50' },
  { type: 'passager_refuse', label: 'PASSAGER REFUSE', color: '#8e44ad' },
  { type: 'securite', label: 'SECURITE', color: '#c0392b' },
  { type: 'meteo', label: 'METEO', color: '#1a5276' },
  { type: 'client_absent', label: 'CLIENT ABSENT', color: '#d35400' },
  { type: 'autre', label: 'AUTRE', color: '#6B6D70' },
];

export default function MobileIncidentSheet({ onClose, chauffeurId, userId, courseId }: Props) {
  const [selectedType, setSelectedType] = useState<IncidentType | null>(null);
  const [sending, setSending] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'photo' | 'video' | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'photo' | 'video') => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      setMediaType(type);
      const reader = new FileReader();
      reader.onloadend = () => setMediaPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 59) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      // Microphone access denied
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const removeAudio = () => {
    setAudioBlob(null);
    setRecordingTime(0);
  };

  const uploadFile = async (file: Blob, path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from('incidents').upload(path, file);
    if (error || !data) return null;
    const { data: urlData } = supabase.storage.from('incidents').getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const handleSubmit = async () => {
    if (!selectedType) return;
    setSending(true);

    const timestamp = Date.now();
    // Videos go in video_url, photos in photo_url
    const mediaField = mediaType === 'video' ? 'video_url' : 'photo_url';
    const mediaExt = mediaFile?.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg');
    const mediaPath = `${chauffeurId}/${timestamp}.${mediaExt}`;
    const audioPath = `${chauffeurId}/${timestamp}.webm`;

    const incidentData: Record<string, unknown> = {
      course_id: courseId || null,
      chauffeur_id: chauffeurId,
      type: selectedType,
      description: '',
      photo_url: null,
      video_url: null,
      audio_url: null,
      user_id: userId,
    };

    if (isOnline()) {
      try {
        if (mediaFile) {
          incidentData[mediaField] = await uploadFile(mediaFile, mediaPath);
        }
        if (audioBlob) {
          incidentData.audio_url = await uploadFile(audioBlob, audioPath);
        }
        const { error } = await supabase.from('incidents').insert(incidentData);
        if (error) throw error;
      } catch {
        // Echec en ligne (RLS, reseau instable) : on NE perd PAS l'incident
        // (potentiellement un accident) -> on le bascule en file d'attente.
        const media: { bucket: string; path: string; dataUrl: string; field: string }[] = [];
        if (mediaFile && !incidentData[mediaField]) {
          media.push({ bucket: 'incidents', path: mediaPath, dataUrl: await blobToDataUrl(mediaFile), field: mediaField });
        }
        if (audioBlob && !incidentData.audio_url) {
          media.push({ bucket: 'incidents', path: audioPath, dataUrl: await blobToDataUrl(audioBlob), field: 'audio_url' });
        }
        enqueue({ table: 'incidents', type: 'insert', data: incidentData, media: media.length > 0 ? media : undefined });
        alert('Incident enregistre : il sera renvoye des que la connexion sera stable.');
      }
    } else {
      // Keep the media as data URLs in the queue so they are uploaded when
      // the connection comes back, instead of being silently dropped.
      const media: { bucket: string; path: string; dataUrl: string; field: string }[] = [];
      if (mediaFile) {
        media.push({ bucket: 'incidents', path: mediaPath, dataUrl: await blobToDataUrl(mediaFile), field: mediaField });
      }
      if (audioBlob) {
        media.push({ bucket: 'incidents', path: audioPath, dataUrl: await blobToDataUrl(audioBlob), field: 'audio_url' });
      }
      enqueue({
        table: 'incidents',
        type: 'insert',
        data: incidentData,
        media: media.length > 0 ? media : undefined,
      });
    }

    setSending(false);
    onClose();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative mt-auto bg-gray-50 rounded-t-xl p-4 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />

        <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleFileChange(e, 'photo')} className="hidden" />
        <input ref={videoInputRef} type="file" accept="video/*" capture="environment" onChange={(e) => handleFileChange(e, 'video')} className="hidden" />

        {mediaPreview ? (
          <div className="relative w-full h-[120px] rounded-lg overflow-hidden mb-3">
            {mediaType === 'video' ? (
              <video src={mediaPreview} className="w-full h-full object-cover" controls />
            ) : (
              <img src={mediaPreview} alt="" className="w-full h-full object-cover" />
            )}
            <button type="button" onClick={removeMedia} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center">
              <X size={14} className="text-white" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => photoInputRef.current?.click()} className="flex-1 h-20 bg-white rounded-lg flex flex-col items-center justify-center border border-dashed border-gray-300 active:bg-gray-100">
              <Camera size={24} className="text-gray-400" />
              <span className="text-[10px] text-gray-500 mt-1">PHOTO</span>
            </button>
            <button type="button" onClick={() => videoInputRef.current?.click()} className="flex-1 h-20 bg-white rounded-lg flex flex-col items-center justify-center border border-dashed border-gray-300 active:bg-gray-100">
              <Video size={24} className="text-gray-400" />
              <span className="text-[10px] text-gray-500 mt-1">VIDEO 30s</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center animate-pulse">
              <span className="text-white text-[10px] font-bold">!</span>
            </div>
            <span className="text-xs font-bold text-red-600">ALERT</span>
          </div>
          <span className="text-[10px] text-gray-400">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Mayotte' })}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-2">
          {INCIDENT_TYPES.map(({ type, label, color }) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all min-h-[82px] ${
                selectedType === type
                  ? 'border-red-600 bg-white shadow-md scale-[1.04]'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}22`, border: `2px solid ${color}44` }}>
                <span className="text-lg font-bold" style={{ color }}>!</span>
              </div>
              <span className="text-[9px] font-bold text-gray-700 text-center mt-1 leading-tight">{label}</span>
            </button>
          ))}
        </div>

        {/* Voice memo */}
        <div className="mt-3">
          <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg">
            {!audioBlob && !isRecording && (
              <button type="button" onClick={startRecording} className="w-11 h-11 rounded-full bg-red-600 flex items-center justify-center shrink-0 active:scale-95">
                <Mic size={18} className="text-white" />
              </button>
            )}
            {isRecording && (
              <button type="button" onClick={stopRecording} className="w-11 h-11 rounded-full bg-red-600 flex items-center justify-center shrink-0 animate-pulse">
                <Square size={14} className="text-white" />
              </button>
            )}
            {audioBlob && !isRecording && (
              <button type="button" onClick={removeAudio} className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200">
                <Trash2 size={16} className="text-red-500" />
              </button>
            )}
            <div className="flex-1">
              {isRecording && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                  <span className="text-xs font-bold text-red-600">REC</span>
                </div>
              )}
              {audioBlob && !isRecording && (
                <div className="flex items-center gap-1.5">
                  <Check size={14} className="text-green-600" />
                  <span className="text-xs text-gray-500">{formatTime(recordingTime)}</span>
                </div>
              )}
              {!audioBlob && !isRecording && (
                <span className="text-xs text-gray-500">MEMO 60s</span>
              )}
            </div>
            <span className="text-[10px] text-gray-400 shrink-0">
              {formatTime(isRecording ? recordingTime : (audioBlob ? recordingTime : 0))}
            </span>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg font-bold text-center border-2 border-gray-200 text-gray-900 bg-white active:bg-gray-100">
            <X size={16} className="inline-block mr-1" />
            <span className="align-middle text-sm">Annuler</span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedType || sending}
            className={`flex-[2] py-3 rounded-lg font-bold text-white text-center text-lg transition-colors ${
              selectedType && !sending ? 'bg-red-600 active:bg-red-700' : 'bg-gray-300 text-gray-500'
            }`}
          >
            {sending ? '...' : 'ENVOYER'}
          </button>
        </div>
      </div>
    </div>
  );
}
