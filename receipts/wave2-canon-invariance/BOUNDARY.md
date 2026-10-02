# BOUNDARY NOTE (harvest-pass, post-seal)
The translation control is DEGENERATE with the rotation arm under periodic
boundary conditions: on a ring, shifting by k IS rotating by k (verified —
naive shift-by-1 and rotate-by-1 tails are bit-identical: 320ce8f761c66ac3).
The control therefore re-tests the naive-rotation arm rather than an
independent path. The canon-invariance claim does not depend on it (invariance
holds across three distinct rotation offsets per seed, 6000/6000 rows).
A non-independent control would require fixed (non-periodic) boundaries —
wave-3 item. Sealed here so the receipt carries its own limit.
