;; access-control.clar

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-AUTHORITY u101)
(define-constant ERR-INVALID-CRISIS-ID u102)
(define-constant ERR-INVALID-GRANT-DURATION u103)
(define-constant ERR-INVALID-PERMISSION-TYPE u104)
(define-constant ERR-PERMISSION-ALREADY-EXISTS u105)
(define-constant ERR-PERMISSION-NOT-FOUND u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u108)
(define-constant ERR-INVALID-USER u109)
(define-constant ERR-INVALID-EXPIRY u110)
(define-constant ERR-PERMISSION-EXPIRED u111)
(define-constant ERR-INVALID-UPDATE-PARAM u112)
(define-constant ERR-MAX-PERMISSIONS-EXCEEDED u113)
(define-constant ERR-INVALID-PERMISSION-LEVEL u114)
(define-constant ERR-INVALID-LOCATION u115)
(define-constant ERR-INVALID-STATUS u116)
(define-constant ERR-INVALID-SCOPE u117)
(define-constant ERR-INVALID-ROLE u118)
(define-constant ERR-ROLE-ALREADY-ASSIGNED u119)
(define-constant ERR-ROLE-NOT-FOUND u120)

(define-data-var next-permission-id uint u0)
(define-data-var max-permissions uint u10000)
(define-data-var authority-contract (optional principal) none)
(define-data-var permission-fee uint u500)

(define-map permissions
  uint
  {
    user: principal,
    authority: principal,
    granted: bool,
    crisis-id: (optional uint),
    timestamp: uint,
    expiry: (optional uint),
    permission-type: (string-utf8 50),
    scope: (string-utf8 100),
    level: uint,
    location: (string-utf8 100),
    status: bool
  }
)

(define-map permissions-by-user-authority
  { user: principal, authority: principal }
  uint
)

(define-map permission-updates
  uint
  {
    update-granted: bool,
    update-crisis-id: (optional uint),
    update-timestamp: uint,
    updater: principal,
    update-expiry: (optional uint)
  }
)

(define-map roles
  { principal: principal, role: (string-utf8 50) }
  bool
)

(define-read-only (get-permission (id uint))
  (map-get? permissions id)
)

(define-read-only (get-permission-updates (id uint))
  (map-get? permission-updates id)
)

(define-read-only (has-permission (user principal) (authority principal))
  (is-some (map-get? permissions-by-user-authority { user: user, authority: authority }))
)

(define-read-only (get-role (p principal) (role (string-utf8 50)))
  (map-get? roles { principal: p, role: role })
)

(define-private (validate-authority (auth principal))
  (if (not (is-eq auth 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-AUTHORITY))
)

(define-private (validate-crisis-id (id (optional uint)))
  (ok true)
)

(define-private (validate-grant-duration (dur uint))
  (if (> dur u0)
      (ok true)
      (err ERR-INVALID-GRANT-DURATION))
)

(define-private (validate-permission-type (ptype (string-utf8 50)))
  (if (or (is-eq ptype "read") (is-eq ptype "write") (is-eq ptype "admin"))
      (ok true)
      (err ERR-INVALID-PERMISSION-TYPE))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-user (user principal))
  (if (not (is-eq user 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-USER))
)

(define-private (validate-expiry (exp (optional uint)))
  (ok true)
)

(define-private (validate-level (lvl uint))
  (if (<= lvl u10)
      (ok true)
      (err ERR-INVALID-PERMISSION-LEVEL))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-scope (sc (string-utf8 100)))
  (if (and (> (len sc) u0) (<= (len sc) u100))
      (ok true)
      (err ERR-INVALID-SCOPE))
)

(define-private (validate-role (role (string-utf8 50)))
  (if (or (is-eq role "admin") (is-eq role "moderator") (is-eq role "user"))
      (ok true)
      (err ERR-INVALID-ROLE))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-authority contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-permissions (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-permissions new-max)
    (ok true)
  )
)

(define-public (set-permission-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set permission-fee new-fee)
    (ok true)
  )
)

(define-public (grant-access
  (authority principal)
  (crisis-id (optional uint))
  (expiry (optional uint))
  (permission-type (string-utf8 50))
  (scope (string-utf8 100))
  (level uint)
  (location (string-utf8 100))
)
  (let (
        (next-id (var-get next-permission-id))
        (current-max (var-get max-permissions))
        (auth-contract (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-PERMISSIONS-EXCEEDED))
    (try! (validate-authority authority))
    (try! (validate-crisis-id crisis-id))
    (try! (validate-expiry expiry))
    (try! (validate-permission-type permission-type))
    (try! (validate-scope scope))
    (try! (validate-level level))
    (try! (validate-location location))
    (try! (validate-user tx-sender))
    (asserts! (is-none (map-get? permissions-by-user-authority { user: tx-sender, authority: authority })) (err ERR-PERMISSION-ALREADY-EXISTS))
    (let ((auth-recipient (unwrap! auth-contract (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get permission-fee) tx-sender auth-recipient))
    )
    (map-set permissions next-id
      {
        user: tx-sender,
        authority: authority,
        granted: true,
        crisis-id: crisis-id,
        timestamp: block-height,
        expiry: expiry,
        permission-type: permission-type,
        scope: scope,
        level: level,
        location: location,
        status: true
      }
    )
    (map-set permissions-by-user-authority { user: tx-sender, authority: authority } next-id)
    (var-set next-permission-id (+ next-id u1))
    (print { event: "access-granted", id: next-id })
    (ok next-id)
  )
)

(define-public (revoke-access (authority principal))
  (let ((perm-id (map-get? permissions-by-user-authority { user: tx-sender, authority: authority })))
    (match perm-id
      id
        (let ((perm (unwrap! (map-get? permissions id) (err ERR-PERMISSION-NOT-FOUND))))
          (asserts! (is-eq (get user perm) tx-sender) (err ERR-NOT-AUTHORIZED))
          (map-set permissions id (merge perm { granted: false, status: false }))
          (map-delete permissions-by-user-authority { user: tx-sender, authority: authority })
          (print { event: "access-revoked", id: id })
          (ok true)
        )
      (err ERR-PERMISSION-NOT-FOUND)
    )
  )
)

(define-public (update-permission
  (perm-id uint)
  (update-granted bool)
  (update-crisis-id (optional uint))
  (update-expiry (optional uint))
)
  (let ((perm (map-get? permissions perm-id)))
    (match perm
      p
        (begin
          (asserts! (is-eq (get user p) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-crisis-id update-crisis-id))
          (try! (validate-expiry update-expiry))
          (map-set permissions perm-id
            (merge p {
              granted: update-granted,
              crisis-id: update-crisis-id,
              timestamp: block-height,
              expiry: update-expiry
            })
          )
          (map-set permission-updates perm-id
            {
              update-granted: update-granted,
              update-crisis-id: update-crisis-id,
              update-timestamp: block-height,
              updater: tx-sender,
              update-expiry: update-expiry
            }
          )
          (print { event: "permission-updated", id: perm-id })
          (ok true)
        )
      (err ERR-PERMISSION-NOT-FOUND)
    )
  )
)

(define-public (assign-role (target principal) (role (string-utf8 50)))
  (begin
    (try! (validate-role role))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (asserts! (is-none (map-get? roles { principal: target, role: role })) (err ERR-ROLE-ALREADY-ASSIGNED))
    (map-set roles { principal: target, role: role } true)
    (print { event: "role-assigned", target: target, role: role })
    (ok true)
  )
)

(define-public (revoke-role (target principal) (role (string-utf8 50)))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (asserts! (is-some (map-get? roles { principal: target, role: role })) (err ERR-ROLE-NOT-FOUND))
    (map-delete roles { principal: target, role: role })
    (print { event: "role-revoked", target: target, role: role })
    (ok true)
  )
)

(define-read-only (has-access (user principal) (authority principal))
  (let ((perm-id (default-to u0 (map-get? permissions-by-user-authority { user: user, authority: authority }))))
    (let ((perm (default-to { granted: false, crisis-id: none, expiry: none, status: false } (map-get? permissions perm-id))))
      (and (get granted perm)
           (get status perm)
           (match (get expiry perm)
             some-exp (if (<= some-exp block-height) false true)
             true)
           (match (get crisis-id perm)
             some-id true
             true))
    )
  )
)

(define-public (get-permission-count)
  (ok (var-get next-permission-id))
)

(define-public (check-permission-existence (user principal) (authority principal))
  (ok (has-permission user authority))
)