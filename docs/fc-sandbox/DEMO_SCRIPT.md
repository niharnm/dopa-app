# Three-minute demo script

## 0:00-0:20 - Product and scenario

"Dopa helps performance marketers decide whether an ad is worth spending on.
Scoring is compute-heavy, but approval can take minutes or hours, so this is a
natural execute-wait-execute workflow."

Open `/demo`. Point to the evidence badge before clicking. If it says local
demonstration, say it is a UI rehearsal and do not present it as Alibaba proof.

## 0:20-0:55 - Execute

Click **Start FC sandbox run**. As the durable stage advances, show the trace ID
and events:

- sandbox/session and dynamic mount created;
- sample creative validated;
- versioned checkpoint written;
- approval requested.

## 0:55-1:25 - Hibernate

Show the authoritative `PAUSED` state, snapshot ID evidence, hibernation clock,
and checkpoint SHA-256. Explain that the browser timer does not poll or keep the
sandbox alive. The external human decision is the waiting event.

## 1:25-1:55 - Wake and continue

Click **Approve & resume** once. Show that the nonce is consumed before the
provider call, the checkpoint and dynamic-mount digests match after resume, and
only then does TRIBE v2 run.

## 1:55-2:20 - Result

Show the prediction, exact model version, GPU processing time, recommendation,
cleanup event, active duration, hibernated duration, and wake latency. State
whether this is a live TRIBE result or an illustrative fixture exactly as
labeled.

## 2:20-2:45 - Core capability evidence

Open `/fc-proof`. Show sources/digests/timestamps for live green rows. Summarize
the isolation, elasticity, E2B, session, hibernation, and SLS evidence. Do not
claim pending rows.

## 2:45-3:00 - Cost and production path

Show the current bill-backed wait-cost comparison and the SLS debugging story.
Close with the reusable provider boundary: new tools or models do not rewrite
the approval, checkpoint, hibernation, security, or trace flow.

## Recording checklist

- Public URL opens in a private browser without login or deployment protection.
- Browser console has no errors and the mobile layout is legible.
- Live run finishes once; failure drill is available as a backup recording.
- Video link permissions are tested from a signed-out browser.
- One-sentence description and submission form are ready before 3:55 PM.
