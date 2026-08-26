---
status: accepted
---

# Derive Build Numbers From the CI Run Number

Settings' Technical Information block shows a `Build Number`, and
`android.versionCode` / `ios.buildNumber` need a real, monotonically
increasing source to populate it from.

`GITHUB_RUN_NUMBER`, with a local fallback for a build run outside CI, was
adopted as that source.

Two alternatives were rejected. Commit count via `git rev-list --count HEAD`
was rejected because it collides across branches — two branches built from
diverging history can produce the same count — and because it is wrong under
CI's default shallow clone, which does not have the full commit history to
count in the first place. Hand-editing `app.json`'s version fields per
release was rejected because it depends on a human remembering to do it every
time, and the failure mode is a store rejecting the build after the fact
rather than anything catching the omission earlier.

The build number is now tied to CI's own numbering rather than to anything in
the repository's history, so it is monotonic only as long as CI's run counter
is; a run number reused or reset by a change to the CI configuration would
carry through to a duplicate or non-increasing build number.
