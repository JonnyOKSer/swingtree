import { Link } from 'react-router-dom'
import Footer from '../components/Footer'
import './Legal.css'

export default function Terms() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link to="/main" className="legal-wordmark serif">ASHE</Link>
        <h1>Terms and Conditions</h1>
        <p className="legal-updated">Last updated: March 15, 2026</p>
      </header>

      <main className="legal-content">
        <section className="legal-disclaimer">
          <h2>Important Disclaimers</h2>
          <div className="disclaimer-box">
            <p>
              <strong>ASHE predictions are provided for informational and entertainment
              purposes only and do not constitute gambling, financial, or betting advice.</strong>
            </p>
            <p>
              <strong>Past performance does not guarantee future results.</strong>
            </p>
            <p>
              <strong>Users are solely responsible for compliance with local gambling laws
              in their jurisdiction.</strong>
            </p>
          </div>
        </section>

        <section>
          <h2>Acceptance of Terms</h2>
          <p>
            By accessing or using ASHE (the "Service"), operated by swingtree.ai, a property
            of FNDM Ventures, LLC, you agree to be bound by these Terms and Conditions. If
            you do not agree to these terms, do not use the Service.
          </p>
        </section>

        <section>
          <h2>Nature of the Service</h2>
          <p>
            ASHE is a tennis match prediction service that uses statistical models and
            machine learning to generate predictions. The Service is intended for:
          </p>
          <ul>
            <li>Informational purposes</li>
            <li>Entertainment purposes</li>
            <li>Personal interest in tennis analytics</li>
          </ul>
          <p>
            <strong>The Service is not designed to provide gambling advice, betting tips,
            or financial recommendations.</strong> Any decision to place bets based on
            ASHE predictions is made entirely at your own risk.
          </p>
        </section>

        <section>
          <h2>No Guarantee of Accuracy</h2>
          <p>
            While we strive to provide accurate predictions based on historical data and
            sophisticated modeling, <strong>we make no guarantee of accuracy or future
            performance</strong>. Tennis matches are inherently unpredictable and influenced
            by countless variables beyond statistical analysis.
          </p>
        </section>

        <section>
          <h2>User Responsibilities</h2>
          <p>By using the Service, you acknowledge and agree that:</p>
          <ul>
            <li>You are solely responsible for any betting or wagering decisions you make</li>
            <li>You will comply with all applicable laws in your jurisdiction regarding gambling</li>
            <li>You will not hold ASHE or swingtree.ai liable for any financial losses</li>
            <li>You are at least 18 years of age (or the legal age of majority in your jurisdiction)</li>
          </ul>
        </section>

        <section>
          <h2>Minimum Age Requirement</h2>
          <p>
            You must be at least <strong>18 years of age</strong> to use this Service.
            By creating an account, you confirm that you meet this requirement.
          </p>
        </section>

        <section>
          <h2>Subscription and Pricing</h2>
          <p>
            ASHE offers tiered subscription plans with different levels of access.
            Subscription pricing is subject to change with reasonable notice to existing
            subscribers.
          </p>
          <p>
            <strong>Member cap:</strong> We may limit the total number of subscribers.
            This cap is not guaranteed and may be adjusted at our discretion.
          </p>
        </section>

        <section>
          <h2>Refund Policy</h2>
          <p>
            <strong>No refunds are provided for the current billing period.</strong> If you
            cancel your subscription, you will retain access until the end of your current
            billing cycle.
          </p>
        </section>

        <section>
          <h2>Service Modifications</h2>
          <p>
            We reserve the right to modify, suspend, or discontinue the Service (or any
            part thereof) at any time, with or without notice. We will make reasonable
            efforts to notify subscribers of significant changes.
          </p>
        </section>

        <section>
          <h2>Account Termination</h2>
          <p>
            We reserve the right to terminate or suspend your account at our sole discretion,
            including but not limited to cases of:
          </p>
          <ul>
            <li>Violation of these Terms</li>
            <li>Fraudulent or illegal activity</li>
            <li>Abuse of the Service</li>
            <li>Sharing account credentials</li>
          </ul>
        </section>

        <section>
          <h2>Intellectual Property</h2>
          <p>
            All content, predictions, analysis, and materials provided through ASHE are
            the intellectual property of swingtree.ai. You may not redistribute, resell,
            or commercially exploit our content without written permission.
          </p>
        </section>

        <section>
          <h2>Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, ASHE and swingtree.ai shall not be
            liable for any indirect, incidental, special, consequential, or punitive
            damages, including but not limited to loss of profits, data, or other
            intangible losses resulting from your use of the Service.
          </p>
        </section>

        <section>
          <h2>Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Service
            after changes constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section>
          <h2>Contact Us</h2>
          <p>
            For questions about these Terms, contact us at:{' '}
            <a href="mailto:support@swingtree.ai">support@swingtree.ai</a>
          </p>
        </section>
      </main>

      <Footer />
    </div>
  )
}
