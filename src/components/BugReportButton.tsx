import { useState, useRef, useEffect, useCallback } from 'react';
import { Bug, X, Send, Pencil, Eraser, Type } from 'lucide-react';
import html2canvas from 'html2canvas';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface BugReportButtonProps {
  user: User;
}

type DrawTool = 'pen' | 'eraser' | 'text';

export function BugReportButton({ user }: BugReportButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [titre, setTitre] = useState('');
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);

  async function handleOpen() {
    setCapturing(true);
    try {
      const canvas = await html2canvas(document.body, {
        ignoreElements: (el) => el.classList.contains('bug-report-btn'),
        useCORS: true,
        scale: window.devicePixelRatio || 2,
      });
      const dataUrl = canvas.toDataURL('image/png');
      setScreenshot(dataUrl);
      setNote('');
      setTitre('');
      setShowModal(true);
    } catch {
      setScreenshot(null);
      setNote('');
      setTitre('');
      setShowModal(true);
    } finally {
      setCapturing(false);
    }
  }

  async function handleSubmit(annotatedImage: string) {
    if (!titre.trim()) return;
    setSaving(true);
    try {
      await supabase.from('bugs').insert({
        user_id: user.id,
        titre: titre.trim(),
        description: note.trim(),
        screenshot_data: annotatedImage || screenshot || '',
        statut: 'open',
        priorite: 'medium',
      });
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={capturing}
        className="bug-report-btn fixed bottom-6 right-6 z-40 w-14 h-14 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group disabled:opacity-60"
        title="Signaler un bug"
      >
        {capturing ? (
          <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Bug className="w-6 h-6 group-hover:scale-110 transition-transform" />
        )}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-red-50 to-orange-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <Bug className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Signaler un bug</h2>
                  <p className="text-xs text-gray-500">Annotez la capture et decrivez le probleme</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {screenshot && (
                <AnnotationCanvas
                  image={screenshot}
                  titre={titre}
                  setTitre={setTitre}
                  note={note}
                  setNote={setNote}
                  onSubmit={handleSubmit}
                  saving={saving}
                  onClose={() => setShowModal(false)}
                />
              )}
              {!screenshot && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">La capture d'ecran n'a pas pu etre realisee.</p>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Titre du bug *</label>
                    <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Decrivez brievement le probleme..." className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Note</label>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Plus de details..." rows={3} className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none" />
                  </div>
                  <button onClick={() => handleSubmit('')} disabled={saving || !titre.trim()} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                    <Send className="w-4 h-4" /> {saving ? 'Envoi...' : 'Envoyer'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface AnnotationCanvasProps {
  image: string;
  titre: string;
  setTitre: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  onSubmit: (annotated: string) => void;
  onClose: () => void;
  saving: boolean;
}

function AnnotationCanvas({ image, titre, setTitre, note, setNote, onSubmit, onClose, saving }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState('#ef4444');
  const [lineWidth, setLineWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = image;
  }, [image]);

  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool === 'text') {
      const pos = getPos(e);
      setTextPos(pos);
      return;
    }
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = lineWidth * 4;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function handleMouseUp() {
    setIsDrawing(false);
  }

  function placeText() {
    if (!textPos || !textInput.trim()) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `bold ${lineWidth * 6}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(textInput, textPos.x, textPos.y);
    setTextInput('');
    setTextPos(null);
  }

  function handleReset() {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
  }

  function handleSubmit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSubmit(dataUrl);
  }

  const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#000000', '#ffffff'];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 bg-gray-100 rounded-xl p-2 flex-wrap">
        <button
          onClick={() => setTool('pen')}
          className={`p-2 rounded-lg transition-colors ${tool === 'pen' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
          title="Crayon"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => setTool('eraser')}
          className={`p-2 rounded-lg transition-colors ${tool === 'eraser' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
          title="Gomme"
        >
          <Eraser className="w-4 h-4" />
        </button>
        <button
          onClick={() => setTool('text')}
          className={`p-2 rounded-lg transition-colors ${tool === 'text' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-200'}`}
          title="Texte"
        >
          <Type className="w-4 h-4" />
        </button>

        <div className="h-6 w-px bg-gray-300 mx-1" />

        {colors.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? 'border-gray-900 scale-125' : 'border-gray-300'}`}
            style={{ backgroundColor: c }}
          />
        ))}

        <div className="h-6 w-px bg-gray-300 mx-1" />

        <input
          type="range"
          min="1"
          max="8"
          value={lineWidth}
          onChange={(e) => setLineWidth(parseInt(e.target.value))}
          className="w-20 accent-red-600"
        />

        <button
          onClick={handleReset}
          className="ml-auto text-xs text-gray-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
        >
          Reinitialiser
        </button>
      </div>

      {/* Canvas */}
      <div className="relative border border-gray-200 rounded-xl overflow-hidden bg-gray-900">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full cursor-crosshair block"
        />
      </div>

      {/* Text input overlay */}
      {textPos && tool === 'text' && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && placeText()}
            placeholder="Tapez votre texte puis Entree..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
            autoFocus
          />
          <button onClick={placeText} className="px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors">
            OK
          </button>
        </div>
      )}

      {/* Title & Note */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Titre du bug *</label>
          <input
            type="text"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Ex: Le bouton de validation ne fonctionne pas..."
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Decrivez le probleme, etapes pour reproduire..."
            rows={2}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm">
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving || !titre.trim()}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
        >
          <Send className="w-4 h-4" /> {saving ? 'Envoi...' : 'Envoyer le rapport'}
        </button>
      </div>
    </div>
  );
}
