import { useState, useEffect } from 'react';
import { ArrowLeft, Timer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { setAuth, useAuth } from '../lib/timerStore';
import type { Chauffeur } from '../../mobile/lib/types';

interface Props {
  onNavigate: (path: string) => void;
}

// Login de l'app TIMER : meme verification serveur (RPC chauffeur_login) que
// l'app chauffeur, MAIS session isolee (timerStore) et role chauffeur seulement.
export default function TimerLoginPage({ onNavigate }: Props) {
  const { chauffeur: existing } = useAuth();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'code' | 'pin'>('code');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (existing) onNavigate('/timer/planning');
  }, [existing, onNavigate]);

  const handleLogin = async (pinCode: string) => {
    setLoading(true);
    setError('');
    const { data, error: fetchError } = await supabase.rpc('chauffeur_login', {
      p_code: code.trim().toUpperCase(),
      p_pin: pinCode,
      p_role: 'chauffeur',
    });
    if (fetchError || !data) {
      setError(fetchError?.message?.includes('too_many_attempts')
        ? 'Trop de tentatives. Reessayez dans 15 minutes.'
        : 'Code ou PIN incorrect');
      setPin('');
      setLoading(false);
      return;
    }
    setAuth(data as Chauffeur);
    setLoading(false);
    onNavigate('/timer/planning');
  };

  const handlePinDigit = (digit: string) => {
    setError('');
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) handleLogin(newPin);
    }
  };

  return (
    <div className="min-h-screen bg-indigo-950 flex flex-col items-center px-4 pt-10 text-white">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="flex items-center gap-2 bg-indigo-600 px-4 py-1.5 rounded-full">
          <Timer size={18} />
          <span className="text-sm font-black tracking-widest uppercase">Mode Timer</span>
        </div>
        <h1 className="text-2xl font-bold mt-6">Taxi Vanille Timer</h1>
        <p className="text-xs text-indigo-300 mt-1 uppercase tracking-wide">Mesure des temps de passage</p>

        {step === 'code' ? (
          <>
            <div className="mt-10 w-full">
              <label className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wide">Code chauffeur</label>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) setStep('pin'); }}
                placeholder="Ex: T1"
                autoFocus
                autoCapitalize="characters"
                className="mt-2 w-full rounded-lg p-4 text-[28px] font-bold text-center uppercase bg-indigo-900 border border-indigo-700 text-white placeholder-indigo-500 focus:outline-none focus:border-indigo-400"
              />
            </div>
            {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
            <button
              type="button"
              onClick={() => code.trim() && setStep('pin')}
              disabled={!code.trim()}
              className="mt-6 w-full bg-indigo-600 py-4 rounded-lg font-bold text-lg disabled:opacity-40 active:bg-indigo-700"
            >
              Suivant
            </button>
          </>
        ) : (
          <>
            <p className="mt-10 text-[10px] font-semibold text-indigo-300 uppercase text-center">Code PIN - {code.toUpperCase()}</p>
            <div className="mt-3 flex gap-3 justify-center">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`w-14 h-14 rounded-lg flex items-center justify-center ${pin[i] ? 'bg-indigo-500' : 'border-2 border-indigo-700'}`}>
                  {pin[i] && <div className="w-3 h-3 bg-white rounded-full" />}
                </div>
              ))}
            </div>
            {error && <p className="mt-2 text-sm text-red-300 text-center">{error}</p>}
            <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-[280px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button key={num} type="button" onClick={() => handlePinDigit(num)} disabled={loading}
                  className="h-16 rounded-lg bg-indigo-900 border border-indigo-700 text-2xl font-semibold active:bg-indigo-800">{num}</button>
              ))}
              <div />
              <button type="button" onClick={() => handlePinDigit('0')} disabled={loading}
                className="h-16 rounded-lg bg-indigo-900 border border-indigo-700 text-2xl font-semibold active:bg-indigo-800">0</button>
              <button type="button" onClick={() => setPin((p) => p.slice(0, -1))}
                className="h-16 rounded-lg flex items-center justify-center active:bg-indigo-800"><ArrowLeft size={20} /></button>
            </div>
            <button type="button" onClick={() => { setStep('code'); setPin(''); setError(''); }} className="mt-4 text-sm text-indigo-300 underline">Retour</button>
          </>
        )}
        <p className="mt-6 text-[10px] text-indigo-400 uppercase">Hors-ligne autorise</p>
      </div>
    </div>
  );
}
