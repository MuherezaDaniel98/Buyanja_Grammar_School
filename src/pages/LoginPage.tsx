import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

const loginSchema = z.object({
  email: z.string().email('Enter a valid school email address'),
  password: z.string().min(4, 'Enter your password'),
});

type LoginForm = z.infer<typeof loginSchema>;

const DEMO_ACCOUNTS = [
  { role: 'System Administrator', email: 'admin@buyanjagrammar.ac.ug', name: 'Samuel Mugisha' },
  { role: 'Head Teacher', email: 'headteacher@buyanjagrammar.ac.ug', name: 'Grace Kiconco' },
  { role: 'Director of Studies', email: 'dos@buyanjagrammar.ac.ug', name: 'Patrick Byaruhanga' },
  { role: 'Class Teacher (S.2 North)', email: 'classteacher@buyanjagrammar.ac.ug', name: 'Sarah Namukasa' },
  { role: 'Subject Teacher (Mathematics)', email: 'teacher@buyanjagrammar.ac.ug', name: 'David Ochieng' },
];

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(true);
  const [showDemoList, setShowDemoList] = useState(false);
  const [schoolName, setSchoolName] = useState('BUYANJA GRAMMAR SCHOOL');
  const [logoUrl, setLogoUrl] = useState('/assets/aistudio/Bgs_logo_6081ecf0.png');

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    api
      .get('/auth/demo-status')
      .then((res) => {
        setDemoMode(Boolean(res.data.sampleMode));
        if (res.data.schoolName) setSchoolName(res.data.schoolName);
        if (res.data.schoolLogoUrl) setLogoUrl(res.data.schoolLogoUrl);
      })
      .catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    try {
      await login(data.email, data.password);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Sign-in failed. Please verify your credentials.';
      setServerError(msg);
    }
  };

  const fillDemo = (email: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', 'Bgs@2026!', { shouldValidate: true });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row">
      {/* Left Institutional Visual Panel */}
      <div className="hidden lg:flex lg:w-[46%] xl:w-[48%] relative bg-[#0F2547] text-white overflow-hidden">
        <img
          src="/src/assets/images/bgs_campus_hero_1795667066197.jpg"
          alt="Buyanja Grammar School Campus Courtyard"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09172E] via-[#0F2547]/70 to-[#0F2547]/60" />

        <div className="relative z-10 flex flex-col justify-between items-center text-center p-12 w-full">
          <div className="flex flex-col items-center gap-3 text-center">
            <img
              src={logoUrl}
              alt="Buyanja Grammar School Crest"
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full bg-white p-1.5 object-contain shadow-sm ring-2 ring-white/25"
            />
            <div>
              <div className="text-sm font-bold tracking-wider text-white">{schoolName}</div>
              <div className="text-xs text-[#E5C98B] mt-0.5">Rukungiri District, Uganda</div>
            </div>
          </div>

          <div className="max-w-md mx-auto space-y-4 text-center">
            <h1 className="text-3xl xl:text-4xl font-bold leading-tight text-white">
              Centralised Academic Records &amp; Report Generation
            </h1>
            <p className="text-sm text-slate-200 leading-relaxed">
              A secure, role-based platform for marks entry, automated weighted grading, Director of
              Studies verification, Head Teacher approval, and print-ready A4 student report cards.
            </p>
            <div className="pt-4 border-t border-white/15 grid grid-cols-3 gap-4 text-xs text-center">
              <div>
                <div className="font-semibold text-[#E5C98B]">Role-Scoped</div>
                <div className="text-slate-300 mt-0.5">5 academic permission tiers</div>
              </div>
              <div>
                <div className="font-semibold text-[#E5C98B]">Audit Trail</div>
                <div className="text-slate-300 mt-0.5">Immutable mark history</div>
              </div>
              <div>
                <div className="font-semibold text-[#E5C98B]">QR Verified</div>
                <div className="text-slate-300 mt-0.5">Official A4 PDF reports</div>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 text-center">
            Buyanja Grammar School Academic Information System · Data Protection &amp; Privacy Act (2019) Compliant
          </div>
        </div>
      </div>

      {/* Right Sign-In Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center text-center gap-2.5 lg:hidden">
            <img
              src={logoUrl}
              alt="Buyanja Grammar School Crest"
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full bg-white border border-slate-200 p-1.5 object-contain shadow-xs"
            />
            <div>
              <div className="text-sm font-bold text-[#0F2547]">{schoolName}</div>
              <div className="text-xs text-slate-500">Academic Records Portal</div>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-[#0F2547]">Staff Sign In</h2>
            <p className="mt-1 text-sm text-slate-500">
              Sign in with your school email and password to access your academic workspace.
            </p>
          </div>

          {serverError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-4 py-3 text-sm text-center">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="email">
                School Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@buyanjagrammar.ac.ug"
                  {...register('email')}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                />
              </div>
              {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700" htmlFor="password">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs text-[#1D4ED8] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter password"
                  {...register('password')}
                  className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-[#0F2547] hover:bg-[#163361] disabled:opacity-60 text-white text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Signing in...' : 'Sign In to Workspace'}</span>
            </button>
          </form>

          {demoMode && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDemoList((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-center gap-2 text-xs font-semibold text-[#0F2547] hover:bg-slate-50 transition-colors text-center"
              >
                <span>Demonstration Accounts (Sample Data · Password: Bgs@2026!)</span>
                {showDemoList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showDemoList && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fillDemo(acc.email)}
                      className="w-full px-4 py-2.5 text-center hover:bg-slate-50 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors"
                    >
                      <div className="font-semibold text-slate-900">{acc.role}</div>
                      <div className="text-slate-500">{acc.name} · {acc.email}</div>
                      <span className="text-[#1D4ED8] font-medium">Use account</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
