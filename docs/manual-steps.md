# One-Time Manual Steps

What to set up by hand on GitHub after the first push. Release details are in [release.md](release.md).

- [ ] **Repository:** create or connect the `Jaydee94/rps-arena` repository on GitHub and push `main`.
- [ ] **Renovate:** grant the Renovate GitHub App access to the repository. It reads the existing `renovate.json`
  and then opens the update PRs.
- [ ] **Merge settings** (Settings → General → Pull Requests): allow only *Squash merging* and choose "Pull
  request title" as the commit message. Disable merge commits and rebase merging.
- [ ] **Auto-merge:** allow it (Settings → General → Pull Requests → *Allow auto-merge*). Renovate uses
  `platformAutomerge` and needs it.
- [ ] **Open the first pull request** (for example a small docs change) so that `ci.yml` and `pr-title.yml` run
  once. GitHub only offers status checks in branch protection after they have run.
- [ ] **Branch protection** for `main` (Settings → Branches or Rulesets), after the first PR: require a pull
  request and these status checks (job names): `test`, `e2e`, `image`, `chart`, `renovate-config` (from
  `ci.yml`) and `pr-title` (from `pr-title.yml`). Renovate automerge then waits for green checks. No exception for
  a release bot is needed, because nothing is written back to `main`.
- [ ] **Actions permissions** (Settings → Actions → General → Workflow permissions): the workflows request their
  permissions via `permissions:` (`contents: write`, `packages: write`, `issues: write`, `pull-requests: write`
  in the release job). No org or repo setting may cap these, so `GITHUB_TOKEN` can create tags, releases and
  packages. Tag rulesets, if any, must let GitHub Actions create `v*` tags.
- [ ] **GHCR packages:** after the first publish there are two packages, `rps-arena` (image) and
  `charts/rps-arena` (chart). New GHCR packages are private. If wanted, make them public under *Package settings*
  (then `helm install` and `docker pull` need no login), link each package to the repository (*Connect
  repository*) and give the repository write access for Actions (*Manage Actions access*). The image carries the
  label `org.opencontainers.image.source`; check the chart package.
- [ ] **First release:** the first push to `main` with `feat` commits produces `1.0.0` and publishes image and
  chart with no manual step. If publishing fails anyway, start the manual run with `first_publish = true` (see
  [release.md](release.md#first-publish)).
