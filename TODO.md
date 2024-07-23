# Things To Do

- [ ] Allow specification of Kubeconfig per k8s environment
- [ ] Ensure Directus container is running when restoring DB
- [ ] Simplify dialogs in Schema-Diff:
  - [ ] If a new Relation is declined, don't ask for its fields
  - [ ] Better output for details (not just `console.dir` of the JSON)
- [ ] Show kubelogin URLs to end user
- [ ] Use `ora` in schema diffs?!
- [ ] Add `clean-all` command to clean all envs sequentially
- [ ] Save Directus version when performing a backup to a meta data file in the archive
      and compare that to the server when restoring (asking for confirmation or warning)
