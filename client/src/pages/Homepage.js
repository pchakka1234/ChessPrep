import React from 'react';
import '../App.css';

const features = [
  {
    number: '01',
    title: 'Learn their openings',
    description:
      'Explore the moves an opponent has played from the starting position or any position you reach on the board.',
  },
  {
    number: '02',
    title: 'See the results',
    description:
      'Compare move frequency and game results to understand which lines appear most often and how they have performed.',
  },
  {
    number: '03',
    title: 'Prepare your response',
    description:
      'Play through candidate moves, test your ideas on the board, and focus your preparation on positions you may actually face.',
  },
];

function HomePage({ onLogin, onSignup }) {
  return (
    <div className="marketing-page">
      <header className="site-header">
        <div className="site-header__inner">
          <a className="site-brand" href="#top" aria-label="ChessPrep home">
            <span className="site-brand__icon" aria-hidden="true">
              ♞
            </span>
            <span>
              Chess<span className="site-brand__accent">Prep</span>
            </span>
          </a>

          <nav className="site-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <button
              className="site-button site-button--outline site-button--small"
              type="button"
              onClick={onLogin}
            >
              Log in
            </button>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero__glow" aria-hidden="true" />

          <div className="content-wrap hero__content">
            <div className="hero__copy">
              <span className="eyebrow">
                A clearer way to prepare for your next game
              </span>

              <h1>
                Know the player.
                <br />
                <span>Own the position.</span>
              </h1>

              <p className="hero__description">
                ChessPrep turns an opponent’s public games into a
                practical move explorer. Find their familiar lines,
                review the results, and build a plan before you sit
                down at the board.
              </p>

              <div className="hero__actions">
                <button
                  className="site-button site-button--primary"
                  type="button"
                  onClick={onSignup}
                >
                  Create an account
                  <span aria-hidden="true">→</span>
                </button>

                <a className="site-button site-button--ghost" href="#how-it-works">
                  See how it works
                </a>
              </div>

              <p className="hero__note">
                Search public Chess.com games. Explore moves. Save
                your preparation.
              </p>
            </div>

            <div className="hero-preview" aria-label="ChessPrep preview">
              <div className="hero-preview__top">
                <span className="hero-preview__dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>OPPONENT EXPLORER</span>
                <span className="hero-preview__live">● LIVE PREP</span>
              </div>

              <div className="hero-preview__body">
                <div className="hero-preview__label">
                  CURRENT POSITION
                </div>
                <div className="hero-preview__moves">
                  1. e4 <span>c5</span> 2. Nf3 <span>d6</span>
                </div>

                <div className="hero-preview__divider" />

                <div className="hero-preview__label">
                  MOVE BREAKDOWN
                </div>

                <div className="preview-move">
                  <strong>3. d4</strong>
                  <div className="preview-move__bar">
                    <span style={{ width: '62%' }} />
                  </div>
                  <span>62%</span>
                </div>

                <div className="preview-move">
                  <strong>3. Bb5+</strong>
                  <div className="preview-move__bar">
                    <span style={{ width: '27%' }} />
                  </div>
                  <span>27%</span>
                </div>

                <div className="preview-move">
                  <strong>3. c3</strong>
                  <div className="preview-move__bar">
                    <span style={{ width: '11%' }} />
                  </div>
                  <span>11%</span>
                </div>

                <div className="hero-preview__foot">
                  <span>Explore the line</span>
                  <span aria-hidden="true">↗</span>
                </div>
              </div>
            </div>
          </div>

          <a className="hero__scroll" href="#how-it-works">
            Explore the platform <span aria-hidden="true">↓</span>
          </a>
        </section>

        <section className="section" id="how-it-works">
          <div className="content-wrap">
            <div className="section-heading">
              <span className="eyebrow">THE WORKFLOW</span>
              <h2>From username to game plan.</h2>
              <p>
                Start with the opponent, follow the moves, and spend
                your study time on the positions that matter.
              </p>
            </div>

            <div className="feature-grid">
              {features.map((feature) => (
                <article className="feature-card" key={feature.number}>
                  <span className="feature-card__number">
                    {feature.number}
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--alternate" id="features">
          <div className="content-wrap insight-layout">
            <div>
              <span className="eyebrow">BUILT FOR REAL PREPARATION</span>
              <h2>Move past a list of games.</h2>
              <p className="insight-layout__description">
                Choose a player, color, and time range. The explorer
                groups games by the moves played in your current
                position, so you can see patterns as you navigate the
                board.
              </p>

              <ul className="check-list">
                <li>Filter games by the opponent’s color and date.</li>
                <li>Navigate positions with the board or arrow keys.</li>
                <li>Review matching games ten at a time.</li>
                <li>Return to searches saved to your account.</li>
              </ul>
            </div>

            <div className="insight-panel">
              <div className="insight-panel__header">
                <span>YOUR PREPARATION</span>
                <span aria-hidden="true">✦</span>
              </div>

              <div className="insight-panel__row">
                <span>01</span>
                <div>
                  <strong>Find the opponent</strong>
                  <small>Search their public games</small>
                </div>
              </div>

              <div className="insight-panel__row">
                <span>02</span>
                <div>
                  <strong>Follow their choices</strong>
                  <small>Explore moves by position</small>
                </div>
              </div>

              <div className="insight-panel__row">
                <span>03</span>
                <div>
                  <strong>Save your work</strong>
                  <small>Return to your search history</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section section--cta">
          <div className="content-wrap cta-panel">
            <span className="eyebrow">YOUR NEXT GAME STARTS HERE</span>
            <h2>Walk in with a plan.</h2>
            <p>
              Turn your opponent’s game history into focused opening
              preparation.
            </p>
            <button
              className="site-button site-button--primary"
              type="button"
              onClick={onSignup}
            >
              Get started <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="content-wrap site-footer__inner">
          <span>
            Chess<span className="site-brand__accent">Prep</span>
          </span>
          <span>Prepare with purpose. Play with confidence.</span>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;