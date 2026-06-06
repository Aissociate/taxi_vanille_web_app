import { useState } from 'react';
import { PHeading, PText, PIcon, PSpinner } from '@porsche-design-system/components-react';
import { supabase } from '../lib/supabase';

interface Props {
  chauffeurId: string;
  type: 'debut_mois' | 'fin_mois';
  mois: string;
  onComplete: () => void;
}

export default function KilometrageScreen({ chauffeurId, type, mois, onComplete }: Props) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleDigit = (digit: string) => {
    if (value.length < 7) {
      setValue((v) => v + digit);
    }
  };

  const handleDelete = () => {
    setValue((v) => v.slice(0, -1));
  };

  const handleSubmit = async () => {
    const km = parseInt(value, 10);
    if (!km || km < 0) {
      setError('Invalid');
      return;
    }

    setSending(true);
    setError('');

    const { error: dbError } = await supabase.from('kilometrage').insert({
      chauffeur_id: chauffeurId,
      km_value: km,
      type,
      mois,
    });

    if (dbError) {
      setError(dbError.code === '23505' ? 'Already submitted' : 'Error');
      setSending(false);
      return;
    }

    setSending(false);
    onComplete();
  };

  const isStart = type === 'debut_mois';
  const monthLabel = new Date(mois + '-01').toLocaleDateString('en', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-static-md">
      <div className="w-full max-w-[400px]">
        {/* Icon */}
        <div className="flex justify-center mb-static-md">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isStart ? 'bg-[#e8f5e9]' : 'bg-[#fff3e0]'}`}>
            <PIcon
              name="car"
              size="large"
              style={{ color: isStart ? '#2e7d32' : '#e65100' }}
            />
          </div>
        </div>

        {/* Title */}
        <PHeading size="medium" tag="h1" align="center">
          {isStart ? 'START MILEAGE' : 'END MILEAGE'}
        </PHeading>
        <PText size="small" align="center" color="contrast-medium" className="mt-static-xs">
          {monthLabel}
        </PText>
        <PText size="x-small" align="center" color="contrast-medium" className="mt-static-sm">
          {isStart
            ? 'Enter your current odometer reading to start the month.'
            : 'Enter your current odometer reading to close the month.'}
        </PText>

        {/* Display */}
        <div className="mt-static-lg bg-surface rounded-[8px] p-static-md text-center">
          <PText size="xx-small" color="contrast-medium" className="mb-static-xs">KM</PText>
          <div className="text-4xl font-bold tracking-wider text-primary min-h-[48px]">
            {value || '------'}
          </div>
        </div>

        {/* Error */}
        {error && (
          <PText size="x-small" color="notification-error" align="center" className="mt-static-sm">
            {error}
          </PText>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-static-sm mt-static-md">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-14 rounded-[8px] border border-contrast-low bg-canvas text-xl font-bold active:bg-surface transition-colors"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-[8px] border border-contrast-low bg-canvas text-xl font-bold active:bg-surface transition-colors col-start-2"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-14 rounded-[8px] border border-contrast-low bg-canvas flex items-center justify-center active:bg-surface transition-colors"
          >
            <PIcon name="arrow-left" size="small" />
          </button>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value || sending}
          className={`w-full mt-static-lg py-static-md rounded-[8px] font-bold text-lg text-white transition-colors ${
            value && !sending
              ? isStart ? 'bg-[#2e7d32] active:bg-[#1b5e20]' : 'bg-[#e65100] active:bg-[#bf360c]'
              : 'bg-contrast-low text-contrast-medium'
          }`}
        >
          {sending ? <PSpinner size="small" /> : 'CONFIRM'}
        </button>
      </div>
    </div>
  );
}
