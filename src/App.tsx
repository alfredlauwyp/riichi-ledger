import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, X, Users, TrendingUp, History, Download, Calculator, Cloud, CloudOff } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
// Replace these with your actual Supabase credentials
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'SUPABASE_URL_PLACEHOLDER';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'SUPABASE_ANON_KEY_PLACEHOLDER';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function MahjongTracker() {
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [activeTab, setActiveTab] = useState('newGame');
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Session totals state
  const [selectedGamesForSession, setSelectedGamesForSession] = useState([]);
  
  // Game state
  const [selectedPlayers, setSelectedPlayers] = useState([null, null, null, null]);
  const [scores, setScores] = useState(['', '', '', '']);
  const [preset, setPreset] = useState('tenpin');
  const [umaSettings, setUmaSettings] = useState({ first: 30, second: 10, third: -10, fourth: -30 });
  const [pointValue, setPointValue] = useState(1);
  
  const presets = {
    tenpin: { uma: { first: 30, second: 10, third: -10, fourth: -30 }, pointValue: 1 },
    tengo: { uma: { first: 30, second: 10, third: -10, fourth: -30 }, pointValue: 0.5 },
    custom: { uma: { first: 0, second: 0, third: 0, fourth: 0 }, pointValue: 0 }
  };

  // 1. INITIAL LOAD FROM SUPABASE
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setIsSyncing(true);
    
    // Fetch Players
    const { data: playersData } = await supabase.from('players').select('*').order('name');
    if (playersData) setPlayers(playersData);

    // Fetch Games
    const { data: gamesData } = await supabase.from('games').select('*').order('date', { ascending: false });
    if (gamesData) setGames(gamesData);

    // Fetch Settings
    const { data: settingsData } = await supabase.from('settings').select('*').single();
    if (settingsData) {
      setPreset(settingsData.preset);
      setUmaSettings(settingsData.uma_settings);
      setPointValue(settingsData.point_value);
    }
    
    setIsSyncing(false);
  };

  // 2. SYNC SETTINGS WHEN THEY CHANGE
  const updateSettings = async (newPreset, newUma, newRate) => {
    setPreset(newPreset);
    setUmaSettings(newUma);
    setPointValue(newRate);
    
    await supabase.from('settings').update({
      preset: newPreset,
      uma_settings: newUma,
      point_value: newRate
    }).eq('id', 1);
  };

  const handlePresetChange = (presetName) => {
    const newUma = presetName !== 'custom' ? presets[presetName].uma : umaSettings;
    const newRate = presetName !== 'custom' ? presets[presetName].pointValue : pointValue;
    updateSettings(presetName, newUma, newRate);
  };

  // 3. PLAYER ACTIONS
  const addPlayer = async () => {
    if (newPlayerName.trim()) {
      setIsSyncing(true);
      const { data, error } = await supabase
        .from('players')
        .insert([{ name: newPlayerName.trim() }])
        .select();
      
      if (!error) setPlayers([...players, data[0]]);
      setNewPlayerName('');
      setIsSyncing(false);
    }
  };

  const deletePlayer = async (id) => {
    setIsSyncing(true);
    const { error } = await supabase.from('players').delete().eq('id', id);
    if (!error) setPlayers(players.filter(p => p.id !== id));
    setIsSyncing(false);
  };

  const updatePlayer = async (id, newName) => {
    setIsSyncing(true);
    const { error } = await supabase.from('players').update({ name: newName }).eq('id', id);
    if (!error) setPlayers(players.map(p => p.id === id ? { ...p, name: newName } : p));
    setEditingPlayer(null);
    setIsSyncing(false);
  };

  // 4. GAME ACTIONS
  const calculateResults = () => {
    const results = selectedPlayers.map((playerId, idx) => {
      const player = players.find(p => p.id === playerId);
      const score = parseInt(scores[idx]) || 0;
      const diff = score - 25000;
      return { player, score, diff };
    });

    const sorted = [...results].sort((a, b) => b.score - a.score);
    const umaValues = [umaSettings.first, umaSettings.second, umaSettings.third, umaSettings.fourth];
    
    return results.map(result => {
      const position = sorted.findIndex(s => s.player?.id === result.player?.id);
      const uma = umaValues[position];
      const pointDiff = result.diff / 1000;
      const totalPoints = pointDiff + uma;
      const money = totalPoints * pointValue;
      
      return { ...result, position: position + 1, uma, totalPoints, money };
    });
  };

  const recordGame = async () => {
    if (selectedPlayers.some(p => p === null) || scores.some(s => !s)) {
      alert('Please select all players and enter all scores');
      return;
    }

    const totalScore = scores.reduce((sum, s) => sum + parseInt(s), 0);
    if (totalScore !== 100000) {
      alert(`Total score must be 100,000. Current total: ${totalScore}`);
      return;
    }

    setIsSyncing(true);
    const results = calculateResults();
    const { data, error } = await supabase
      .from('games')
      .insert([{ results }])
      .select();

    if (!error) {
      setGames([data[0], ...games]);
      setScores(['', '', '', '']);
      setSelectedPlayers([null, null, null, null]);
      setActiveTab('history');
    }
    setIsSyncing(false);
  };

  const deleteGame = async (id) => {
    if (!window.confirm('Are you sure you want to delete this game?')) return;
    setIsSyncing(true);
    const { error } = await supabase.from('games').delete().eq('id', id);
    if (!error) setGames(games.filter(g => g.id !== id));
    setIsSyncing(false);
  };

  // ... (Keep existing Export and Session calculation functions as they don't need DB changes) ...
  const exportToJSON = () => {
    const data = { players, games, settings: { preset, uma: umaSettings, pointValue }, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riichi-ledger-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const exportHistoryToJSON = () => {
    const data = { games, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const calculateSessionTotals = () => {
    const totals = {};
    selectedGamesForSession.forEach(gameId => {
      const game = games.find(g => g.id === gameId);
      if (game) {
        game.results.forEach(result => {
          const playerId = result.player?.id;
          if (playerId) {
            if (!totals[playerId]) totals[playerId] = { name: result.player.name, totalMoney: 0, gamesPlayed: 0 };
            totals[playerId].totalMoney += result.money;
            totals[playerId].gamesPlayed += 1;
          }
        });
      }
    });
    return Object.values(totals).sort((a, b) => b.totalMoney - a.totalMoney);
  };

  const sessionTotals = calculateSessionTotals();
  const resultsPreview = selectedPlayers.every(p => p !== null) && scores.every(s => s) ? calculateResults() : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 relative">
            <div className="absolute top-4 right-4 flex items-center gap-2 text-xs bg-black/20 px-3 py-1 rounded-full">
              {isSyncing ? <Cloud className="animate-pulse" size={14} /> : <Cloud size={14} />}
              {isSyncing ? 'Syncing...' : 'Cloud Synced'}
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Riichi Ledger <span className="text-2xl">[槓 for Flow]</span></h1>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="flex border-b">
            {['newGame', 'session', 'players', 'history'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 px-4 font-medium capitalize ${
                  activeTab === tab ? 'bg-purple-50 text-purple-600 border-b-2 border-purple-600' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab === 'newGame' && <TrendingUp className="inline mr-2" size={18}/>}
                {tab === 'session' && <Calculator className="inline mr-2" size={18}/>}
                {tab === 'players' && <Users className="inline mr-2" size={18}/>}
                {tab === 'history' && <History className="inline mr-2" size={18}/>}
                {tab.replace(/([A-Z])/g, ' $1')}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* New Game Tab */}
            {activeTab === 'newGame' && (
              <div>
                <div className="mb-6 p-5 bg-purple-50 rounded-xl border border-purple-100">
                  <h3 className="font-bold text-lg mb-4">Scoring Preset</h3>
                  <select
                    value={preset}
                    onChange={(e) => handlePresetChange(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-purple-200 rounded-lg bg-white"
                  >
                    <option value="tenpin">Tenpin (30/10/-10/-30, $1.00/1k)</option>
                    <option value="tengo">Tengo (15/5/-5/-15, $0.50/1k)</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div className="space-y-4 mb-8">
                  {[0, 1, 2, 3].map(idx => (
                    <div key={idx} className="flex gap-3">
                       <select
                          value={selectedPlayers[idx] || ''}
                          onChange={(e) => {
                            const newSelected = [...selectedPlayers];
                            newSelected[idx] = e.target.value || null;
                            setSelectedPlayers(newSelected);
                          }}
                          className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg"
                        >
                          <option value="">Select Player</option>
                          {players.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={scores[idx]}
                          onChange={(e) => {
                            const newScores = [...scores];
                            newScores[idx] = e.target.value;
                            setScores(newScores);
                          }}
                          placeholder="Score"
                          className="w-32 px-4 py-3 border-2 border-gray-200 rounded-lg font-bold"
                        />
                    </div>
                  ))}
                </div>

                {resultsPreview && (
                   <div className="mb-6 p-5 bg-blue-50 rounded-xl border border-blue-200">
                    <h3 className="font-bold mb-4">Preview Results</h3>
                    {resultsPreview.map((r, i) => (
                      <div key={i} className="flex justify-between py-1">
                        <span>{r.player?.name}</span>
                        <span className={r.money >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                          ${r.money.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={recordGame}
                  disabled={isSyncing}
                  className="w-full bg-purple-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {isSyncing ? 'Saving to Cloud...' : '🎲 Record Game'}
                </button>
              </div>
            )}

            {/* Players Tab */}
            {activeTab === 'players' && (
              <div>
                <div className="flex gap-2 mb-6">
                  <input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="New player name"
                    className="flex-1 px-4 py-2 border rounded-lg"
                  />
                  <button onClick={addPlayer} className="bg-purple-600 text-white px-6 py-2 rounded-lg"><Plus/></button>
                </div>
                <div className="space-y-2">
                  {players.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="font-bold">{p.name}</span>
                      <button onClick={() => deletePlayer(p.id)} className="text-red-500"><Trash2 size={18}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div>
                <button
                  onClick={exportHistoryToJSON}
                  className="mb-6 flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium"
                >
                  <Download size={18} />
                  JSON
                </button>
                <div className="space-y-4">
                  {games.map(game => (
                    <div key={game.id} className="border p-4 rounded-lg relative">
                      <button onClick={() => deleteGame(game.id)} className="absolute top-4 right-4 text-red-400"><Trash2 size={16}/></button>
                      <div className="text-xs text-gray-500 mb-2">{new Date(game.date).toLocaleString()}</div>
                      {game.results.sort((a,b) => a.position - b.position).map((r, i) => (
                        <div key={i} className="flex justify-between items-center text-sm py-1 gap-4">
                          <span className="w-6">{r.position}.</span>
                          <div className="flex-1 flex items-center gap-2">
                            <span>{r.player?.name}</span>
                            <span className="text-gray-600 font-semibold">({r.score})</span>
                          </div>
                          <span className={`w-16 text-right font-semibold ${r.money >= 0 ? 'text-green-600' : 'text-red-600'}`}>{r.money >= 0 ? '$' : '-$'}{Math.abs(r.money).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Session Tab (Standard Logic) */}
            {activeTab === 'session' && (
               <div>
                <h3 className="font-bold mb-4">Select games to combine:</h3>
                <div className="space-y-2 mb-6">
                  {games.map(g => (
                    <div key={g.id} 
                         onClick={() => setSelectedGamesForSession(prev => prev.includes(g.id) ? prev.filter(id => id !== g.id) : [...prev, g.id])}
                         className={`p-3 border rounded-lg cursor-pointer ${selectedGamesForSession.includes(g.id) ? 'bg-purple-100 border-purple-500' : ''}`}>
                      {new Date(g.date).toLocaleDateString()} - {g.results.map(r => r.player?.name).join(', ')}
                    </div>
                  ))}
                </div>
                {sessionTotals.length > 0 && (
                  <div className="p-4 bg-gray-900 text-white rounded-lg">
                    <h4 className="font-bold mb-2">Session Totals</h4>
                    {sessionTotals.map((s, i) => (
                      <div key={i} className="flex justify-between border-b border-gray-700 py-2">
                        <span>{s.name} ({s.gamesPlayed}g)</span>
                        <span className={s.totalMoney >= 0 ? 'text-green-400' : 'text-red-400'}>${s.totalMoney.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}