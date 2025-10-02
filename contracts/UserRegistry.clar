;; UserRegistry.clar
;; Sophisticated User Registry for Crisis Tracking System
;; This contract serves as the core registry for citizens abroad, handling registration,
;; profile management, verification, consent for data sharing, status updates, and auditing.
;; It ensures robustness with access controls, error handling, and immutable logging.
;; Designed for integration with other contracts like TravelLog and CrisisManager.

;; Constants
(define-constant ERR-ALREADY-REGISTERED u100)
(define-constant ERR-NOT-REGISTERED u101)
(define-constant ERR-UNAUTHORIZED u102)
(define-constant ERR-INVALID-INPUT u103)
(define-constant ERR-NOT-VERIFIED u104)
(define-constant ERR-ALREADY-VERIFIED u105)
(define-constant ERR-PAUSED u106)
(define-constant ERR-INVALID-STATUS u107)
(define-constant ERR-MAX-FIELD-LENGTH u108)

(define-constant MAX-STRING-LEN u100)
(define-constant MAX-CONTACT-LEN u200)
(define-constant MAX-TAGS u5)

;; Data Variables
(define-data-var contract-admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var registration-counter uint u0)

;; Data Maps
(define-map users 
  principal 
  {
    id: (string-ascii 50),
    nationality: (string-ascii 50),
    full-name: (optional (string-utf8 100)),
    contact-email: (optional (string-ascii 100)),
    contact-phone: (optional (string-ascii 50)),
    emergency-contact: (optional (string-utf8 200)),
    registered-at: uint,
    last-updated: uint,
    verified: bool,
    verifier: (optional principal),
    status: (string-ascii 20),  ;; e.g., "active", "inactive", "in-crisis"
    consent-data-sharing: bool,
    tags: (list 5 (string-ascii 20))  ;; e.g., "traveler", "expat"
  }
)

(define-map authorities principal bool)  ;; Authorized verifiers/admins

(define-map audit-logs 
  uint 
  {
    actor: principal,
    action: (string-ascii 100),
    target-user: (optional principal),
    timestamp: uint,
    details: (optional (string-utf8 200))
  }
)

;; Private Functions
(define-private (log-action (action (string-ascii 100)) (target (optional principal)) (details (optional (string-utf8 200))))
  (let ((log-id (var-get registration-counter)))
    (map-set audit-logs log-id 
      {
        actor: tx-sender,
        action: action,
        target-user: target,
        timestamp: block-height,
        details: details
      }
    )
    (var-set registration-counter (+ log-id u1))
    (ok log-id)
  )
)

(define-private (is-admin (caller principal))
  (or (is-eq caller (var-get contract-admin)) (default-to false (map-get? authorities caller)))
)

(define-private (validate-string (str (string-ascii 100)) (max-len uint))
  (and (> (len str) u0) (<= (len str) max-len))
)

;; Public Functions
(define-public (register-user 
  (id (string-ascii 50)) 
  (nationality (string-ascii 50))
  (full-name (optional (string-utf8 100)))
  (contact-email (optional (string-ascii 100)))
  (contact-phone (optional (string-ascii 50)))
  (emergency-contact (optional (string-utf8 200)))
  (tags (list 5 (string-ascii 20))))
  (begin
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (is-none (map-get? users tx-sender)) (err ERR-ALREADY-REGISTERED))
    (asserts! (validate-string id MAX-STRING-LEN) (err ERR-INVALID-INPUT))
    (asserts! (validate-string nationality MAX-STRING-LEN) (err ERR-INVALID-INPUT))
    (map-set users tx-sender 
      {
        id: id,
        nationality: nationality,
        full-name: full-name,
        contact-email: contact-email,
        contact-phone: contact-phone,
        emergency-contact: emergency-contact,
        registered-at: block-height,
        last-updated: block-height,
        verified: false,
        verifier: none,
        status: "active",
        consent-data-sharing: false,
        tags: tags
      }
    )
    (try! (log-action "register-user" (some tx-sender) none))
    (ok true)
  )
)

(define-public (update-profile 
  (full-name (optional (string-utf8 100)))
  (contact-email (optional (string-ascii 100)))
  (contact-phone (optional (string-ascii 50)))
  (emergency-contact (optional (string-utf8 200)))
  (tags (list 5 (string-ascii 20))))
  (let ((user-profile (unwrap! (map-get? users tx-sender) (err ERR-NOT-REGISTERED))))
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (map-set users tx-sender 
      (merge user-profile 
        {
          full-name: full-name,
          contact-email: contact-email,
          contact-phone: contact-phone,
          emergency-contact: emergency-contact,
          last-updated: block-height,
          tags: tags
        }
      )
    )
    (try! (log-action "update-profile" (some tx-sender) none))
    (ok true)
  )
)

(define-public (set-consent (consent bool))
  (let ((user-profile (unwrap! (map-get? users tx-sender) (err ERR-NOT-REGISTERED))))
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (map-set users tx-sender 
      (merge user-profile { consent-data-sharing: consent, last-updated: block-height })
    )
    (try! (log-action "set-consent" (some tx-sender) (some (if consent "granted" "revoked"))))
    (ok true)
  )
)

(define-public (update-status (new-status (string-ascii 20)))
  (let ((user-profile (unwrap! (map-get? users tx-sender) (err ERR-NOT-REGISTERED))))
    (asserts! (not (var-get paused)) (err ERR-PAUSED))
    (asserts! (or (is-eq new-status "active") (is-eq new-status "inactive") (is-eq new-status "in-crisis")) (err ERR-INVALID-STATUS))
    (map-set users tx-sender 
      (merge user-profile { status: new-status, last-updated: block-height })
    )
    (try! (log-action "update-status" (some tx-sender) (some new-status)))
    (ok true)
  )
)

(define-public (verify-user (user principal))
  (let ((user-profile (unwrap! (map-get? users user) (err ERR-NOT-REGISTERED))))
    (asserts! (is-admin tx-sender) (err ERR-UNAUTHORIZED))
    (asserts! (not (get verified user-profile)) (err ERR-ALREADY-VERIFIED))
    (map-set users user 
      (merge user-profile 
        {
          verified: true,
          verifier: (some tx-sender),
          last-updated: block-height
        }
      )
    )
    (try! (log-action "verify-user" (some user) none))
    (ok true)
  )
)

(define-public (add-authority (auth principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) (err ERR-UNAUTHORIZED))
    (map-set authorities auth true)
    (try! (log-action "add-authority" (some auth) none))
    (ok true)
  )
)

(define-public (remove-authority (auth principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) (err ERR-UNAUTHORIZED))
    (map-set authorities auth false)
    (try! (log-action "remove-authority" (some auth) none))
    (ok true)
  )
)

(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) (err ERR-UNAUTHORIZED))
    (var-set paused true)
    (try! (log-action "pause-contract" none none))
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) (err ERR-UNAUTHORIZED))
    (var-set paused false)
    (try! (log-action "unpause-contract" none none))
    (ok true)
  )
)

(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) (err ERR-UNAUTHORIZED))
    (var-set contract-admin new-admin)
    (try! (log-action "transfer-admin" (some new-admin) none))
    (ok true)
  )
)

;; Read-Only Functions
(define-read-only (get-user (user principal))
  (map-get? users user)
)

(define-read-only (is-registered (user principal))
  (is-some (map-get? users user))
)

(define-read-only (is-user-verified (user principal))
  (match (map-get? users user)
    profile (get verified profile)
    false
  )
)

(define-read-only (has-consent (user principal))
  (match (map-get? users user)
    profile (get consent-data-sharing profile)
    false
  )
)

(define-read-only (get-user-status (user principal))
  (match (map-get? users user)
    profile (get status profile)
    "unknown"
  )
)

(define-read-only (get-audit-log (log-id uint))
  (map-get? audit-logs log-id)
)

(define-read-only (get-registration-count)
  (var-get registration-counter)
)

(define-read-only (is-contract-paused)
  (var-get paused)
)

(define-read-only (get-contract-admin)
  (var-get contract-admin)
)

(define-read-only (is-authority (auth principal))
  (default-to false (map-get? authorities auth))
)