import { useState, useRef } from 'react';
import { PText, PIcon } from '@porsche-design-system/components-react';
import { supabase } from '../lib/supabase';
import { enqueue, isOnline } from '../lib/offlineQueue';
import type { IncidentType } from '../lib/types';

interface Props {
  onClose: () => void;
  chauffeurId: string;
  userId: string;
  courseId?: string;
}

const INCIDENT_TYPES: { type: IncidentType; icon: string; color: string }[] = [
  { type: 'accident', icon: 'error-filled', color: '#c0392b' },
  { type: 'panne', icon: 'warning-filled', color: '#d35400' },
  { type: 'retard', icon: 'stopwatch', color: '#e74c3c' },
  { type: 'voie_bloquee', icon: 'disable', color: '#2c3e50' },
  { type: 'passager_refuse', icon: 'stop', color: '#8e44ad' },
  { type: 'securite', icon: 'flash', color: '#c0392b' },
  { type: 'meteo', icon: 'weather', color: '#1a5276' },
  { type: 'client_absent', icon: 'clock', color: '#d35400' },
  { type: 'autre', icon: 'exclamation-filled', color: '#6B6D70' },
];

export default function IncidentSheet({ onClose, chauffeurId, userId, courseId }: Props) {
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

  const handlePhotoCapture = () => {
    photoInputRef.current?.click();
  };

  const handleVideoCapture = () => {
    videoInputRef.current?.click();
  };

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

  const handleSubmit = async () => {
    if (!selectedType) return;
    setSending(true);

    const timestamp = Date.now();
    let photoUrl: string | null = null;
    let audioUrl: string | null = null;

    if (isOnline()) {
      if (mediaFile) {
        const ext = mediaFile.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg');
        photoUrl = await uploadFile(mediaFile, `${chauffeurId}/${timestamp}.${ext}`);
      }

      if (audioBlob) {
        audioUrl = await uploadFile(audioBlob, `${chauffeurId}/${timestamp}.webm`);
      }

      await supabase.from('incidents').insert({
        course_id: courseId || null,
        chauffeur_id: chauffeurId,
        type: selectedType,
        description: '',
        photo_url: photoUrl,
        audio_url: audioUrl,
        user_id: userId,
      });
    } else {
      enqueue({
        table: 'incidents',
        type: 'insert',
        data: {
          course_id: courseId || null,
          chauffeur_id: chauffeurId,
          type: selectedType,
          description: '',
          photo_url: null,
          audio_url: null,
          user_id: userId,
        },
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
    <div className="absolute inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-shading" onClick={onClose} />

      <div className="relative mt-auto bg-canvas rounded-t-[12px] p-static-md max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 bg-contrast-low rounded-full mx-auto mb-static-sm" />

        {/* Media capture - photo or video */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFileChange(e, 'photo')}
          className="hidden"
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          onChange={(e) => handleFileChange(e, 'video')}
          className="hidden"
        />

        {mediaPreview ? (
          <div className="relative w-full h-[120px] rounded-[8px] overflow-hidden mb-static-sm">
            {mediaType === 'video' ? (
              <video src={mediaPreview} className="w-full h-full object-cover" controls />
            ) : (
              <img src={mediaPreview} alt="" className="w-full h-full object-cover" />
            )}
            <button
              type="button"
              onClick={removeMedia}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[rgba(0,0,0,0.7)] flex items-center justify-center"
            >
              <PIcon name="close" size="x-small" style={{ color: '#fff' }} />
            </button>
          </div>
        ) : (
          <div className="flex gap-static-sm mb-static-sm">
            <button
              type="button"
              onClick={handlePhotoCapture}
              className="flex-1 h-[80px] bg-surface rounded-[8px] flex flex-col items-center justify-center border border-dashed border-contrast-low active:bg-contrast-low transition-colors"
            >
              <PIcon name="camera" size="medium" color="contrast-medium" />
              <PText size="xx-small" color="contrast-medium" className="mt-static-xs">
                PHOTO
              </PText>
            </button>
            <button
              type="button"
              onClick={handleVideoCapture}
              className="flex-1 h-[80px] bg-surface rounded-[8px] flex flex-col items-center justify-center border border-dashed border-contrast-low active:bg-contrast-low transition-colors"
            >
              <PIcon name="video" size="medium" color="contrast-medium" />
              <PText size="xx-small" color="contrast-medium" className="mt-static-xs">
                VIDEO 30s
              </PText>
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-static-xs">
          <div className="flex items-center gap-static-xs">
            <div className="w-5 h-5 rounded-full bg-[#c0392b] flex items-center justify-center animate-pulse">
              <PIcon name="exclamation" size="x-small" style={{ color: '#fff' }} />
            </div>
            <PText size="x-small" weight="bold" color="notification-error">ALERT</PText>
          </div>
          <PText size="xx-small" color="contrast-medium">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </PText>
        </div>

        {/* Incident types grid */}
        <div className="grid grid-cols-3 gap-static-xs mt-static-xs">
          {INCIDENT_TYPES.map(({ type, icon, color }) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`flex flex-col items-center justify-center p-static-xs rounded-[8px] border-2 transition-all min-h-[82px] ${
                selectedType === type
                  ? 'border-[#c0392b] bg-canvas shadow-md scale-[1.04]'
                  : 'border-contrast-low bg-canvas hover:border-contrast-medium'
              }`}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${color}22`, border: `2px solid ${color}44` }}
              >
                <PIcon name={icon as any} size="medium" style={{ color }} />
              </div>
              <PText size="xx-small" weight="bold" align="center" className="mt-[4px] leading-tight">
                {type.replace(/_/g, ' ').toUpperCase()}
              </PText>
            </button>
          ))}
        </div>

        {/* Voice memo */}
        <div className="mt-static-sm">
          <div className="flex items-center gap-static-sm p-static-xs bg-surface rounded-[8px]">
            {!audioBlob && !isRecording && (
              <button
                type="button"
                onClick={startRecording}
                className="w-11 h-11 rounded-full bg-[#c0392b] flex items-center justify-center shrink-0 active:scale-95 transition-transform"
              >
                <PIcon name="microphone" size="small" style={{ color: '#fff' }} />
              </button>
            )}

            {isRecording && (
              <button
                type="button"
                onClick={stopRecording}
                className="w-11 h-11 rounded-full bg-[#c0392b] flex items-center justify-center shrink-0 animate-pulse"
              >
                <PIcon name="stop" size="small" style={{ color: '#fff' }} />
              </button>
            )}

            {audioBlob && !isRecording && (
              <button
                type="button"
                onClick={removeAudio}
                className="w-11 h-11 rounded-full bg-surface flex items-center justify-center shrink-0 border border-contrast-low"
              >
                <PIcon name="delete" size="small" color="notification-error" />
              </button>
            )}

            <div className="flex-1">
              {isRecording && (
                <div className="flex items-center gap-static-xs">
                  <div className="w-2 h-2 bg-[#c0392b] rounded-full animate-pulse" />
                  <PText size="x-small" weight="bold" color="notification-error">REC</PText>
                  <div className="flex-1 flex items-center gap-[2px] h-4 px-static-xs">
                    {Array.from({ length: 16 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-[3px] bg-[#c0392b] rounded-full animate-pulse"
                        style={{ height: `${Math.random() * 12 + 4}px`, animationDelay: `${i * 60}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {audioBlob && !isRecording && (
                <div className="flex items-center gap-static-xs">
                  <PIcon name="check" size="small" color="notification-success" />
                  <PText size="x-small" color="contrast-medium">
                    {formatTime(recordingTime)}
                  </PText>
                </div>
              )}
              {!audioBlob && !isRecording && (
                <PText size="x-small" color="contrast-medium">
                  MEMO 60s
                </PText>
              )}
            </div>

            <PText size="xx-small" color="contrast-medium" className="shrink-0">
              {formatTime(isRecording ? recordingTime : (audioBlob ? recordingTime : 0))}
            </PText>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-static-sm mt-static-md">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-static-sm rounded-[8px] font-bold text-center border-2 border-contrast-low text-primary bg-canvas active:bg-surface transition-colors"
          >
            <PIcon name="close" size="small" className="inline-block align-middle mr-static-xs" />
            <span className="align-middle">X</span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedType || sending}
            className={`flex-[2] py-static-sm rounded-[8px] font-bold text-white text-center text-lg transition-colors ${
              selectedType && !sending ? 'bg-[#c0392b] active:bg-[#922b21]' : 'bg-contrast-low text-contrast-medium'
            }`}
          >
            {sending ? '...' : 'SEND'}
          </button>
        </div>
      </div>
    </div>
  );
}
