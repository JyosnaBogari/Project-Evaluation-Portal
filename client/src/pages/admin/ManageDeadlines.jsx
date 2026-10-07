import React, { useEffect, useState } from 'react';
import { getDeadlines, createDeadline } from '../../services/adminService';
import { formatDate } from '../../utils/formatters';
import { Calendar, Plus, Clock, Loader2, AlertCircle } from 'lucide-react';

export default function ManageDeadlines() {
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form states
  const [formOpen, setFormOpen] = useState(false);
  const [batch, setBatch] = useState('Batch 2026');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const fetchDeadlinesList = async () => {
    try {
      setLoading(true);
      const data = await getDeadlines();
      setDeadlines(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load deadlines:', err);
      setError('Unable to fetch timelines registry list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeadlinesList();
  }, []);

  const handleCreateDeadline = async (e) => {
    e.preventDefault();
    setFormError(null);

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return setFormError('Start date must be earlier than the end date.');
    }

    setSubmitting(true);
    try {
      await createDeadline({
        batch,
        title,
        submissionStartDate: startDate,
        submissionEndDate: endDate,
      });

      // Reset
      setTitle('');
      setStartDate('');
      setEndDate('');
      setFormOpen(false);
      
      // Refresh
      fetchDeadlinesList();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to establish submission deadline schedule.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Submission Windows</h1>
          <p className="text-[var(--text-secondary)] text-sm">Schedule locks and upload constraints per student cohorts.</p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-blue-500/10"
        >
          <Plus className="w-4 h-4" />
          Schedule Deadline
        </button>
      </div>

      {/* Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleCreateDeadline} className="w-full max-w-md glass-panel-glow p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-900 animate-in fade-in zoom-in-95 duration-200 space-y-4">
            <h3 className="text-base font-bold">Configure Submission Window</h3>

            {formError && (
              <div className="p-3 text-xs rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex gap-2 items-center">
                <AlertCircle className="w-4 h-4" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Target Student Cohort (Batch)</label>
              <select
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-white focus:outline-none"
              >
                <option value="Batch 2026">Batch 2026</option>
                <option value="Batch 2027">Batch 2027</option>
                <option value="Batch 2028">Batch 2028</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Deadline Name</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-white focus:outline-none"
                placeholder="e.g. Abstract Submission Window"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Open Window Date</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Closing Cutoff Date</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-white focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 border border-slate-800 rounded-xl text-xs font-semibold cursor-pointer text-slate-400 hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Schedule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Deadlines list */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-12 bg-slate-800/40 rounded-xl"></div>
          <div className="h-12 bg-slate-800/40 rounded-xl"></div>
        </div>
      ) : deadlines.length > 0 ? (
        <div className="glass-panel rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-900">
                <tr>
                  <th className="px-6 py-4">Timeline Description</th>
                  <th className="px-6 py-4">Cohort (Batch)</th>
                  <th className="px-6 py-4">Submission Start</th>
                  <th className="px-6 py-4">Submission Cutoff</th>
                  <th className="px-6 py-4">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-900">
                {deadlines.map(d => (
                  <tr key={d._id} className="hover:bg-slate-500/5 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                      <span>{d.title}</span>
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-400">{d.batch}</td>
                    <td className="px-6 py-4 text-xs text-slate-400">{formatDate(d.submissionStartDate)}</td>
                    <td className="px-6 py-4 text-xs text-slate-400">{formatDate(d.submissionEndDate)}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        d.isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}>
                        {d.isActive ? 'ACTIVE' : 'ARCHIVED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-panel p-8 text-center text-slate-400">No scheduled submission timelines found.</div>
      )}
    </div>
  );
}
