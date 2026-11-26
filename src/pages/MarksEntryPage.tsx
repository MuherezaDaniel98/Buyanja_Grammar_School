import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Save,
  Send,
  Upload,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  EmptyState,
  FeedbackBanner,
  PageHeader,
  StatusText,
  TableSkeleton,
} from '../components/UiPrimitives';
import { api, downloadProtectedFile } from '../lib/api';

interface Category {
  id: number;
  name: string;
  code: string;
  max_marks: number;
  weight_percentage: number;
}

interface Boundary {
  grade: string;
  min_score: number;
  max_score: number;
  descriptor: string;
}

interface GridStudent {
  id: number;
  admission_number: string;
  first_name: string;
  last_name: string;
}

interface CellState {
  score: string;
  statusFlag: 'PRESENT' | 'ABSENT' | 'EXEMPTED';
}

export function MarksEntryPage() {
  const [searchParams] = useSearchParams();

  const [exams, setExams] = useState<Array<{ id: number; name: string; code: string; year_label: string; term_name: string; is_active: number }>>([]);
  const [classes, setClasses] = useState<Array<{ id: number; name: string; code: string }>>([]);
  const [streams, setStreams] = useState<Array<{ id: number; class_id: number; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: number; code: string; name: string }>>([]);

  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState(searchParams.get('classId') || '');
  const [streamId, setStreamId] = useState(searchParams.get('streamId') || '');
  const [subjectId, setSubjectId] = useState(searchParams.get('subjectId') || '');

  const [loading, setLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  const [students, setStudents] = useState<GridStudent[]>([]);
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [submission, setSubmission] = useState<{
    status: string;
    version: number;
    dos_notes?: string | null;
    headteacher_notes?: string | null;
  }>({ status: 'DRAFT', version: 1 });
  const [versionHistory, setVersionHistory] = useState<Array<Record<string, unknown>>>([]);

  const [dirty, setDirty] = useState(false);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [teacherNotes, setTeacherNotes] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    categories: Category[];
    totalRows: number;
    validCount: number;
    invalidCount: number;
    rows: Array<{
      rowNumber: number;
      admissionNumber: string;
      studentId: number | null;
      studentName: string;
      statusFlag: 'PRESENT' | 'ABSENT' | 'EXEMPTED';
      scores: Record<string, number | null>;
      valid: boolean;
      errors: string[];
    }>;
  } | null>(null);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/academics/examinations'),
      api.get('/academics/classes-streams'),
      api.get('/academics/subjects'),
    ]).then(([exRes, csRes, subRes]) => {
      const exList = exRes.data.examinations || [];
      const clsList = csRes.data.classes || [];
      const strList = csRes.data.streams || [];
      const subList = subRes.data.subjects || [];
      setExams(exList);
      setClasses(clsList);
      setStreams(strList);
      setSubjects(subList);

      const actEx = exList.find((e: { is_active: number }) => e.is_active === 1) || exList[0];
      if (actEx && !examId) setExamId(String(actEx.id));
      if (!classId && clsList.length > 0) {
        const s2 = clsList.find((c: { code: string }) => c.code === 'S.2') || clsList[0];
        setClassId(String(s2.id));
        const firstStr = strList.find((s: { class_id: number }) => s.class_id === s2.id);
        if (firstStr && !streamId) setStreamId(String(firstStr.id));
      }
      if (!subjectId && subList.length > 0) {
        const mtc = subList.find((s: { code: string }) => s.code === 'MTC') || subList[0];
        setSubjectId(String(mtc.id));
      }
    });
  }, []);

  const loadGrid = useCallback(async () => {
    if (!examId || !classId || !streamId || !subjectId) return;
    setLoading(true);
    setGridError(null);
    setDirty(false);
    try {
      const res = await api.get('/marks/grid', {
        params: { examinationId: examId, classId, streamId, subjectId },
      });
      setCategories(res.data.categories || []);
      setBoundaries(res.data.boundaries || []);
      setStudents(res.data.students || []);
      setSubmission(res.data.submission || { status: 'DRAFT', version: 1 });
      setVersionHistory(res.data.versionHistory || []);

      const nextCells: Record<string, CellState> = {};
      for (const m of res.data.marks || []) {
        const key = `${m.student_id}:${m.assessment_category_id}`;
        nextCells[key] = {
          score: m.score !== null && m.score !== undefined ? String(m.score) : '',
          statusFlag: m.status_flag || 'PRESENT',
        };
      }
      setCells(nextCells);
      setSavingState('idle');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Unable to load marks sheet.';
      setGridError(msg);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [examId, classId, streamId, subjectId]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  const isLocked = ['SUBMITTED', 'VERIFIED', 'APPROVED', 'PUBLISHED'].includes(submission.status);

  const invalidCellKeys = useMemo(() => {
    const bad = new Set<string>();
    for (const stu of students) {
      for (const cat of categories) {
        const key = `${stu.id}:${cat.id}`;
        const c = cells[key];
        if (!c || c.statusFlag !== 'PRESENT' || c.score.trim() === '') continue;
        const num = Number(c.score);
        if (Number.isNaN(num) || num < 0 || num > cat.max_marks) {
          bad.add(key);
        }
      }
    }
    return bad;
  }, [cells, students, categories]);

  const saveDraft = useCallback(
    async (silent = false) => {
      if (isLocked || invalidCellKeys.size > 0 || !examId || !classId || !streamId || !subjectId) {
        return;
      }
      setSavingState('saving');
      const entries: Array<{
        studentId: number;
        assessmentCategoryId: number;
        score: number | null;
        statusFlag: 'PRESENT' | 'ABSENT' | 'EXEMPTED';
      }> = [];

      for (const stu of students) {
        for (const cat of categories) {
          const c = cells[`${stu.id}:${cat.id}`];
          if (!c) continue;
          if (c.statusFlag !== 'PRESENT') {
            entries.push({
              studentId: stu.id,
              assessmentCategoryId: cat.id,
              score: null,
              statusFlag: c.statusFlag,
            });
          } else if (c.score.trim() !== '') {
            entries.push({
              studentId: stu.id,
              assessmentCategoryId: cat.id,
              score: Number(c.score),
              statusFlag: 'PRESENT',
            });
          }
        }
      }

      try {
        const res = await api.post('/marks/save-draft', {
          examinationId: Number(examId),
          classId: Number(classId),
          streamId: Number(streamId),
          subjectId: Number(subjectId),
          expectedVersion: submission.version,
          entries,
        });
        setSubmission((prev) => ({ ...prev, version: res.data.version }));
        setDirty(false);
        setSavingState('saved');
        setLastSavedAt(new Date().toLocaleTimeString('en-UG'));
        if (!silent) {
          setFeedback({ type: 'success', message: `Saved ${res.data.savedCount} marks entries and recalculated grades.` });
        }
      } catch (err: unknown) {
        setSavingState('error');
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Save failed.';
        setFeedback({ type: 'error', message: msg });
      }
    },
    [isLocked, invalidCellKeys.size, examId, classId, streamId, subjectId, students, categories, cells, submission.version]
  );

  // Careful debounced autosave
  useEffect(() => {
    if (!dirty || isLocked || invalidCellKeys.size > 0) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveDraft(true);
    }, 1500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [dirty, isLocked, invalidCellKeys.size, saveDraft]);

  const computeStudentPreview = (studentId: number) => {
    let activeWeight = 0;
    let totalWeight = 0;
    let weightedSum = 0;
    let presentCount = 0;
    let exemptCount = 0;
    let missingCount = 0;

    for (const cat of categories) {
      totalWeight += cat.weight_percentage;
      const c = cells[`${studentId}:${cat.id}`];
      if (!c || (c.statusFlag === 'PRESENT' && c.score.trim() === '')) {
        missingCount++;
        continue;
      }
      if (c.statusFlag === 'EXEMPTED') {
        exemptCount++;
        continue;
      }
      if (c.statusFlag === 'ABSENT') {
        activeWeight += cat.weight_percentage;
        continue;
      }
      const num = Number(c.score);
      if (!Number.isNaN(num)) {
        presentCount++;
        activeWeight += cat.weight_percentage;
        weightedSum += (num / cat.max_marks) * cat.weight_percentage;
      }
    }

    if (exemptCount === categories.length) return { total: null, grade: 'EX', missingCount };
    if (presentCount === 0) return { total: null, grade: '—', missingCount };

    const denom = exemptCount > 0 && activeWeight > 0 ? activeWeight : totalWeight || 100;
    const total = Math.round(((weightedSum / denom) * 100) * 10) / 10;
    const matched = [...boundaries]
      .sort((a, b) => b.min_score - a.min_score)
      .find((b) => Math.round(total) >= b.min_score && Math.round(total) <= b.max_score);
    return { total, grade: matched?.grade || '—', missingCount };
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rIdx: number, cIdx: number) => {
    let nextR = rIdx;
    let nextC = cIdx;
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      nextR = Math.min(students.length - 1, rIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextR = Math.max(0, rIdx - 1);
    } else if (e.key === 'ArrowRight') {
      nextC = Math.min(categories.length - 1, cIdx + 1);
    } else if (e.key === 'ArrowLeft') {
      nextC = Math.max(0, cIdx - 1);
    } else {
      return;
    }
    const target = document.querySelector<HTMLInputElement>(
      `input[data-row="${nextR}"][data-col="${nextC}"]`
    );
    target?.focus();
    target?.select();
  };

  const handleSubmitMarks = async () => {
    if (invalidCellKeys.size > 0) {
      setFeedback({ type: 'error', message: 'Resolve invalid marks before submitting to DOS.' });
      return;
    }
    if (dirty) {
      await saveDraft(true);
    }
    try {
      const res = await api.post('/marks/submit', {
        examinationId: Number(examId),
        classId: Number(classId),
        streamId: Number(streamId),
        subjectId: Number(subjectId),
        teacherNotes,
      });
      setFeedback({ type: 'success', message: res.data.message });
      setShowSubmitModal(false);
      loadGrid();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Submission failed.' });
    }
  };

  const handleExcelPreview = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('examinationId', examId);
    fd.append('classId', classId);
    fd.append('streamId', streamId);
    fd.append('subjectId', subjectId);
    try {
      const res = await api.post('/marks/import/preview', fd);
      setImportPreview(res.data);
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to parse marks file.' });
    }
  };

  const handleCommitImport = async () => {
    if (!importPreview) return;
    try {
      const res = await api.post('/marks/import/commit', {
        examinationId: Number(examId),
        classId: Number(classId),
        streamId: Number(streamId),
        subjectId: Number(subjectId),
        rows: importPreview.rows,
      });
      setFeedback({ type: 'success', message: `Imported marks for ${res.data.importedStudents} student(s).` });
      setShowImportModal(false);
      setImportPreview(null);
      loadGrid();
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Import commit failed.' });
    }
  };

  const filteredStreams = streams.filter((s) => s.class_id === Number(classId));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Marks Entry & Spreadsheet Workspace"
        subtitle="Keyboard-navigable assessment entry with automatic validation, draft autosave, and DOS submission."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistoryDrawer(true)}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit History</span>
            </button>
            {!isLocked && !gridError && (
              <>
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Excel Import</span>
                </button>
                <button
                  type="button"
                  onClick={() => saveDraft(false)}
                  disabled={invalidCellKeys.size > 0}
                  className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-md text-[#0F2547] hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Draft</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  disabled={invalidCellKeys.size > 0 || students.length === 0}
                  className="px-3.5 py-2 text-xs font-semibold bg-[#0F2547] text-white rounded-md hover:bg-[#163361] disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit to DOS</span>
                </button>
              </>
            )}
          </div>
        }
      />

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} />}

      {submission.status === 'RETURNED' && submission.dos_notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900">
          <span className="font-bold">Returned by DOS for Correction:</span> {submission.dos_notes}
        </div>
      )}

      {/* Selection Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Examination</label>
          <select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.year_label} {ex.term_name} — {ex.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Class</label>
          <select
            value={classId}
            onChange={(e) => {
              const cId = e.target.value;
              setClassId(cId);
              const firstStr = streams.find((s) => s.class_id === Number(cId));
              if (firstStr) setStreamId(String(firstStr.id));
            }}
            className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Stream</label>
          <select value={streamId} onChange={(e) => setStreamId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
            {filteredStreams.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Subject</label>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white">
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>{sub.code} — {sub.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status & Sync Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-500">Sheet Status:</span>
          <StatusText status={submission.status} />
          <span className="text-slate-300">|</span>
          {invalidCellKeys.size > 0 ? (
            <span className="text-rose-700 font-semibold inline-flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {invalidCellKeys.size} cell(s) exceed maximum score
            </span>
          ) : savingState === 'saving' ? (
            <span className="text-[#1D4ED8] font-medium">Saving draft...</span>
          ) : dirty ? (
            <span className="text-amber-700 font-medium">Unsaved edits (autosaving shortly)</span>
          ) : lastSavedAt ? (
            <span className="text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Saved to server at {lastSavedAt}
            </span>
          ) : (
            <span className="text-slate-500">Use Arrow keys, Tab, or Enter to move between cells</span>
          )}
        </div>
        <div className="font-mono text-slate-500 tabular-nums">
          {students.length} Learners
        </div>
      </div>

      {/* Main Marks Grid */}
      {loading ? (
        <TableSkeleton rows={10} cols={6} />
      ) : gridError ? (
        <EmptyState
          title="Subject Sheet Restricted or Unavailable"
          description={gridError}
          icon={AlertCircle}
        />
      ) : students.length === 0 ? (
        <EmptyState
          title="No Enrolled Students"
          description="No active students are enrolled in this class and stream for the selected examination term."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#0F2547] text-white">
                <tr>
                  <th className="py-2.5 px-3 font-semibold w-10">#</th>
                  <th className="py-2.5 px-3 font-semibold">Admission No.</th>
                  <th className="py-2.5 px-3 font-semibold min-w-[180px]">Student Name</th>
                  {categories.map((cat) => (
                    <th key={cat.id} className="py-2.5 px-3 font-semibold text-right min-w-[115px]">
                      <div>{cat.code} ({cat.weight_percentage}%)</div>
                      <div className="text-[10px] font-normal text-slate-300">Max {cat.max_marks}</div>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 font-semibold text-right">Weighted %</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Grade</th>
                  <th className="py-2.5 px-3 font-semibold">Cell State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {students.map((stu, rIdx) => {
                  const preview = computeStudentPreview(stu.id);
                  const rowHasInvalid = categories.some((c) => invalidCellKeys.has(`${stu.id}:${c.id}`));
                  return (
                    <tr key={stu.id} className={rIdx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                      <td className="py-2 px-3 font-mono text-slate-400 tabular-nums">{rIdx + 1}</td>
                      <td className="py-2 px-3 font-mono font-medium text-[#0F2547] tabular-nums">
                        {stu.admission_number}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">
                        {stu.first_name} {stu.last_name}
                      </td>
                      {categories.map((cat, cIdx) => {
                        const key = `${stu.id}:${cat.id}`;
                        const cell = cells[key] || { score: '', statusFlag: 'PRESENT' };
                        const isBad = invalidCellKeys.has(key);
                        const isMissing = cell.statusFlag === 'PRESENT' && cell.score.trim() === '';
                        return (
                          <td key={cat.id} className="py-1.5 px-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                step="0.1"
                                min={0}
                                max={cat.max_marks}
                                disabled={isLocked || cell.statusFlag !== 'PRESENT'}
                                data-row={rIdx}
                                data-col={cIdx}
                                value={cell.statusFlag === 'PRESENT' ? cell.score : ''}
                                placeholder={cell.statusFlag === 'PRESENT' ? '—' : cell.statusFlag.slice(0, 3)}
                                onKeyDown={(e) => handleCellKeyDown(e, rIdx, cIdx)}
                                onChange={(e) => {
                                  setCells((prev) => ({
                                    ...prev,
                                    [key]: { score: e.target.value, statusFlag: 'PRESENT' },
                                  }));
                                  setDirty(true);
                                }}
                                className={`w-20 px-2 py-1 text-right font-mono tabular-nums border rounded focus:outline-none focus:ring-2 ${
                                  isBad
                                    ? 'border-rose-500 bg-rose-50 text-rose-800 focus:ring-rose-200'
                                    : isMissing
                                      ? 'border-amber-300 bg-amber-50/40 focus:ring-[#1D4ED8]/20'
                                      : 'border-slate-200 bg-white focus:border-[#1D4ED8] focus:ring-[#1D4ED8]/20'
                                } disabled:bg-slate-100 disabled:text-slate-500`}
                              />
                              {!isLocked && (
                                <select
                                  value={cell.statusFlag}
                                  onChange={(e) => {
                                    const flag = e.target.value as 'PRESENT' | 'ABSENT' | 'EXEMPTED';
                                    setCells((prev) => ({
                                      ...prev,
                                      [key]: { score: flag === 'PRESENT' ? cell.score : '', statusFlag: flag },
                                    }));
                                    setDirty(true);
                                  }}
                                  title="Mark attendance/exemption flag"
                                  className="text-[10px] border border-slate-200 rounded px-1 py-1 bg-white text-slate-600"
                                >
                                  <option value="PRESENT">P</option>
                                  <option value="ABSENT">ABS</option>
                                  <option value="EXEMPTED">EX</option>
                                </select>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="py-2 px-3 text-right font-mono font-bold text-[#0F2547] tabular-nums">
                        {preview.total !== null ? preview.total.toFixed(1) : '—'}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-[#1D4ED8]">{preview.grade}</td>
                      <td className="py-2 px-3">
                        {rowHasInvalid ? (
                          <span className="text-rose-700 font-semibold">Invalid</span>
                        ) : preview.missingCount > 0 ? (
                          <span className="text-amber-700">{preview.missingCount} missing</span>
                        ) : (
                          <span className="text-emerald-700">Complete</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submit to DOS Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setShowSubmitModal(false)} />
          <div className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#0F2547]">Submit Marks to Director of Studies</h2>
            <p className="text-xs text-slate-600">
              Once submitted, marks are locked for DOS verification. You will be notified if any correction is requested.
            </p>
            <textarea
              rows={3}
              value={teacherNotes}
              onChange={(e) => setTeacherNotes(e.target.value)}
              placeholder="Optional teacher moderation notes..."
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowSubmitModal(false)} className="px-4 py-2 text-xs border border-slate-200 rounded-md">
                Cancel
              </button>
              <button type="button" onClick={handleSubmitMarks} className="px-4 py-2 text-xs font-semibold bg-[#0F2547] text-white rounded-md">
                Confirm Submission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setShowImportModal(false)} />
          <div className="relative z-10 w-full max-w-3xl bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0F2547]">Excel / CSV Marks Import</h2>
              <button
                type="button"
                onClick={() =>
                  downloadProtectedFile(
                    `/marks/import-template?examinationId=${examId}&classId=${classId}&streamId=${streamId}&subjectId=${subjectId}`,
                    `BGS_Marks_Template.xlsx`
                  )
                }
                className="text-xs font-semibold text-[#1D4ED8] hover:underline inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Pre-filled Class Template</span>
              </button>
            </div>

            <div className="border border-dashed border-slate-300 rounded-lg p-5 text-center bg-slate-50">
              <FileSpreadsheet className="w-6 h-6 text-[#0F2547] mx-auto mb-2" />
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleExcelPreview(f);
                }}
                className="text-xs"
              />
              <p className="text-xs text-slate-500 mt-1">
                Checks duplicate admission numbers, enrolment membership, and maximum mark boundaries before saving.
              </p>
            </div>

            {importPreview && (
              <div className="flex-1 overflow-y-auto space-y-3">
                <div className="text-xs font-medium">
                  Parsed {importPreview.totalRows} rows ·{' '}
                  <span className="text-emerald-700 font-semibold">{importPreview.validCount} valid</span> ·{' '}
                  <span className="text-rose-700 font-semibold">{importPreview.invalidCount} invalid</span>
                </div>
                <table className="w-full text-left text-xs border border-slate-200">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Row</th>
                      <th className="py-2 px-3">Adm No.</th>
                      <th className="py-2 px-3">Student</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.rows.map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="py-2 px-3 font-mono">{r.rowNumber}</td>
                        <td className="py-2 px-3 font-mono">{r.admissionNumber}</td>
                        <td className="py-2 px-3">{r.studentName}</td>
                        <td className="py-2 px-3">{r.statusFlag}</td>
                        <td className="py-2 px-3">
                          {r.valid ? (
                            <span className="text-emerald-700 font-semibold">Valid</span>
                          ) : (
                            <span className="text-rose-700">{r.errors.join('; ')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowImportModal(false)} className="px-4 py-2 text-xs border border-slate-200 rounded-md">
                Cancel
              </button>
              {importPreview && importPreview.validCount > 0 && (
                <button type="button" onClick={handleCommitImport} className="px-4 py-2 text-xs font-semibold bg-[#0F2547] text-white rounded-md">
                  Commit {importPreview.validCount} Valid Rows
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version & Submission History Modal */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setShowHistoryDrawer(false)} />
          <div className="relative z-10 w-full max-w-xl bg-white border border-slate-200 rounded-lg shadow-xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0F2547]">Mark Change &amp; Version History</h2>
              <button type="button" onClick={() => setShowHistoryDrawer(false)} className="text-xs text-slate-500">Close</button>
            </div>
            {versionHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No post-approval score revisions recorded for this subject.</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {versionHistory.map((v, i) => (
                  <div key={i} className="py-3">
                    <div className="font-semibold text-slate-900">
                      {String(v.student_name)} ({String(v.admission_number)}) · {String(v.category_code)}
                    </div>
                    <div className="font-mono text-slate-600 mt-0.5">
                      {String(v.previous_score ?? '—')} → {String(v.new_score ?? '—')}
                    </div>
                    <div className="text-slate-500 mt-0.5">
                      Reason: {String(v.reason)} · By {String(v.changed_by_name)} ({String(v.created_at)})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
