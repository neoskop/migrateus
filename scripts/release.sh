#!/bin/bash
set -e
version=$(pnpm version --no-git-tag-version $1)
pnpm run gv
pnpm run build
version=$version pnpm run update-changelog
pnpm publish
git add -A
git commit -m "chore: release $version"
git tag $version
git push
git push --tags
