import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Bug, MessageCircle, Lightbulb, ThumbsUp, ThumbsDown, Send, Plus, X, ChevronDown, ChevronUp, Image, CheckCircle2 } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface DeveloppementPageProps {
  user: User;
}

interface BugRecord {
  id: string;
  user_id: string;
  titre: string;
  description: string;
  screenshot_data: string;
  statut: string;
  priorite: string;
  created_at: string;
}

interface BugResponse {
  id: string;
  bug_id: string;
  user_id: string;
  message: string;
  is_dev: boolean;
  created_at: string;
}

interface Proposal {
  id: string;
  user_id: string;
  titre: string;
  description: string;
  statut: string;
  created_at: string;
}

interface Vote {
  id: string;
  proposal_id: string;
  user_id: string;
  vote: number;
}

interface ProposalResponse {
  id: string;
  proposal_id: string;
  user_id: string;
  message: string;
  is_dev: boolean;
  created_at: string;
}

interface UserProfile {
  id: string;
  email: string;
}

type Tab = 'bugs' | 'proposals';

const STATUT_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: 'bg-red-100', text: 'text-red-700' },
  need_info: { bg: 'bg-blue-100', text: 'text-blue-700' },
  in_progress: { bg: 'bg-amber-100', text: 'text-amber-700' },
  resolved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  closed: { bg: 'bg-gray-100', text: 'text-gray-600' },
  proposed: { bg: 'bg-blue-100', text: 'text-blue-700' },
  planned: { bg: 'bg-amber-100', text: 'text-amber-700' },
  done: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
};

const STATUT_LABELS: Record<string, string> = {
  open: 'Ouvert',
  need_info: 'Demande de precisions',
  in_progress: 'En cours',
  resolved: 'Resolu',
  closed: 'Ferme',
  proposed: 'Propose',
  planned: 'Planifie',
  done: 'Termine',
  rejected: 'Rejete',
};

export function DeveloppementPage({ user }: DeveloppementPageProps) {
  const [tab, setTab] = useState<Tab>('bugs');
  const [bugs, setBugs] = useState<BugRecord[]>([]);
  const [responses, setResponses] = useState<BugResponse[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [proposalResponses, setProposalResponses] = useState<ProposalResponse[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBug, setExpandedBug] = useState<string | null>(null);
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);
  const [newResponse, setNewResponse] = useState('');
  const [newProposalResponse, setNewProposalResponse] = useState('');
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalTitre, setProposalTitre] = useState('');
  const [proposalDesc, setProposalDesc] = useState('');
  const [screenshotModal, setScreenshotModal] = useState<string | null>(null);

  useEffect(() => { loadAll(true); }, []);

  useEffect(() => {
    const handleFocus = () => loadAll(false);
    window.addEventListener('focus', handleFocus);
    const interval = setInterval(() => loadAll(false), 15000);
    return () => { window.removeEventListener('focus', handleFocus); clearInterval(interval); };
  }, []);

  async function loadAll(showLoader = false) {
    if (showLoader) setLoading(true);
    const [bRes, rRes, pRes, vRes, prRes, upRes] = await Promise.all([
      supabase.from('bugs').select('*').order('created_at', { ascending: false }),
      supabase.from('bug_responses').select('*').order('created_at', { ascending: true }),
      supabase.from('dev_proposals').select('*').order('created_at', { ascending: false }),
      supabase.from('proposal_votes').select('*'),
      supabase.from('proposal_responses').select('*').order('created_at', { ascending: true }),
      supabase.from('user_profiles').select('id, email'),
    ]);
    if (bRes.data) setBugs(bRes.data);
    if (rRes.data) setResponses(rRes.data);
    if (pRes.data) setProposals(pRes.data);
    if (vRes.data) setVotes(vRes.data);
    if (prRes.data) setProposalResponses(prRes.data);
    if (upRes.data) setUserProfiles(upRes.data);
    setLoading(false);
  }

  function getUserEmail(userId: string): string {
    const profile = userProfiles.find(p => p.id === userId);
    if (!profile) return 'Inconnu';
    const email = profile.email;
    const atIdx = email.indexOf('@');
    if (atIdx > 0) return email.substring(0, atIdx);
    return email;
  }

  async function updateBugStatut(bugId: string, newStatut: string) {
    await supabase.from('bugs').update({ statut: newStatut, updated_at: new Date().toISOString() }).eq('id', bugId);
    setBugs(bugs.map(b => b.id === bugId ? { ...b, statut: newStatut } : b));
  }

  async function updateProposalStatut(proposalId: string, newStatut: string) {
    await supabase.from('dev_proposals').update({ statut: newStatut }).eq('id', proposalId);
    setProposals(proposals.map(p => p.id === proposalId ? { ...p, statut: newStatut } : p));
  }

  async function sendResponse(bugId: string) {
    if (!newResponse.trim()) return;
    await supabase.from('bug_responses').insert({
      bug_id: bugId,
      user_id: user.id,
      message: newResponse.trim(),
      is_dev: false,
    });
    setNewResponse('');
    loadAll();
  }

  async function createProposal() {
    if (!proposalTitre.trim()) return;
    await supabase.from('dev_proposals').insert({
      user_id: user.id,
      titre: proposalTitre.trim(),
      description: proposalDesc.trim(),
      statut: 'proposed',
    });
    setProposalTitre('');
    setProposalDesc('');
    setShowProposalForm(false);
    loadAll();
  }

  async function sendProposalResponse(proposalId: string) {
    if (!newProposalResponse.trim()) return;
    await supabase.from('proposal_responses').insert({
      proposal_id: proposalId,
      user_id: user.id,
      message: newProposalResponse.trim(),
      is_dev: false,
    });
    setNewProposalResponse('');
    loadAll();
  }

  async function toggleVote(proposalId: string, voteValue: number) {
    const existing = votes.find(v => v.proposal_id === proposalId && v.user_id === user.id);
    if (existing) {
      if (existing.vote === voteValue) {
        await supabase.from('proposal_votes').delete().eq('id', existing.id);
      } else {
        await supabase.from('proposal_votes').update({ vote: voteValue }).eq('id', existing.id);
      }
    } else {
      await supabase.from('proposal_votes').insert({
        proposal_id: proposalId,
        user_id: user.id,
        vote: voteValue,
      });
    }
    loadAll();
  }

  function getVoteCount(proposalId: string) {
    return votes.filter(v => v.proposal_id === proposalId).reduce((sum, v) => sum + v.vote, 0);
  }

  function getUserVote(proposalId: string) {
    return votes.find(v => v.proposal_id === proposalId && v.user_id === user.id)?.vote || 0;
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-gray-500 uppercase font-semibold">Communaute</p>
        <h1 className="text-2xl font-bold text-gray-900">Developpement</h1>
        <p className="text-gray-500 mt-1">Bugs remontes, reponses des devs et propositions de la communaute</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('bugs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === 'bugs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <Bug className="w-4 h-4" /> Bugs ({bugs.length})
        </button>
        <button
          onClick={() => setTab('proposals')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === 'proposals' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <Lightbulb className="w-4 h-4" /> Propositions ({proposals.length})
        </button>
      </div>

      {/* Bugs Tab */}
      {tab === 'bugs' && (
        <div className="space-y-3">
          {bugs.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <Bug className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucun bug remonte pour le moment</p>
              <p className="text-xs text-gray-400 mt-1">Utilisez le bouton rouge en bas a droite pour signaler un bug</p>
            </div>
          )}

          {bugs.map(bug => {
            const bugResponses = responses.filter(r => r.bug_id === bug.id);
            const isExpanded = expandedBug === bug.id;
            const statusStyle = STATUT_COLORS[bug.statut] || STATUT_COLORS.open;

            return (
              <div key={bug.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div
                  className="px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                  onClick={() => setExpandedBug(isExpanded ? null : bug.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                          {STATUT_LABELS[bug.statut] || bug.statut}
                        </span>
                        <span className="text-[10px] text-gray-400">{new Date(bug.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{getUserEmail(bug.user_id)}</span>
                      </div>
                      <h3 className="font-semibold text-gray-900 truncate">{bug.titre}</h3>
                      {bug.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{bug.description}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      {bug.screenshot_data && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setScreenshotModal(bug.screenshot_data); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Voir la capture"
                        >
                          <Image className="w-4 h-4" />
                        </button>
                      )}
                      {bugResponses.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <MessageCircle className="w-3.5 h-3.5" /> {bugResponses.length}
                        </span>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {bug.screenshot_data && (
                      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <img
                          src={bug.screenshot_data}
                          alt="Screenshot"
                          className="max-h-64 rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setScreenshotModal(bug.screenshot_data)}
                        />
                      </div>
                    )}

                    {/* Status change */}
                    <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-500">Statut :</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(['open', 'need_info', 'in_progress', 'resolved', 'closed'] as const).map(s => {
                          const style = STATUT_COLORS[s];
                          const isActive = bug.statut === s;
                          return (
                            <button
                              key={s}
                              onClick={(e) => { e.stopPropagation(); updateBugStatut(bug.id, s); }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                isActive
                                  ? `${style.bg} ${style.text} ring-2 ring-offset-1 ring-current/20`
                                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                              }`}
                            >
                              {STATUT_LABELS[s]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Responses */}
                    <div className="px-5 py-3 space-y-3">
                      {bugResponses.length === 0 && (
                        <p className="text-xs text-gray-400 italic">Aucune reponse pour le moment</p>
                      )}
                      {bugResponses.map(r => (
                        <div key={r.id} className={`flex gap-3 ${r.is_dev ? '' : ''}`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${r.is_dev ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {r.is_dev ? 'D' : getUserEmail(r.user_id).charAt(0).toUpperCase()}
                          </div>
                          <div className={`flex-1 rounded-xl px-4 py-2.5 ${r.is_dev ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] font-semibold ${r.is_dev ? 'text-blue-600' : 'text-gray-500'}`}>
                                {r.is_dev ? 'Developpeur' : getUserEmail(r.user_id)}
                              </span>
                              <span className="text-[10px] text-gray-400">{new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <p className="text-sm text-gray-700">{r.message}</p>
                          </div>
                        </div>
                      ))}

                      {/* Response input */}
                      <div className="flex gap-2 pt-2">
                        <input
                          type="text"
                          value={expandedBug === bug.id ? newResponse : ''}
                          onChange={(e) => setNewResponse(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && sendResponse(bug.id)}
                          placeholder="Ajouter un commentaire..."
                          className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 outline-none"
                        />
                        <button
                          onClick={() => sendResponse(bug.id)}
                          disabled={!newResponse.trim()}
                          className="px-3 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors disabled:opacity-30"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Proposals Tab */}
      {tab === 'proposals' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowProposalForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-sm text-sm"
            >
              <Plus className="w-4 h-4" /> Proposer une idee
            </button>
          </div>

          {proposals.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <Lightbulb className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucune proposition pour le moment</p>
              <p className="text-xs text-gray-400 mt-1">Soumettez vos idees pour ameliorer l'application</p>
            </div>
          )}

          {proposals.map(p => {
            const count = getVoteCount(p.id);
            const userVote = getUserVote(p.id);
            const statusStyle = STATUT_COLORS[p.statut] || STATUT_COLORS.proposed;
            const pResponses = proposalResponses.filter(r => r.proposal_id === p.id);
            const isExpanded = expandedProposal === p.id;

            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex">
                  {/* Vote column */}
                  <div className="flex flex-col items-center justify-center px-4 py-4 border-r border-gray-100 bg-gray-50 min-w-[70px]">
                    <button
                      onClick={() => toggleVote(p.id, 1)}
                      className={`p-1.5 rounded-lg transition-colors ${userVote === 1 ? 'bg-emerald-100 text-emerald-600' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                    >
                      <ThumbsUp className="w-5 h-5" />
                    </button>
                    <span className={`text-lg font-bold my-1 ${count > 0 ? 'text-emerald-600' : count < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {count > 0 ? `+${count}` : count}
                    </span>
                    <button
                      onClick={() => toggleVote(p.id, -1)}
                      className={`p-1.5 rounded-lg transition-colors ${userVote === -1 ? 'bg-red-100 text-red-600' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                    >
                      <ThumbsDown className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div
                      className="px-5 py-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                      onClick={() => { setExpandedProposal(isExpanded ? null : p.id); setNewProposalResponse(''); }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                          {STATUT_LABELS[p.statut] || p.statut}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{getUserEmail(p.user_id)}</span>
                      </div>
                      <h3 className="font-semibold text-gray-900">{p.titre}</h3>
                      {p.description && <p className="text-sm text-gray-500 mt-1">{p.description}</p>}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-gray-400">
                          {votes.filter(v => v.proposal_id === p.id && v.vote === 1).length} pour
                          {' / '}
                          {votes.filter(v => v.proposal_id === p.id && v.vote === -1).length} contre
                        </span>
                        {pResponses.length > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-gray-400">
                            <MessageCircle className="w-3 h-3" /> {pResponses.length}
                          </span>
                        )}
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        {/* Status change */}
                        <div className="px-5 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
                          <CheckCircle2 className="w-4 h-4 text-gray-400" />
                          <span className="text-xs font-medium text-gray-500">Statut :</span>
                          <div className="flex items-center gap-1.5">
                            {(['proposed', 'planned', 'done', 'rejected'] as const).map(s => {
                              const style = STATUT_COLORS[s];
                              const isActive = p.statut === s;
                              return (
                                <button
                                  key={s}
                                  onClick={(e) => { e.stopPropagation(); updateProposalStatut(p.id, s); }}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                    isActive
                                      ? `${style.bg} ${style.text} ring-2 ring-offset-1 ring-current/20`
                                      : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                  }`}
                                >
                                  {STATUT_LABELS[s]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      <div className="px-5 py-4 space-y-3">
                        {pResponses.length === 0 && (
                          <p className="text-xs text-gray-400 italic">Aucune reponse pour le moment</p>
                        )}
                        {pResponses.map(r => (
                          <div key={r.id} className="flex gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${r.is_dev ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                              {r.is_dev ? 'D' : getUserEmail(r.user_id).charAt(0).toUpperCase()}
                            </div>
                            <div className={`flex-1 rounded-xl px-4 py-2.5 ${r.is_dev ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'}`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-semibold ${r.is_dev ? 'text-blue-600' : 'text-gray-500'}`}>
                                  {r.is_dev ? 'Developpeur' : getUserEmail(r.user_id)}
                                </span>
                                <span className="text-[10px] text-gray-400">{new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <p className="text-sm text-gray-700">{r.message}</p>
                            </div>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-2">
                          <input
                            type="text"
                            value={newProposalResponse}
                            onChange={(e) => setNewProposalResponse(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && sendProposalResponse(p.id)}
                            placeholder="Ajouter un commentaire..."
                            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <button
                            onClick={() => sendProposalResponse(p.id)}
                            disabled={!newProposalResponse.trim()}
                            className="px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-30"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Proposal form modal */}
      {showProposalForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Lightbulb className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="font-bold text-gray-900">Proposer une amelioration</h2>
              </div>
              <button onClick={() => setShowProposalForm(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Titre *</label>
                <input
                  type="text"
                  value={proposalTitre}
                  onChange={(e) => setProposalTitre(e.target.value)}
                  placeholder="Ex: Ajouter un mode sombre..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
                <textarea
                  value={proposalDesc}
                  onChange={(e) => setProposalDesc(e.target.value)}
                  placeholder="Decrivez votre idee en detail..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowProposalForm(false)} className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm">
                  Annuler
                </button>
                <button
                  onClick={createProposal}
                  disabled={!proposalTitre.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" /> Soumettre
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot modal with zoom */}
      {screenshotModal && (
        <ScreenshotZoomModal src={screenshotModal} onClose={() => setScreenshotModal(null)} />
      )}
    </div>
  );
}

function ScreenshotZoomModal({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(s => Math.min(5, Math.max(0.5, s + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...position };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({
      x: posStart.current.x + (e.clientX - dragStart.current.x),
      y: posStart.current.y + (e.clientY - dragStart.current.y),
    });
  };

  const handleMouseUp = () => setDragging(false);

  const resetZoom = () => { setScale(1); setPosition({ x: 0, y: 0 }); };

  return (
    <div
      className="fixed inset-0 bg-black/85 z-50 flex flex-col"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setScale(s => Math.min(5, s + 0.25))} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors">+</button>
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors">-</button>
          <button onClick={resetZoom} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-colors">Reset</button>
          <span className="text-white/60 text-xs ml-2">{Math.round(scale * 100)}%</span>
        </div>
        <button onClick={onClose} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
        onClick={(e) => { if (scale <= 1 && e.target === containerRef.current) setScale(2); }}
      >
        <img
          src={src}
          alt="Screenshot"
          className="max-w-full max-h-full rounded-lg select-none"
          draggable={false}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
          }}
        />
      </div>
      <p className="text-center text-white/40 text-xs pb-3">Molette pour zoomer - Cliquer-glisser pour deplacer</p>
    </div>
  );
}
