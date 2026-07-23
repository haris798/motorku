import React, { useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { LogIn, UserPlus, X, KeyRound, Mail, AlertCircle, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: any) => void;
  supabaseConfigured: boolean;
}

export default function AuthModal({ isOpen, onClose, onAuthSuccess, supabaseConfigured }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const client = getSupabaseClient();
    if (!client) {
      setError('Supabase belum dikonfigurasi. Silakan atur URL & Anon Key di Tab Pengaturan terlebih dahulu.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await client.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        
        // Supabase sends dynamic email verification sometimes, or auto-logs in.
        setSuccess('Pendaftaran berhasil! Silakan periksa email Anda untuk verifikasi, atau coba login langsung jika konfirmasi otomatis aktif.');
        setIsSignUp(false);
      } else {
        const { data, error: signInError } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        
        if (data.user) {
          onAuthSuccess(data.user);
          onClose();
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-300">
      <div 
        id="auth-modal"
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300"
      >
        <div className="flex justify-between items-center px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-500" />
            {isSignUp ? 'Daftar Akun Cloud' : 'Masuk Cloud Supabase'}
          </h2>
          <button 
            id="close-auth"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {!supabaseConfigured ? (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 mb-4 text-amber-800 dark:text-amber-300 flex gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Supabase Belum Dihubungkan</p>
                <p className="text-xs mt-1 leading-relaxed">
                  Supabase URL dan Anon Key belum diatur di Pengaturan. Saat ini Anda menggunakan <b>Mode Lokal (Offline)</b>. 
                  Data disimpan dengan aman di peramban Anda.
                </p>
                <button
                  id="go-to-settings-btn"
                  onClick={onClose}
                  className="mt-2 text-xs font-bold text-amber-900 dark:text-amber-200 underline flex items-center gap-1 hover:opacity-80"
                >
                  Atur Supabase Sekarang <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : null}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 mb-4 text-rose-800 dark:text-rose-300 text-sm flex gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 mb-4 text-emerald-800 dark:text-emerald-300 text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold capitalize tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Alamat Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-slate-500">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  disabled={loading || !supabaseConfigured}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50 transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold capitalize tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-slate-500">
                  <KeyRound className="w-5 h-5" />
                </div>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading || !supabaseConfigured}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50 transition-all text-sm"
                />
              </div>
            </div>

            <button
              id="submit-auth-btn"
              type="submit"
              disabled={loading || !supabaseConfigured}
              className="w-full py-2.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md shadow-indigo-600/10 text-sm"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isSignUp ? (
                <>
                  <UserPlus className="w-4 h-4" /> Daftar Sekarang
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" /> Masuk Akun
                </>
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <button
              id="toggle-auth-mode"
              onClick={() => setIsSignUp(!isSignUp)}
              disabled={loading || !supabaseConfigured}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium focus:outline-hidden disabled:opacity-50"
            >
              {isSignUp 
                ? 'Sudah punya akun? Masuk di sini' 
                : 'Belum punya akun? Buat akun baru'}
            </button>
          </div>

          <div className="mt-4 text-center">
            <button
              id="bypass-auth"
              onClick={onClose}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:underline"
            >
              Lanjutkan dengan Mode Lokal (Offline-First)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
