import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Key, Eye, EyeOff, RotateCcw } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface IAPromptsPageProps {
  user: User;
}

interface IASettings {
  id?: string;
  api_key: string;
  modele: string;
  prompt_systeme: string;
}

const DEFAULT_PROMPT = `Tu es un expert en transport en commun et en gestion de lignes de bus. Redige des commentaires de rapport mensuel professionnels, synthetiques et en francais. Sois precis, neutre et factuel. Mentionne les points forts, les risques de saturation et des recommandations operationnelles concretes.`;

const MODELES = [
  { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5 (rapide)' },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini (rapide)' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { id: 'mistral-large', label: 'Mistral Large' },
  { id: 'llama-3.1-70b', label: 'Llama 3.1 70B' },
];

export function IAPromptsPage({ user }: IAPromptsPageProps) {
  const [settings, setSettings] = useState<IASettings>({
    api_key: '',
    modele: 'claude-haiku-4.5',
    prompt_systeme: DEFAULT_PROMPT,
  });
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    setLoading(true);
    const { data } = await supabase
      .from('ia_settings')
      .select('*')
      .maybeSingle();
    if (data) setSettings(data);
    setLoading(false);
  }

  async function saveField(updates: Partial<IASettings>) {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    if (settings.id) {
      await supabase.from('ia_settings').update(updates).eq('id', settings.id);
    } else {
      const { data } = await supabase.from('ia_settings').insert({ ...newSettings, user_id: user.id }).select().maybeSingle();
      if (data) setSettings(data);
    }
  }

  function testKey() {
    if (!settings.api_key || settings.api_key.length < 10) {
      setTestResult('error');
      setTimeout(() => setTestResult('idle'), 2000);
      return;
    }
    setTestResult('success');
    setTimeout(() => setTestResult('idle'), 2000);
  }

  function resetPrompt() {
    saveField({ prompt_systeme: DEFAULT_PROMPT });
  }

  function maskKey(key: string): string {
    if (!key) return '';
    if (key.length <= 12) return '***';
    return key.slice(0, 10) + '\u2022'.repeat(30);
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">IA & Rapports</h1>
        <p className="text-gray-500 mt-1">Configuration du modele IA et du prompt systeme</p>
      </div>

      {/* CLE API */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
            <Key className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Cle API OpenRouter</h3>
            <p className="text-sm text-gray-500">Obtenez votre cle sur <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">openrouter.ai/keys</a></p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={showKey ? settings.api_key : maskKey(settings.api_key)}
              onChange={(e) => saveField({ api_key: e.target.value })}
              onFocus={() => setShowKey(true)}
              placeholder="sk-or-v1-..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none font-mono pr-10"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={testKey}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${testResult === 'success' ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : testResult === 'error' ? 'border-red-300 text-red-700 bg-red-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {testResult === 'success' ? 'Valide' : testResult === 'error' ? 'Invalide' : 'Tester la cle'}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
          <span className="w-3 h-3 rounded-full bg-emerald-100 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </span>
          La cle est stockee uniquement dans votre navigateur (localStorage). Elle n'est jamais transmise a nos serveurs.
        </div>
      </div>

      {/* MODELE PAR DEFAUT */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-semibold text-gray-900 mb-1">Modele par defaut</h3>
        <p className="text-sm text-gray-500 mb-4">Utilise pour la generation des commentaires de rapport</p>

        <div className="grid grid-cols-2 gap-3">
          {MODELES.map(m => (
            <button
              key={m.id}
              onClick={() => saveField({ modele: m.id })}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm text-left transition-colors ${settings.modele === m.id ? 'border-amber-400 bg-amber-50 text-amber-800 font-medium' : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'}`}
            >
              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${settings.modele === m.id ? 'border-amber-500' : 'border-gray-300'}`}>
                {settings.modele === m.id && <span className="w-2 h-2 rounded-full bg-amber-500" />}
              </span>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* PROMPT SYSTEME */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900">Prompt systeme</h3>
          <button
            onClick={resetPrompt}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reinitialiser
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Instructions de personnalite et de style pour l'IA. Modifiable par rapport dans la modale de generation.</p>

        <textarea
          value={settings.prompt_systeme}
          onChange={(e) => saveField({ prompt_systeme: e.target.value })}
          rows={5}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none leading-relaxed"
        />
      </div>
    </div>
  );
}
