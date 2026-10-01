import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import '../App.css';

const PAGE_COPY = {
  login: {
    eyebrow: 'WELCOME BACK',
    title: 'Log in to ChessPrep',
    description: 'Your preparation is waiting for you.',
    action: 'Log in',
  },
  signup: {
    eyebrow: 'GET STARTED',
    title: 'Create your account',
    description: 'Build a home for your opponent preparation.',
    action: 'Create account',
  },
  forgot: {
    eyebrow: 'ACCOUNT RECOVERY',
    title: 'Reset your password',
    description:
      'Enter your email and we’ll send you a password reset link.',
    action: 'Send reset link',
  },
  recovery: {
    eyebrow: 'ACCOUNT RECOVERY',
    title: 'Choose a new password',
    description: 'Set a new password to regain access to your account.',
    action: 'Update password',
  },
};

function AuthPage({ mode, onModeChange, onHome }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const page = PAGE_COPY[mode] || PAGE_COPY.login;

  function changeMode(nextMode) {
    setMessage('');
    setPassword('');
    onModeChange(nextMode);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        setMessageType('success');
        setMessage(
          data.session
            ? 'Account created. You are signed in.'
            : 'Check your email to confirm your account.'
        );
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email,
          { redirectTo: window.location.origin }
        );

        if (error) throw error;

        setMessageType('success');
        setMessage(
          'If an account exists for that email, a reset link has been sent.'
        );
      } else if (mode === 'recovery') {
        const { error } = await supabase.auth.updateUser({
          password,
        });

        if (error) throw error;

        setPassword('');
        setMessageType('success');
        setMessage('Password updated successfully.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        setPassword('');
      }
    } catch (error) {
      setMessageType('error');
      setMessage(error.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="site-header">
        <div className="site-header__inner">
          <button
            className="site-brand site-brand--button"
            type="button"
            onClick={onHome}
            aria-label="ChessPrep home"
          >
            <span className="site-brand__icon" aria-hidden="true">
              ♞
            </span>
            <span>
              Chess<span className="site-brand__accent">Prep</span>
            </span>
          </button>

          {mode !== 'recovery' && (
            <button
              className="site-button site-button--ghost site-button--small"
              type="button"
              onClick={onHome}
            >
              ← Back to home
            </button>
          )}
        </div>
      </header>

      <main className="auth-layout">
        <section className="auth-intro">
          <span className="eyebrow">PREPARE WITH PURPOSE</span>
          <h1>
            The next move
            <br />
            starts <span>before the game.</span>
          </h1>
          <p>
            Explore an opponent’s games, understand their choices,
            and keep your preparation connected to your account.
          </p>

          <div className="auth-intro__detail">
            <span aria-hidden="true">✦</span>
            A focused workspace for serious chess preparation
          </div>
        </section>

        <section className="auth-card" aria-labelledby="auth-title">
          <span className="eyebrow">{page.eyebrow}</span>
          <h2 id="auth-title">{page.title}</h2>
          <p className="auth-card__description">{page.description}</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode !== 'recovery' && (
              <label>
                Email address
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            )}

            {mode !== 'forgot' && (
              <label>
                {mode === 'recovery' ? 'New password' : 'Password'}
                <input
                  type="password"
                  required
                  minLength={
                    mode === 'signup' || mode === 'recovery'
                      ? 8
                      : undefined
                  }
                  autoComplete={
                    mode === 'login'
                      ? 'current-password'
                      : 'new-password'
                  }
                  placeholder={
                    mode === 'recovery'
                      ? 'Enter a new password'
                      : 'Enter your password'
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            )}

            {(mode === 'signup' || mode === 'recovery') && (
              <p className="auth-form__hint">
                Use at least 8 characters.
              </p>
            )}

            <button
              className="site-button site-button--primary auth-form__submit"
              type="submit"
              disabled={busy}
            >
              {busy ? 'Please wait…' : page.action}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
          </form>

          {message && (
            <p
              className={`auth-message auth-message--${messageType}`}
              role={messageType === 'error' ? 'alert' : 'status'}
            >
              {message}
            </p>
          )}

          {mode === 'recovery' && messageType === 'success' && message && (
            <button
              className="auth-link"
              type="button"
              onClick={onHome}
            >
              Continue to ChessPrep →
            </button>
          )}

          {mode !== 'recovery' && (
            <div className="auth-card__footer">
              {mode === 'login' && (
                <>
                  <button
                    className="auth-link"
                    type="button"
                    onClick={() => changeMode('forgot')}
                  >
                    Forgot password?
                  </button>

                  <p>
                    New to ChessPrep?{' '}
                    <button
                      className="auth-link"
                      type="button"
                      onClick={() => changeMode('signup')}
                    >
                      Create an account
                    </button>
                  </p>
                </>
              )}

              {mode === 'signup' && (
                <p>
                  Already have an account?{' '}
                  <button
                    className="auth-link"
                    type="button"
                    onClick={() => changeMode('login')}
                  >
                    Log in
                  </button>
                </p>
              )}

              {mode === 'forgot' && (
                <button
                  className="auth-link"
                  type="button"
                  onClick={() => changeMode('login')}
                >
                  ← Back to login
                </button>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AuthPage;