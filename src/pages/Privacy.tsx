import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import './Legal.css'

export default function Privacy() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link to="/" className="legal-wordmark serif">ASHE</Link>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: March 15, 2026</p>
      </header>

      <main className="legal-content">
        <section>
          <h2>Who We Are</h2>
          <p>
            ASHE is a tennis prediction service operated by swingtree.ai, a property of
            FNDM Ventures, LLC. This Privacy Policy explains how we collect, use, and protect
            your personal information when you use our service.
          </p>
        </section>

        <section>
          <h2>Information We Collect</h2>
          <p>When you sign in with Google OAuth, we collect:</p>
          <ul>
            <li><strong>Name</strong> — Your display name from your Google account</li>
            <li><strong>Email address</strong> — Used for account identification and communication</li>
            <li><strong>Profile picture</strong> — Optional, displayed in your account</li>
          </ul>
          <p>
            We do not collect passwords. Authentication is handled securely through Google's
            OAuth 2.0 system.
          </p>
        </section>

        <section>
          <h2>How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Create and manage your ASHE account</li>
            <li>Provide access to predictions based on your subscription tier</li>
            <li>Send important service updates (e.g., billing changes, service announcements)</li>
            <li>Respond to support requests</li>
          </ul>
        </section>

        <section>
          <h2>Data Sharing</h2>
          <p>
            <strong>We do not sell, rent, or share your personal information with third parties
            for marketing purposes.</strong>
          </p>
          <p>
            We may share data only when required by law or to protect our legal rights.
          </p>
        </section>

        <section>
          <h2>Cookies and Session Data</h2>
          <p>
            We use a single session cookie containing a JWT (JSON Web Token) to keep you
            logged in. This cookie:
          </p>
          <ul>
            <li>Is essential for the service to function</li>
            <li>Contains only your session identifier</li>
            <li>Expires when you log out or after 7 days of inactivity</li>
          </ul>
          <p>
            We do not use tracking cookies, advertising cookies, or third-party analytics.
          </p>
        </section>

        <section>
          <h2>Data Retention</h2>
          <p>
            We retain your account information for as long as your account is active.
            Prediction history and usage data may be retained for up to 12 months for
            service improvement purposes.
          </p>
        </section>

        <section>
          <h2>Deleting Your Account</h2>
          <p>
            To delete your account and all associated data, please contact us at{' '}
            <a href="mailto:support@swingtree.ai">support@swingtree.ai</a>. We will process
            your request within 30 days.
          </p>
        </section>

        <section>
          <h2>Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your data, including:
          </p>
          <ul>
            <li>HTTPS encryption for all data in transit</li>
            <li>Secure database storage with encrypted connections</li>
            <li>Limited access to personal data on a need-to-know basis</li>
          </ul>
        </section>

        <section>
          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of
            significant changes by email or through the service.
          </p>
        </section>

        <section>
          <h2>Contact Us</h2>
          <p>
            For privacy-related questions or concerns, contact us at:{' '}
            <a href="mailto:support@swingtree.ai">support@swingtree.ai</a>
          </p>
        </section>
      </main>

      <Footer />
    </div>
  )
}
