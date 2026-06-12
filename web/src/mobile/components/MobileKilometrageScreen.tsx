import { useState } from 'react';
import { Car, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  chauffeurId: string;
  userId?: string;
  type: 'debut_mois' | 'fin_mois';
  mois: string;
  onComplete: () => void;
}

export default function MobileKilometrageScreen({ chauffeurId, userId, type, mois, onComplete }: Props) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleDigit = (digit: string) => {
    if (value.length < 7) setValue((v) => v + digit);
  };

  const handleDelete = () => {
    setValue((v) => v.slice(0, -1));
  };

  const handleSubmit = async () => {
    const km = parseInt(value, 10);
    if (isNaN(km) || km <= 0) { setError('Saisissez un nombre valide'); return; }
    setSending(true);
    setError('');

    const { error: dbError } = await supabase.from('kilometrage').insert({
      chauffeur_id: chauffeurId,
      km_value: km,
      type,
      mois,
      user_id: userId || null,
    });

    if (dbError && dbError.code !== '23505') {
      setError('Erreur lors de l\'enregistrement');
      setSending(false);
      return;
    }
    setSending(false);
    onComplete();
  };

  const isStart = type === 'debut_mois';
  const monthLabel = new Date(mois + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isStart ? 'bg-green-50' : 'bg-orange-50'}`}>
            <Car size={32} className={isStart ? 'text-green-700' : 'text-orange-700'} />
          </div>
        </div>

        <h1 className="text-xl font-bold text-center text-gray-900">
          {isStart ? 'KILOMETRAGE DEBUT' : 'KILOMETRAGE FIN'}
        </h1>
        <p className="text-sm text-center text-gray-500 mt-1">{monthLabel}</p>
        <p className="text-xs text-center text-gray-400 mt-2">
          {isStart
            ? 'Saisissez le compteur actuel pour demarrer le mois.'
            : 'Saisissez le compteur actuel pour cloturer le mois.'}
        </p>

        <div className="mt-6 bg-white rounded-lg p-4 text-center border border-gray-200">
          <p className="text-[10px] text-gray-400 mb-1">KM</p>
          <div className="text-4xl font-bold tracking-wider text-gray-900 min-h-[48px]">
            {value || '------'}
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600 text-center">{error}</p>}

        <div className="grid grid-cols-3 gap-3 mt-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" onClick={() => handleDigit(d)} className="h-14 rounded-lg border border-gray-200 bg-white text-xl font-bold active:bg-gray-100 transition-colors">
              {d}
            </button>
          ))}
          <button type="button" onClick={() => handleDigit('0')} className="h-14 rounded-lg border border-gray-200 bg-white text-xl font-bold active:bg-gray-100 transition-colors col-start-2">
            0
          </button>
          <button type="button" onClick={handleDelete} className="h-14 rounded-lg border border-gray-200 bg-white flex items-center justify-center active:bg-gray-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value || sending}
          className={`w-full mt-6 py-4 rounded-lg font-bold text-lg text-white transition-colors ${
            value && !sending
              ? isStart ? 'bg-green-700 active:bg-green-800' : 'bg-orange-600 active:bg-orange-700'
              : 'bg-gray-300 text-gray-500'
          }`}
        >
          {sending ? 'Envoi...' : 'CONFIRMER'}
        </button>
      </div>
    </div>
  );
}
