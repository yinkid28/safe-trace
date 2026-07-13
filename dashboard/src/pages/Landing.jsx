import { Link } from "react-router-dom";
import SafeTraceLogo from "../components/SafeTraceLogo";
import "./Landing.css";

export default function Landing() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-logo">
          <img src="/logo.png" alt="SafeTrace" className="landing-logo-img" />
        </div>
        <Link to="/login" className="landing-login-link">Agency Login</Link>
      </header>

      <section className="landing-hero">
        <SafeTraceLogo size="lg" />
        <h1 className="hero-title">
          Personal safety.<br />
          <span className="hero-accent">Before it's too late.</span>
        </h1>
        <p className="hero-subtitle">
          An AI-powered safety system that detects when something has gone wrong,
          preserves evidence before a phone can be seized, and escalates a located,
          proof-backed alert to your family and security responders.
        </p>
      </section>

      <section className="landing-paths">
        <div className="path-card">
          <div className="path-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <h2 className="path-title">I want to be protected</h2>
          <p className="path-desc">
            Download the SafeTrace Android app to set up panic alerts,
            family groups, live location sharing, and AI-powered anomaly detection.
          </p>
          <a
            href="#download"
            className="path-cta path-cta-primary"
            onClick={(e) => {
              e.preventDefault();
              alert("The Android app will be available on the Play Store soon. For now, install via the development APK.");
            }}
          >
            Get the App
          </a>
        </div>

        <div className="path-card">
          <div className="path-icon path-icon-agency">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2 className="path-title">I represent a security agency</h2>
          <p className="path-desc">
            Register your agency to receive and respond to live alerts
            on the SafeTrace dashboard. Monitor locations, evidence, and
            coordinate emergency response.
          </p>
          <Link to="/agency/register" className="path-cta path-cta-agency">
            Register Your Agency
          </Link>
        </div>
      </section>

      <section className="landing-features">
        <h2 className="features-title">How SafeTrace works</h2>
        <div className="features-grid">
          <div className="feature-item">
            <span className="feature-num">1</span>
            <h3>Panic button</h3>
            <p>One tap captures a photo, locks your GPS, and broadcasts an alert to your family and agency.</p>
          </div>
          <div className="feature-item">
            <span className="feature-num">2</span>
            <h3>Evidence first</h3>
            <p>Photo and location upload to the cloud instantly — before the phone can be seized or switched off.</p>
          </div>
          <div className="feature-item">
            <span className="feature-num">3</span>
            <h3>AI anomaly detection</h3>
            <p>Our own machine learning model learns your normal routes and flags unusual movement automatically.</p>
          </div>
          <div className="feature-item">
            <span className="feature-num">4</span>
            <h3>Family + agency response</h3>
            <p>Alerts go to family members first, then escalate to a linked security agency with full location and evidence.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>SafeTrace — Final Year Project, Computer Engineering, Yabatech Lagos</p>
      </footer>
    </div>
  );
}
