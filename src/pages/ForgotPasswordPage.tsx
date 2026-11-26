import { ArrowLeft, KeyRound, Mail } from 'lucide-react';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FeedbackBanner } from '../components/UiPrimitives';
import { api } from '../lib/api';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setStatus({ type: 'success', message: res.data.message });
      if (res.data.recoveryTokenPreview) {
        setPreviewCode(res.data.recoveryTokenPreview);
        setToken(res.data.recoveryTokenPreview);
      }
      setStep('reset');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Request failed.';
      setStatus({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const completeReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await api.post('/auth/reset-password', { token, newPassword });
      setStatus({ type: 'success', message: res.data.message });
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Reset failed.';
      setStatus({ type: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-[#0F2547]">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign In</span>
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-[#0F2547]">Password Recovery</h1>
          <p className="mt-1 text-sm text-slate-500">
            Request a one-time recovery token to securely reset your Buyanja Grammar School staff password.
          </p>
        </div>

        {status && <FeedbackBanner type={status.type} message={status.message} />}

        {previewCode && (
          <div className="bg-[#FEF7E6] border border-[#E5C98B] rounded-lg p-3.5 text-xs text-slate-800">
            <div className="font-semibold text-[#0F2547]">Sandbox Recovery Token Issued</div>
            <div className="mt-1 font-mono break-all select-all">{previewCode}</div>
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={requestReset} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Staff Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@buyanjagrammar.ac.ug"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#0F2547] hover:bg-[#163361] text-white text-sm font-semibold rounded-md"
            >
              {submitting ? 'Generating token...' : 'Send Recovery Token'}
            </button>
          </form>
        ) : (
          <form onSubmit={completeReset} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Recovery Token</label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:border-[#1D4ED8]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">New Password (8+ characters)</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-[#1D4ED8]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#1D4ED8] hover:bg-[#2563EB] text-white text-sm font-semibold rounded-md"
            >
              {submitting ? 'Updating password...' : 'Reset Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
