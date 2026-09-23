# 🏝️ RentBnB
**RentBnB** is a mobile marketplace application designed to connect tourists and locals with adventure equipment and local experiences. Expanding on the traditional accommodation model, RentBnB specializes in "activity rentals"—ranging from island-hopping boats and scuba gear to canyoneering packages. 

The platform provides a seamless hub to discover, book, and pay for vacation activities while empowering local providers to manage their businesses digitally.

---

## 🚀 Key Features

### For Renters (Tourists & Locals)
* **Smart Search:** Browse available activities by location, price, dates, and group capacity.
* **Detailed Listings:** View high-resolution photos, itineraries, inclusions, and user ratings.
* **Real-Time Booking:** Check live availability and book instantly or send a request.
* **Secure Payments:** Integrated checkout supporting local digital wallets (e.g., GCash).
* In-App Chat: Message hosts directly to coordinate meetups or ask questions.
* **Booking Dashboard:** Manage active trips and receive push notifications.

### For Hosts (Equipment Owners & Guides)
* **Inventory Management:** Create and manage listings, upload photos, and set pricing.
* **Booking Calendar:** Accept or decline requests and manage daily schedules.
* **Earnings Tracker:** Monitor revenue and manage payouts.

---

## 🛠️ Tech Stack

* **Frontend:** HTML, CSS, JavaScript
* **Authentication & Database:** Firebase (Firebase Auth, Firestore / Realtime DB)
* **Media Storage:** Firebase Storage
* **AI Integrations:** * **Google ML Kit:** On-device processing for ID verification and text recognition.
* **Botpress:** Conversational AI for automated customer support.
* **Maps & Location:** Google Maps API

---

## File Structure
```
rentbnb/
│
├── firebase.json                      # Hosting config (public dir, cleanUrls, rewrites)
├── .firebaserc                        # Firebase project aliases (dev / production)
├── firestore.rules                    # Story 1.2 — security rules (kept in version control!)
├── firestore.indexes.json             # Story 2.1 — composite indexes for search filters
├── storage.rules                      # Story 1.2 — listing photos & payment-proof access rules
├── .gitignore
├── README.md
│
├── docs/
│   └── data-model.md                  # Story 1.1 — schema doc for the 8 existing collections
│                                      #   (bookings, chatRooms, islands, listings,
│                                      #    notifications, payments, reviews, users)
│
├── tests/
│   ├── rules/                         # Emulator Suite rule tests (Stories 1.2, 7.1)
│   └── e2e-checklist.md               # Story 7.1 — Search → Book → Proof → Approve → Chat → Review
│
└── public/                            # ← WEB ROOT (deployed to Firebase Hosting)
    │
    ├── index.html                     # Landing page = search + results grid (Story 2.1)
    ├── 404.html
    │
    ├── pages/
    │   ├── auth/
    │   │   ├── login.html             # Story 1.3
    │   │   └── signup.html            # Story 1.3 (creates users doc with role)
    │   │
    │   ├── listing-detail.html        # Story 2.2 (+ reviews display, Story 2.3)
    │   ├── create-listing.html        # Story 3.1 (also reused for edit, Story 3.2)
    │   ├── checkout.html              # Story 5.1 — total, host payment instructions,
    │   │                              #   payment-proof upload
    │   ├── booking-detail.html        # Stories 4.1 / 5.1 — status timeline,
    │   │                              #   re-upload proof if rejected
    │   ├── trips.html                 # Story 6.1 — renter dashboard
    │   ├── chat.html                  # Story 5.3
    │   ├── notifications.html         # Story 6.3
    │   ├── profile.html               # User settings + host's payment instructions
    │   │                              #   (GCash number — transfer happens off-platform)
    │   └── host/
    │       ├── dashboard.html         # Story 3.2 — inventory list
    │       ├── calendar.html          # Story 4.2 — accept/decline requests
    │       ├── payments.html          # Story 5.2 — proof approval queue
    │       └── earnings.html          # Story 6.2
    │
    ├── css/
    │   ├── global.css                 # Reset, CSS variables, typography, layout
    │   ├── components.css             # Buttons, cards, modals, badges, form fields
    │   ├── auth.css
    │   ├── listing.css                # Search grid + detail page
    │   ├── booking.css                # Checkout + booking detail
    │   ├── chat.css
    │   └── dashboard.css              # Host dashboards + trips
    │
    ├── js/
    │   ├── firebase-init.js           # SDK init — exports auth, db, storage instances
    │   ├── app.js                     # Global boot: auth guard, navbar injection, toasts
    │   │
    │   ├── config/
    │   │   └── constants.js           # Collection names, roles, and the status
    │   │                              #   lifecycles (booking + payment) so frontend
    │   │                              #   matches docs/data-model.md exactly
    │   │
    │   ├── services/                  # ★ THE "BACKEND REPLACEMENT" — the ONLY code
    │   │   │                          #   allowed to touch Firestore/Storage
    │   │   ├── auth-service.js        # Story 1.3
    │   │   ├── user-service.js
    │   │   ├── island-service.js      # Populates location dropdown (Story 2.1)
    │   │   ├── listing-service.js     # Stories 2.1, 2.2, 3.1, 3.2
    │   │   ├── booking-service.js     # Stories 4.1, 4.2 + date-conflict queries
    │   │   ├── payment-service.js     # Stories 5.1, 5.2
    │   │   ├── chat-service.js        # Story 5.3 (onSnapshot listeners)
    │   │   ├── review-service.js      # Stories 2.3, 6.1
    │   │   ├── notification-service.js # Story 6.3 + shared create-notification helper
    │   │   └── storage-service.js     # Uploads: listing photos (3.1), proofs (5.1)
    │   │
    │   ├── utils/
    │   │   ├── date-utils.js          # Availability conflict checks (Story 4.1)
    │   │   ├── format-utils.js        # ₱ currency, date formatting
    │   │   ├── validators.js          # Proof file type/size validation (Story 5.1)
    │   │   └── dom-utils.js           # Element builders, query helpers
    │   │
    │   ├── components/                # Reusable, self-contained UI pieces
    │   │   ├── navbar.js              # Injected on every page + notifications bell (6.3)
    │   │   ├── listing-card.js        # Search result card (Story 2.1)
    │   │   ├── date-picker.js         # Story 4.1
    │   │   ├── calendar-grid.js       # Story 4.2
    │   │   ├── image-uploader.js      # Stories 3.1 & 5.1 (preview → validate → upload)
    │   │   ├── chat-thread.js         # Story 5.3
    │   │   ├── rating-stars.js        # Story 2.3
    │   │   └── modal.js               # Full-size proof viewer (Story 5.2)
    │   │
    │   └── pages/                     # One controller per HTML page
    │       ├── auth-login.js
    │       ├── auth-signup.js
    │       ├── search.js              # Controls index.html
    │       ├── listing-detail.js
    │       ├── create-listing.js
    │       ├── checkout.js
    │       ├── booking-detail.js
    │       ├── trips.js
    │       ├── chat.js
    │       ├── notifications.js
    │       ├── profile.js
    │       ├── host-dashboard.js
    │       ├── host-calendar.js
    │       ├── host-payments.js
    │       └── earnings.js
    │
    └── assets/
        ├── images/
        │   ├── logo.svg
        │   └── placeholder-listing.png
        └── icons/                     # SVG icons (bell, chat, calendar, camera…)

```
