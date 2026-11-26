import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface VerificationPayload {
  verified: boolean;
  schoolName?: string;
  reportReference?: string;
  academicYear?: string;
  term?: string;
  examination?: string;
  classLevel?: string;
  admissionReference?: string;
  issuedAt?: string;
  message?: string;
}

export function VerifyReportPage() {
  const { reportRef } = useParams<{ reportRef: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VerificationPayload | null>(null);

  useEffect(() => {
    if (!reportRef) return;
    api
      .get(`/reports/verify/${encodeURIComponent(reportRef)}`)
      .then((res) => setData(res.data))
      .catch((err) =>
        setData({
          verified: false,
          message: err?.response?.data?.message || 'Report reference could not be verified.',
        })
      )
      .finally(() => setLoading(false));
  }, [reportRef]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg p-7 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <img
            src="/assets/aistudio/Bgs_logo_6081ecf0.png"
            alt="Buyanja Grammar School Crest"
            referrerPolicy="no-referrer"
            className="w-11 h-11 rounded object-contain bg-white p-0.5 border border-slate-100"
          />
          <div>
            <h1 className="text-base font-bold text-[#0F2547]">Official Document Verification</h1>
            <p className="text-xs text-slate-500">Buyanja Grammar School Academic Registry</p>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Verifying report reference...</div>
        ) : data?.verified ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-emerald-900">Authentic Academic Report Card</div>
                <div className="text-xs text-emerald-800 mt-0.5">
                  This document reference matches an officially issued report card in the {data.schoolName} registry.
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs border border-slate-200 rounded-lg p-4 bg-slate-50">
              <div>
                <dt className="text-slate-500">Report Reference</dt>
                <dd className="font-mono font-semibold text-[#0F2547] mt-0.5">{data.reportReference}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Admission Reference</dt>
                <dd className="font-mono font-semibold text-slate-900 mt-0.5">{data.admissionReference}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Academic Period</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">
                  {data.academicYear} · {data.term}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Class Level</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">{data.classLevel}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">Examination</dt>
                <dd className="font-semibold text-slate-900 mt-0.5">{data.examination}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">Issued Timestamp</dt>
                <dd className="font-mono text-slate-700 mt-0.5">{data.issuedAt}</dd>
              </div>
            </dl>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Privacy Notice: In compliance with Uganda&apos;s Data Protection and Privacy Act (2019),
              student marks and personal guardian details are never exposed via public QR verification URLs.
            </p>
          </div>
        ) : (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-rose-900">Unverified Reference</div>
              <div className="text-xs text-rose-800 mt-0.5">{data?.message}</div>
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <Link to="/login" className="text-xs font-semibold text-[#1D4ED8] hover:underline">
            Staff Portal Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
