import { CheckCircle2, Plus, Save } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { FeedbackBanner, PageHeader, StatusText, TableSkeleton } from '../components/UiPrimitives';
import { api } from '../lib/api';

export function YearsTermsPage() {
  const [years, setYears] = useState<Array<{ id: number; year_label: string; start_date: string; end_date: string; is_active: number; is_archived: number }>>([]);
  const [terms, setTerms] = useState<Array<{ id: number; academic_year_id: number; year_label: string; name: string; term_number: number; start_date: string; end_date: string; next_term_begins: string | null; is_active: number; is_archived: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [newYear, setNewYear] = useState({ yearLabel: '', startDate: '2027-02-01', endDate: '2027-12-03' });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = () => {
    setLoading(true);
    api.get('/academics/years-terms').then((res) => {
      setYears(res.data.years || []);
      setTerms(res.data.terms || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const createYear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/academics/years', newYear);
      setFeedback({ type: 'success', message: `Academic year ${newYear.yearLabel} created with Terms I–III.` });
      setNewYear({ yearLabel: '', startDate: '2027-02-01', endDate: '2027-12-03' });
      loadData();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed.' });
    }
  };

  const activateTerm = async (termId: number) => {
    const res = await api.post(`/academics/terms/${termId}/activate`);
    setFeedback({ type: 'success', message: res.data.message });
    loadData();
  };

  const updateTerm = async (term: (typeof terms)[0]) => {
    await api.put(`/academics/terms/${term.id}`, {
      startDate: term.start_date,
      endDate: term.end_date,
      nextTermBegins: term.next_term_begins,
      isArchived: Boolean(term.is_archived),
    });
    setFeedback({ type: 'success', message: `Saved schedule for ${term.year_label} ${term.name}.` });
    loadData();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic Years & Terms"
        subtitle="Manage school academic calendars, Term I–III opening/closing dates, active period switching, and archiving."
      />
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      <form onSubmit={createYear} className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end gap-3 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">New Academic Year Label*</label>
          <input required placeholder="e.g. 2027" value={newYear.yearLabel} onChange={(e) => setNewYear({ ...newYear, yearLabel: e.target.value })} className="px-3 py-1.5 border border-slate-200 rounded-md w-36" />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Start Date</label>
          <input type="date" required value={newYear.startDate} onChange={(e) => setNewYear({ ...newYear, startDate: e.target.value })} className="px-3 py-1.5 border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">End Date</label>
          <input type="date" required value={newYear.endDate} onChange={(e) => setNewYear({ ...newYear, endDate: e.target.value })} className="px-3 py-1.5 border border-slate-200 rounded-md" />
        </div>
        <button type="submit" className="px-4 py-1.5 bg-[#0F2547] text-white font-semibold rounded-md inline-flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          <span>Create Academic Year</span>
        </button>
      </form>

      {loading ? <TableSkeleton rows={5} cols={6} /> : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-3 px-4">Year</th>
                <th className="py-3 px-4">Term</th>
                <th className="py-3 px-4">Opening Date</th>
                <th className="py-3 px-4">Closing Date</th>
                <th className="py-3 px-4">Next Term Begins</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {terms.map((t, idx) => (
                <tr key={t.id}>
                  <td className="py-2.5 px-4 font-mono font-bold text-[#0F2547]">{t.year_label}</td>
                  <td className="py-2.5 px-4 font-semibold">{t.name}</td>
                  <td className="py-2.5 px-4">
                    <input
                      type="date"
                      value={t.start_date}
                      onChange={(e) => {
                        const copy = [...terms];
                        copy[idx] = { ...t, start_date: e.target.value };
                        setTerms(copy);
                      }}
                      className="px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      type="date"
                      value={t.end_date}
                      onChange={(e) => {
                        const copy = [...terms];
                        copy[idx] = { ...t, end_date: e.target.value };
                        setTerms(copy);
                      }}
                      className="px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <input
                      type="date"
                      value={t.next_term_begins || ''}
                      onChange={(e) => {
                        const copy = [...terms];
                        copy[idx] = { ...t, next_term_begins: e.target.value };
                        setTerms(copy);
                      }}
                      className="px-2 py-1 border border-slate-200 rounded font-mono text-xs"
                    />
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusText status={t.is_active ? 'ACTIVE' : t.is_archived ? 'ARCHIVED' : 'INACTIVE'} />
                  </td>
                  <td className="py-2.5 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => updateTerm(t)}
                      className="px-2.5 py-1 border border-slate-200 rounded text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                    >
                      <Save className="w-3 h-3" />
                      <span>Save</span>
                    </button>
                    {!t.is_active && (
                      <button
                        type="button"
                        onClick={() => activateTerm(t.id)}
                        className="px-2.5 py-1 bg-[#1D4ED8] text-white rounded font-semibold hover:bg-[#2563EB] inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Activate</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ExaminationsGradingPage() {
  const [exams, setExams] = useState<
    Array<{
      id: number;
      name: string;
      code: string;
      year_label: string;
      term_name: string;
      grading_scale_name: string;
      submission_deadline: string | null;
      ranking_enabled: number;
      is_active: number;
      categories: Array<{ id: number; name: string; code: string; max_marks: number; weight_percentage: number }>;
    }>
  >([]);
  const [scales, setScales] = useState<
    Array<{
      id: number;
      name: string;
      level: string;
      is_default: number;
      boundaries: Array<{ id?: number; grade: string; min_score: number; max_score: number; points: number; descriptor: string; remarks: string | null }>;
    }>
  >([]);
  const [years, setYears] = useState<Array<{ id: number; year_label: string }>>([]);
  const [terms, setTerms] = useState<Array<{ id: number; academic_year_id: number; name: string }>>([]);
  const [tab, setTab] = useState<'exams' | 'grading'>('exams');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [newExam, setNewExam] = useState({
    academicYearId: '',
    termId: '',
    name: '',
    code: '',
    gradingScaleId: '',
    submissionDeadline: '',
    rankingEnabled: true,
    aggregateEnabled: true,
    categories: [
      { name: 'Coursework', code: 'CW', maxMarks: 20, weightPercentage: 20 },
      { name: 'Mid-Term Test', code: 'MID', maxMarks: 30, weightPercentage: 30 },
      { name: 'End of Term Exam', code: 'EOT', maxMarks: 100, weightPercentage: 50 },
    ],
  });

  const loadAll = async () => {
    const [exRes, gsRes, ytRes] = await Promise.all([
      api.get('/academics/examinations'),
      api.get('/academics/grading-scales'),
      api.get('/academics/years-terms'),
    ]);
    setExams(exRes.data.examinations || []);
    setScales(gsRes.data.scales || []);
    setYears(ytRes.data.years || []);
    setTerms(ytRes.data.terms || []);

    const actYr = (ytRes.data.years || []).find((y: { is_active: number }) => y.is_active === 1);
    const actTr = (ytRes.data.terms || []).find((t: { is_active: number }) => t.is_active === 1);
    const defScale = (gsRes.data.scales || [])[0];
    setNewExam((prev) => ({
      ...prev,
      academicYearId: prev.academicYearId || String(actYr?.id || ''),
      termId: prev.termId || String(actTr?.id || ''),
      gradingScaleId: prev.gradingScaleId || String(defScale?.id || ''),
    }));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const createExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/academics/examinations', {
        ...newExam,
        academicYearId: Number(newExam.academicYearId),
        termId: Number(newExam.termId),
        gradingScaleId: Number(newExam.gradingScaleId),
      });
      setFeedback({ type: 'success', message: 'Examination and weighted assessment categories created.' });
      setNewExam((p) => ({ ...p, name: '', code: '' }));
      loadAll();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create exam.' });
    }
  };

  const saveScaleBoundaries = async (scaleId: number, boundaries: (typeof scales)[0]['boundaries']) => {
    try {
      await api.put(`/academics/grading-scales/${scaleId}/boundaries`, {
        boundaries: boundaries.map((b) => ({
          grade: b.grade,
          minScore: Number(b.min_score),
          maxScore: Number(b.max_score),
          points: Number(b.points),
          descriptor: b.descriptor,
          remarks: b.remarks,
        })),
      });
      setFeedback({ type: 'success', message: 'Configurable grading boundaries saved.' });
      loadAll();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save boundaries.' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examinations, Assessments & Grading Scales"
        subtitle="Configure examinations, weighted assessment structures, submission deadlines, and grading boundaries."
      />

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setTab('exams')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${tab === 'exams' ? 'bg-white text-[#0F2547] shadow-sm font-semibold' : 'text-slate-600'}`}
        >
          Examinations &amp; Assessments
        </button>
        <button
          type="button"
          onClick={() => setTab('grading')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${tab === 'grading' ? 'bg-white text-[#0F2547] shadow-sm font-semibold' : 'text-slate-600'}`}
        >
          Configurable Grading Scales
        </button>
      </div>

      {tab === 'exams' ? (
        <div className="space-y-6">
          <form onSubmit={createExam} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-[#0F2547]">Configure New Examination</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Academic Year</label>
                <select value={newExam.academicYearId} onChange={(e) => setNewExam({ ...newExam, academicYearId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
                  {years.map((y) => <option key={y.id} value={y.id}>{y.year_label}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Term</label>
                <select value={newExam.termId} onChange={(e) => setNewExam({ ...newExam, termId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
                  {terms.filter((t) => t.academic_year_id === Number(newExam.academicYearId)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Examination Name*</label>
                <input required placeholder="Mid-Term II Exam 2026" value={newExam.name} onChange={(e) => setNewExam({ ...newExam, name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Code*</label>
                <input required placeholder="MID-2026-T2" value={newExam.code} onChange={(e) => setNewExam({ ...newExam, code: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono uppercase" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Grading Scale</label>
                <select value={newExam.gradingScaleId} onChange={(e) => setNewExam({ ...newExam, gradingScaleId: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
                  {scales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="font-semibold text-slate-700 mb-2">Assessment Categories (Weights must sum to 100%)</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {newExam.categories.map((cat, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-md p-3 space-y-2 bg-slate-50/50">
                    <div className="flex gap-2">
                      <input
                        value={cat.name}
                        onChange={(e) => {
                          const cats = [...newExam.categories];
                          cats[idx].name = e.target.value;
                          setNewExam({ ...newExam, categories: cats });
                        }}
                        placeholder="Category Name"
                        className="flex-1 px-2 py-1 border border-slate-200 rounded bg-white"
                      />
                      <input
                        value={cat.code}
                        onChange={(e) => {
                          const cats = [...newExam.categories];
                          cats[idx].code = e.target.value;
                          setNewExam({ ...newExam, categories: cats });
                        }}
                        placeholder="Code"
                        className="w-16 px-2 py-1 border border-slate-200 rounded bg-white font-mono"
                      />
                    </div>
                    <div className="flex gap-2">
                      <label className="flex-1">
                        <span className="text-[11px] text-slate-500">Max Marks</span>
                        <input
                          type="number"
                          value={cat.maxMarks}
                          onChange={(e) => {
                            const cats = [...newExam.categories];
                            cats[idx].maxMarks = Number(e.target.value);
                            setNewExam({ ...newExam, categories: cats });
                          }}
                          className="w-full px-2 py-1 border border-slate-200 rounded bg-white font-mono"
                        />
                      </label>
                      <label className="flex-1">
                        <span className="text-[11px] text-slate-500">Weight %</span>
                        <input
                          type="number"
                          value={cat.weightPercentage}
                          onChange={(e) => {
                            const cats = [...newExam.categories];
                            cats[idx].weightPercentage = Number(e.target.value);
                            setNewExam({ ...newExam, categories: cats });
                          }}
                          className="w-full px-2 py-1 border border-slate-200 rounded bg-white font-mono"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={newExam.rankingEnabled} onChange={(e) => setNewExam({ ...newExam, rankingEnabled: e.target.checked })} />
                  <span>Enable Class Ranking</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={newExam.aggregateEnabled} onChange={(e) => setNewExam({ ...newExam, aggregateEnabled: e.target.checked })} />
                  <span>Enable Aggregate Calculation</span>
                </label>
              </div>
              <button type="submit" className="px-4 py-2 bg-[#0F2547] text-white font-semibold rounded-md">
                Create Examination
              </button>
            </div>
          </form>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Examination</th>
                  <th className="py-3 px-4">Academic Period</th>
                  <th className="py-3 px-4">Assessment Weights</th>
                  <th className="py-3 px-4">Grading Scale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map((ex) => (
                  <tr key={ex.id}>
                    <td className="py-3 px-4 font-mono font-bold text-[#0F2547]">{ex.code}</td>
                    <td className="py-3 px-4 font-semibold">{ex.name}</td>
                    <td className="py-3 px-4">{ex.year_label} · {ex.term_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {ex.categories.map((c) => `${c.code} (${c.weight_percentage}% / ${c.max_marks})`).join(' · ')}
                    </td>
                    <td className="py-3 px-4">{ex.grading_scale_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {scales.map((scale, sIdx) => (
            <div key={scale.id} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#0F2547]">{scale.name}</h3>
                  <p className="text-xs text-slate-500">Level: {scale.level} · Configurable boundary matrix</p>
                </div>
                <button
                  type="button"
                  onClick={() => saveScaleBoundaries(scale.id, scale.boundaries)}
                  className="px-3.5 py-1.5 bg-[#0F2547] text-white text-xs font-semibold rounded-md inline-flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Boundaries</span>
                </button>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 px-3">Grade</th>
                    <th className="py-2 px-3">Min Score</th>
                    <th className="py-2 px-3">Max Score</th>
                    <th className="py-2 px-3">Points</th>
                    <th className="py-2 px-3">Descriptor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scale.boundaries.map((b, bIdx) => (
                    <tr key={bIdx}>
                      <td className="py-2 px-3">
                        <input
                          value={b.grade}
                          onChange={(e) => {
                            const copy = [...scales];
                            copy[sIdx].boundaries[bIdx].grade = e.target.value;
                            setScales(copy);
                          }}
                          className="w-16 px-2 py-1 border border-slate-200 rounded font-bold"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.01"
                          value={b.min_score}
                          onChange={(e) => {
                            const copy = [...scales];
                            copy[sIdx].boundaries[bIdx].min_score = Number(e.target.value);
                            setScales(copy);
                          }}
                          className="w-24 px-2 py-1 border border-slate-200 rounded font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.01"
                          value={b.max_score}
                          onChange={(e) => {
                            const copy = [...scales];
                            copy[sIdx].boundaries[bIdx].max_score = Number(e.target.value);
                            setScales(copy);
                          }}
                          className="w-24 px-2 py-1 border border-slate-200 rounded font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          value={b.points}
                          onChange={(e) => {
                            const copy = [...scales];
                            copy[sIdx].boundaries[bIdx].points = Number(e.target.value);
                            setScales(copy);
                          }}
                          className="w-16 px-2 py-1 border border-slate-200 rounded font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          value={b.descriptor}
                          onChange={(e) => {
                            const copy = [...scales];
                            copy[sIdx].boundaries[bIdx].descriptor = e.target.value;
                            setScales(copy);
                          }}
                          className="w-full px-2 py-1 border border-slate-200 rounded"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
