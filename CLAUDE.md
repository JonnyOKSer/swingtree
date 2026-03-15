# ASHE (swingtree.ai) - Development Guide

## Project Overview

ASHE is a tennis prediction service that uses ELO-based modeling to predict match outcomes. The app is built with:
- **Frontend**: React + TypeScript + Vite
- **Backend**: Netlify Functions (serverless)
- **Database**: PostgreSQL (Neon)
- **Auth**: Google OAuth 2.0
- **Payments**: Stripe Subscriptions

## Environment Variables

Required in Netlify (and `.env` for local dev):

```
# Database
DATABASE_URL=postgresql://...

# Auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=...
ADMIN_EMAIL=...

# Stripe
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_test_... or pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASELINE=price_1TBMAKGgeIhl3BWfwctDT6h8
STRIPE_PRICE_ALL_COURT=price_1TBMAiGgeIhl3BWf2qw5KuRq
STRIPE_PRICE_TREE_TOP=price_1TBMBAGgeIhl3BWfRh2JuM2n
```

---

## Stripe Integration

### Architecture

```
User clicks Subscribe
        ↓
POST /api/stripe-checkout
        ↓
Stripe Checkout (hosted page)
        ↓
User completes payment
        ↓
Redirect to /main?subscription=success
        ↓
Stripe sends webhook → POST /api/stripe-webhook
        ↓
Database updated (tier, status, stripe IDs)
```

### Netlify Functions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/stripe-checkout` | POST | Create Stripe Checkout session |
| `/api/stripe-webhook` | POST | Handle Stripe webhook events |
| `/api/stripe-portal` | POST | Create Stripe Customer Portal session |
| `/api/subscription-limits` | GET | Get remaining subscription spots |

### Subscription Tiers

| Tier | Price ID | Monthly Price |
|------|----------|---------------|
| Baseline | `price_1TBMAKGgeIhl3BWfwctDT6h8` | $29 |
| All-Court | `price_1TBMAiGgeIhl3BWf2qw5KuRq` | $79 |
| Tree Top | `price_1TBMBAGgeIhl3BWfRh2JuM2n` | $199 |

### User Statuses

| Status | Meaning |
|--------|---------|
| `trial` | Free 7-day trial (Tree Top access) |
| `active` | Paid subscription active |
| `past_due` | Payment failed, Stripe retrying |
| `cancelled` | Subscription ended |
| `expired` | Trial ended, no subscription |
| `comp` | Complimentary access (admin-granted) |

### Stripe Dashboard Configuration

#### Webhook Setup
- **Endpoint URL**: `https://swingtree.ai/api/stripe-webhook`
- **Events to listen for**:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

#### Customer Portal Settings
Location: Stripe Dashboard → Settings → Billing → Customer Portal

| Setting | Value |
|---------|-------|
| Update payment method | ✅ Enabled |
| Cancel subscription | ✅ Enabled |
| Switch plans | ✅ Enabled (between all 3 tiers) |
| Pause subscription | ❌ Disabled |

### Database Schema (users table - Stripe columns)

```sql
stripe_customer_id VARCHAR     -- Stripe customer ID (cus_...)
stripe_subscription_id VARCHAR -- Stripe subscription ID (sub_...)
subscription_tier VARCHAR      -- 'trial', 'baseline', 'all_court', 'tree_top', 'expired'
subscription_status VARCHAR    -- 'trial', 'active', 'past_due', 'cancelled', 'expired', 'comp'
```

### Database Schema (subscription_limits table)

```sql
id SERIAL PRIMARY KEY
total_cap INTEGER DEFAULT 3000
current_total INTEGER DEFAULT 0
```

---

## Stripe Test Cases

### Test Cards

| Card Number | Result |
|-------------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0341` | Attach succeeds, charge fails |
| `4000 0000 0000 9995` | Immediate decline |
| `4000 0025 0000 3155` | Requires 3D Secure |

Use any future expiry date and any 3-digit CVC.

### Test Scenarios

#### TC-01: New User Subscribes to Baseline
**Preconditions**: User on trial, no prior subscription
**Steps**:
1. Log in to swingtree.ai
2. Click "Subscribe" in main menu
3. Click "Subscribe" on Baseline tier ($29)
4. Complete Stripe Checkout with card `4242 4242 4242 4242`
5. Get redirected to `/main?subscription=success`

**Expected Results**:
- [ ] Checkout redirects to Stripe-hosted page
- [ ] After payment, redirects back to /main
- [ ] "Processing your subscription..." message appears
- [ ] Message updates to "Welcome to Baseline! Your subscription is active."
- [ ] Database: `subscription_tier = 'baseline'`, `subscription_status = 'active'`
- [ ] Database: `stripe_customer_id` and `stripe_subscription_id` populated
- [ ] Main menu shows "Manage" instead of "Subscribe"

#### TC-02: New User Subscribes to All-Court
**Preconditions**: User on trial
**Steps**: Same as TC-01 but select All-Court tier

**Expected Results**:
- [ ] Database: `subscription_tier = 'all_court'`
- [ ] User tier displays as "All-Court" in main menu

#### TC-03: New User Subscribes to Tree Top
**Preconditions**: User on trial
**Steps**: Same as TC-01 but select Tree Top tier

**Expected Results**:
- [ ] Database: `subscription_tier = 'tree_top'`
- [ ] User tier displays as "Tree Top" in main menu

#### TC-04: User Cancels Checkout
**Preconditions**: User on trial
**Steps**:
1. Click "Subscribe" in main menu
2. Select any tier
3. On Stripe Checkout page, click back/close or click "←" link
4. Get redirected to `/main?subscription=cancelled`

**Expected Results**:
- [ ] Message appears: "Subscription not completed. You can subscribe anytime."
- [ ] User remains on trial
- [ ] No changes to database

#### TC-05: Active Subscriber Opens Manage Portal
**Preconditions**: User has active subscription
**Steps**:
1. Click "Manage" in main menu

**Expected Results**:
- [ ] Redirects to Stripe Customer Portal
- [ ] Portal shows current subscription
- [ ] Can update payment method
- [ ] Can cancel subscription
- [ ] Can switch to different tier
- [ ] Return URL goes back to /main

#### TC-06: Subscriber Upgrades via Portal
**Preconditions**: User has Baseline subscription
**Steps**:
1. Click "Manage" → Stripe Portal
2. Click "Update plan"
3. Select Tree Top tier
4. Confirm upgrade

**Expected Results**:
- [ ] Webhook `customer.subscription.updated` fires
- [ ] Database: `subscription_tier` updated to `tree_top`
- [ ] User keeps `active` status
- [ ] Prorated charge applied

#### TC-07: Subscriber Downgrades via Portal
**Preconditions**: User has Tree Top subscription
**Steps**:
1. Click "Manage" → Stripe Portal
2. Click "Update plan"
3. Select Baseline tier
4. Confirm downgrade

**Expected Results**:
- [ ] Webhook `customer.subscription.updated` fires
- [ ] Database: `subscription_tier` updated to `baseline`
- [ ] Downgrade takes effect at end of billing period

#### TC-08: Subscriber Cancels Subscription
**Preconditions**: User has active subscription
**Steps**:
1. Click "Manage" → Stripe Portal
2. Click "Cancel subscription"
3. Confirm cancellation

**Expected Results**:
- [ ] Webhook `customer.subscription.deleted` fires
- [ ] Database: `subscription_tier = 'expired'`, `subscription_status = 'cancelled'`
- [ ] `subscription_limits.current_total` decremented by 1
- [ ] Access continues until end of billing period

#### TC-09: Payment Fails
**Preconditions**: Active subscriber
**Steps** (simulated in Stripe Dashboard or test clock):
1. In Stripe Dashboard, fail an invoice payment

**Expected Results**:
- [ ] Webhook `invoice.payment_failed` fires
- [ ] Database: `subscription_status = 'past_due'`
- [ ] User still has access (grace period)
- [ ] Warning banner appears: "Your payment failed. Update payment method."

#### TC-10: Comp User Cannot Subscribe
**Preconditions**: User has `subscription_status = 'comp'`
**Steps**:
1. User somehow opens subscription modal

**Expected Results**:
- [ ] Modal shows "Complimentary Access" message
- [ ] No subscribe buttons shown
- [ ] "Continue" button closes modal

#### TC-11: Already Subscribed User Tries to Subscribe Again
**Preconditions**: User has active subscription
**Steps**:
1. Call `POST /api/stripe-checkout` directly

**Expected Results**:
- [ ] Returns error with `redirect: 'portal'`
- [ ] Message: "You already have an active subscription."

#### TC-12: Cap Reached - New Subscriptions Blocked
**Preconditions**: `subscription_limits.current_total >= total_cap`
**Steps**:
1. User opens subscription modal
2. Try to subscribe

**Expected Results**:
- [ ] Buttons show "Waitlist" instead of "Subscribe"
- [ ] Message: "0 spots remaining. Join waitlist"
- [ ] `/api/stripe-checkout` returns 403 error

#### TC-13: Duplicate Webhook (Idempotency)
**Preconditions**: None
**Steps**:
1. Stripe sends `checkout.session.completed` twice for same session

**Expected Results**:
- [ ] First webhook updates user normally
- [ ] Second webhook skips (no duplicate counter increment)
- [ ] `subscription_limits.current_total` only increments once

#### TC-14: Webhook Signature Verification
**Preconditions**: None
**Steps**:
1. Send POST to `/api/stripe-webhook` with invalid signature

**Expected Results**:
- [ ] Returns 400 "Invalid signature"
- [ ] No database changes

#### TC-15: Trial User Subscribes Early
**Preconditions**: User on trial with days remaining
**Steps**:
1. Click "Subscribe" (available via modal or menu)
2. Complete checkout

**Expected Results**:
- [ ] Subscription created successfully
- [ ] User upgraded from trial to paid immediately
- [ ] Trial access transitions to paid tier access

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (frontend + Netlify functions)
netlify dev

# Build for production
npm run build
```

### Testing Webhooks Locally

Use Stripe CLI to forward webhooks:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local dev
stripe listen --forward-to localhost:8888/api/stripe-webhook

# Note the webhook signing secret (whsec_...) and add to .env
```

---

## Deployment

Push to `main` branch triggers Netlify auto-deploy.

Production URL: https://swingtree.ai

---

## Key Files

### Stripe Functions
- `netlify/functions/stripe-checkout.ts` - Creates checkout sessions
- `netlify/functions/stripe-webhook.ts` - Handles Stripe events
- `netlify/functions/stripe-portal.ts` - Creates portal sessions
- `netlify/functions/subscription-limits.ts` - Returns remaining spots

### Frontend
- `src/components/SubscriptionModal.tsx` - Tier selection and checkout
- `src/pages/MainMenu.tsx` - Subscribe/Manage buttons, notifications
- `src/context/AuthContext.tsx` - User state, subscription helpers

### Auth
- `netlify/functions/auth-callback.ts` - OAuth callback, user creation
- `netlify/functions/auth-session.ts` - Session verification
- `netlify/functions/auth-utils.ts` - JWT, cookies, helpers
