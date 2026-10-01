import React, { useEffect, useState } from 'react';
import HomePage from './pages/Homepage';
import AuthPage from './pages/AuthPage';
import PrepApp from './PrepApp';
import { supabase } from './supabaseClient';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        console.error('Could not restore session:', error);
      }

      setSession(data?.session ?? null);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;

        setSession(nextSession);
        setReady(true);

        if (event === 'PASSWORD_RECOVERY') {
          setRecovering(true);
          setAuthMode('recovery');
        }

        if (event === 'SIGNED_OUT') {
          setRecovering(false);
          setAuthMode(null);
        }
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <div className="site-loading">
        <div className="site-loading__mark" aria-hidden="true">
          ♞
        </div>
        <p>Preparing your workspace…</p>
      </div>
    );
  }

  if (recovering) {
    return (
      <AuthPage
        mode="recovery"
        onModeChange={() => {
          setRecovering(false);
          setAuthMode(null);
        }}
        onHome={() => {
          setRecovering(false);
          setAuthMode(null);
        }}
      />
    );
  }

  if (session?.user) {
    return (
      <div className="site-shell">
        <header className="site-header site-header--workspace">
          <div className="site-header__inner">
            <div className="site-brand" aria-label="ChessPrep">
              <span className="site-brand__icon" aria-hidden="true">
                ♞
              </span>
              <span>
                Chess<span className="site-brand__accent">Prep</span>
              </span>
            </div>

            <div className="site-header__account">
              <span className="site-header__email" title={session.user.email}>
                {session.user.email}
              </span>
              <button
                className="site-button site-button--outline site-button--small"
                type="button"
                onClick={() => supabase.auth.signOut()}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <PrepApp />
      </div>
    );
  }

  if (authMode) {
    return (
      <AuthPage
        mode={authMode}
        onModeChange={setAuthMode}
        onHome={() => setAuthMode(null)}
      />
    );
  }

  return (
    <HomePage
      onLogin={() => setAuthMode('login')}
      onSignup={() => setAuthMode('signup')}
    />
  );
}

export default App;