import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PHeading, PText, PIcon } from '@porsche-design-system/components-react';
import { supabase } from '../lib/supabase';
import { setAuth, useAuth } from '../lib/store';
import type { Chauffeur, UserRole } from '../lib/types';

export default function LoginPage() {
  const navigate = useNavigate();
  const { chauffeur: existingChauffeur, role: existingRole } = useAuth();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'code' | 'pin'>('code');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<UserRole>('chauffeur');

  useEffect(() => {
    if (existingChauffeur && existingRole) {
      navigate(existingRole === 'coordinateur' ? '/coordinator' : '/planning', { replace: true });
    }
  }, [existingChauffeur, existingRole, navigate]);

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
      navigate('/coordinator');
    } else {
      navigate('/planning');
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center px-static-md pt-static-xl">
      <div className="w-full flex flex-col items-center">
        {/* Role selector */}
        <div className="flex gap-static-sm mb-static-lg">
          <button
            type="button"
            onClick={() => setRole('chauffeur')}
            className={`px-static-md py-static-xs rounded-[4px] text-sm font-semibold transition-colors ${
              role === 'chauffeur'
                ? 'bg-[#1a1a1a] text-white'
                : 'bg-surface text-contrast-medium'
            }`}
          >
            CHAUFFEUR
          </button>
          <button
            type="button"
            onClick={() => setRole('coordinateur')}
            className={`px-static-md py-static-xs rounded-[4px] text-sm font-semibold transition-colors ${
              role === 'coordinateur'
                ? 'bg-[#1a1a1a] text-white'
                : 'bg-surface text-contrast-medium'
            }`}
          >
            COORDINATEUR
          </button>
        </div>

        {/* Logo */}
        <PHeading size="large" tag="h1" align="center">
          Taxi Vanille
        </PHeading>
        <PText size="x-small" align="center" color="contrast-medium">
          {role === 'chauffeur' ? 'ESPACE CHAUFFEUR' : 'ESPACE COORDINATEUR'}
        </PText>

        {step === 'code' ? (
          <>
            {/* Code input */}
            <div className="mt-static-xl w-full">
              <PText size="xx-small" weight="semi-bold" color="contrast-medium">
                CODE CHAUFFEUR
              </PText>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCodeSubmit(); }}
                placeholder="Ex: T1"
                autoFocus
                autoCapitalize="characters"
                className="mt-static-sm w-full border border-contrast-low rounded-[8px] p-static-md text-[28px] font-bold text-primary text-center uppercase bg-canvas focus:outline-none focus:border-[#e65c00] transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <PText size="x-small" color="notification-error" className="mt-static-sm">
                {error}
              </PText>
            )}

            {/* Submit */}
            <div className="mt-static-lg w-full">
              <button
                type="button"
                onClick={handleCodeSubmit}
                disabled={!code.trim()}
                className="w-full bg-[#e65c00] text-white py-static-md rounded-[8px] font-bold text-lg disabled:opacity-50 active:bg-[#cc5200] transition-colors"
              >
                Suivant
              </button>
            </div>
          </>
        ) : (
          <>
            {/* PIN entry */}
            <div className="mt-static-xl w-full">
              <PText size="xx-small" weight="semi-bold" color="contrast-medium">
                CODE PIN - {code.toUpperCase()}
              </PText>
              <div className="mt-static-sm flex gap-static-sm justify-center">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-14 h-14 rounded-[8px] flex items-center justify-center ${
                      pin[i]
                        ? 'bg-[#1a1a1a]'
                        : 'border-2 border-contrast-low'
                    }`}
                  >
                    {pin[i] && <div className="w-3 h-3 bg-white rounded-full" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <PText size="x-small" color="notification-error" className="mt-static-sm">
                {error}
              </PText>
            )}

            {/* Numpad */}
            <div className="mt-static-lg grid grid-cols-3 gap-static-sm w-full max-w-[280px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handlePinDigit(num)}
                  disabled={loading}
                  className="h-16 rounded-[8px] border border-contrast-low text-[24px] font-semibold text-primary hover:bg-surface active:bg-contrast-low transition-colors"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => handlePinDigit('0')}
                disabled={loading}
                className="h-16 rounded-[8px] border border-contrast-low text-[24px] font-semibold text-primary hover:bg-surface active:bg-contrast-low transition-colors"
              >
                0
              </button>
              <button
                type="button"
                onClick={handlePinBackspace}
                className="h-16 rounded-[8px] flex items-center justify-center hover:bg-surface active:bg-contrast-low transition-colors"
              >
                <PIcon name="arrow-left" color="primary" />
              </button>
            </div>

            {/* Back button */}
            <button
              type="button"
              onClick={() => { setStep('code'); setPin(''); setError(''); }}
              className="mt-static-md text-sm text-contrast-medium underline"
            >
              Retour
            </button>
          </>
        )}

        <PText size="xx-small" color="contrast-medium" className="mt-static-md">
          HORS-LIGNE AUTORISE
        </PText>
      </div>
    </div>
  );
}
