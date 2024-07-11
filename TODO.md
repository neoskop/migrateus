# Things To Do

- [ ] Add Option for MySQL Image (Currently `bitnami/mysql:5.7.43`)
- [ ] Honor `doubleCheck` flag of environments
- [ ] Simplify dialogs in Schema-Diff:
  - [ ] If a new Relation is declined, don't ask for its fields
  - [ ] Better output for details (not just `console.dir` of the JSON)
- [ ] Compare versions before performing actual schema diff
- [ ] Add spinner / progress bar for all steps (not only the asset operations) when `-v` is not set
