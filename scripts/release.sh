#!/bin/bash
set -e
version=$(npm version --no-git-tag-version $1)
npm run gv
npm run build
npm publish
git add -A
git commit -m "chore: release $version"
git tag $version
git push
git push --tags
