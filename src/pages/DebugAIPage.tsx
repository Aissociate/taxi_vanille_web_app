import { Bot } from 'lucide-react';

export function DebugAIPage() {
  return (
    <div className="max-w-2xl mx-auto mt-20 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Bot className="w-8 h-8 text-emerald-600" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">DebugAI</h1>
      <p className="text-gray-500 mb-8">
        Resolution manuelle des bugs activee. L'IA analyse les bugs remontes en base de donnees,
        corrige le code source et repond aux utilisateurs.
      </p>
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        En attente de bugs ouverts
      </div>
    </div>
  );
}
