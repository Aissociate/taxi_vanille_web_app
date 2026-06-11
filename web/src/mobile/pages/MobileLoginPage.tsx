import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { setAuth, useAuth } from '../lib/store';
import type { Chauffeur, UserRole } from '../lib/types';

interface Props {
  onNavigate: (path: string) => void;
}

export default function MobileLoginPage({ onNavigate }: Props) {
  const { chauffeur: existingChauffeur, role: existingRole } = useAuth();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'code' | 'pin'>('code');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<UserRole>('chauffeur');

  useEffect(() => {
    if (existingChauffeur && existingRole) {
      onNavigate(existingRole === 'coordinateur' ? '/mobile/coordinator' : '/mobile/planning');
    }
  }, [existingChauffeur, existingRole, onNavigate]);

  const handleCodeSubmit = () => {
    if (code.trim()) {
      setStep('pin');
      setError('');
    }
  };

  const handlePinDigit = (digit: string) => {
    setError('');
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        handleLogin(newPin);
      }
    }
  };

  const handlePinBackspace = () => {
    setPin((p) => p.slice(0, -1));
  };

  const handleLogin = async (pinCode: string) => {
    setLoading(true);
    setError('');

    // Server-side verification (SECURITY DEFINER + rate limiting): the PIN is
    // checked in the database and never read back by the client.
    const { data, error: fetchError } = await supabase.rpc('chauffeur_login', {
      p_code: code.trim().toUpperCase(),
      p_pin: pinCode,
      p_role: role,
    });

    if (fetchError || !data) {
      setError(
        fetchError?.message?.includes('too_many_attempts')
          ? 'Trop de tentatives. Reessayez dans 15 minutes.'
          : 'Code ou PIN incorrect'
      );
      setPin('');
      setLoading(false);
      return;
    }

    const chauffeur = data as Chauffeur;
    setAuth(chauffeur, role);
    setLoading(false);

    if (role === 'coordinateur') {
      onNavigate('/mobile/coordinator');
    } else {
      onNavigate('/mobile/planning');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-4 pt-12">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Role selector */}
        <div className="flex gap-2 mb-8">
          <button
            type="button"
            onClick={() => setRole('chauffeur')}
            className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors ${
              role === 'chauffeur'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            CHAUFFEUR
          </button>
          <button
            type="button"
            onClick={() => setRole('coordinateur')}
            className={`px-4 py-1.5 rounded text-sm font-semibold transition-colors ${
              role === 'coordinateur'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            COORDINATEUR
          </button>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 text-center">Taxi Vanille</h1>
        <p className="text-xs text-gray-500 text-center mt-1">
          {role === 'chauffeur' ? 'ESPACE CHAUFFEUR' : 'ESPACE COORDINATEUR'}
        </p>

        {step === 'code' ? (
          <>
            <div className="mt-10 w-full">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                CODE CHAUFFEUR
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCodeSubmit(); }}
                placeholder="Ex: T1"
                autoFocus
                autoCapitalize="characters"
                className="mt-2 w-full border border-gray-300 rounded-lg p-4 text-[28px] font-bold text-gray-900 text-center uppercase bg-white focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-6 w-full">
              <button
                type="button"
                onClick={handleCodeSubmit}
                disabled={!code.trim()}
                className="w-full bg-orange-600 text-white py-4 rounded-lg font-bold text-lg disabled:opacity-50 active:bg-orange-700 transition-colors"
              >
                Suivant
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-10 w-full">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide text-center">
                CODE PIN - {code.toUpperCase()}
              </p>
              <div className="mt-3 flex gap-3 justify-center">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-14 h-14 rounded-lg flex items-center justify-center ${
                      pin[i] ? 'bg-gray-900' : 'border-2 border-gray-300'
                    }`}
                  >
                    {pin[i] && <div className="w-3 h-3 bg-white rounded-full" />}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-[280px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handlePinDigit(num)}
                  disabled={loading}
                  className="h-16 rounded-lg border border-gray-200 text-2xl font-semibold text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => handlePinDigit('0')}
                disabled={loading}
                className="h-16 rounded-lg border border-gray-200 text-2xl font-semibold text-gray-900 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                0
              </button>
              <button
                type="button"
                onClick={handlePinBackspace}
                className="h-16 rounded-lg flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => { setStep('code'); setPin(''); setError(''); }}
              className="mt-4 text-sm text-gray-500 underline"
            >
              Retour
            </button>
          </>
        )}

        <p className="mt-4 text-[10px] text-gray-400 uppercase">HORS-LIGNE AUTORISE</p>
      </div>
    </div>
  );
}
